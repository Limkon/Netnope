// storage.js - 数据持久化逻辑 (读写JSON文件, 密码加密)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const ARTICLES_FILE = path.join(DATA_DIR, 'articles.json'); // 重命名
const COMMENTS_FILE = path.join(DATA_DIR, 'comments.json'); // 新增
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json'); // 新增：站点设置
const UPLOADS_DIR = path.join(__dirname, 'uploads');

const HASH_ITERATIONS = 100000;
const HASH_KEYLEN = 64;
const HASH_DIGEST = 'sha512';
const SALT_LEN = 16;

// 默认设置
const DEFAULT_SETTINGS = {
    articlesPerPage: 10
};

function generateSalt() {
    return crypto.randomBytes(SALT_LEN).toString('hex');
}

function hashPassword(password, salt) {
    if (!password) return '';
    return crypto.pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_KEYLEN, HASH_DIGEST).toString('hex');
}

function readJsonFile(filePath, defaultValue = []) { // 增加默认值
    try {
        if (!fs.existsSync(filePath)) {
            // 为特定文件创建默认内容
            if (filePath === USERS_FILE || filePath === ARTICLES_FILE || filePath === COMMENTS_FILE) {
                fs.writeFileSync(filePath, '[]', 'utf8');
                return [];
            }
            if (filePath === SETTINGS_FILE) { // 新增
                fs.writeFileSync(filePath, JSON.stringify(DEFAULT_SETTINGS, null, 2), 'utf8');
                return DEFAULT_SETTINGS;
            }
            return defaultValue; 
        }
        const fileContent = fs.readFileSync(filePath, 'utf8');
        // 修复：确保空文件返回默认值
        if (fileContent.trim() === '') {
             if (filePath === SETTINGS_FILE) {
                 fs.writeFileSync(filePath, JSON.stringify(DEFAULT_SETTINGS, null, 2), 'utf8');
                 return DEFAULT_SETTINGS;
             }
             return defaultValue;
        }
        return JSON.parse(fileContent);
    } catch (e) {
        console.error(`读取 JSON 文件 ${filePath} 失败:`, e);
        if (filePath === SETTINGS_FILE) return DEFAULT_SETTINGS; // 修复
        return defaultValue; 
    }
}

function writeJsonFile(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error(`写入 JSON 文件 ${filePath} 失败:`, e);
    }
}

// 辅助函数：删除与特定文章相关的所有评论
function deleteCommentsForArticle(articleId) {
    let comments = readJsonFile(COMMENTS_FILE);
    const initialLength = comments.length;
    comments = comments.filter(c => c.articleId !== articleId);
    if (comments.length < initialLength) {
        writeJsonFile(COMMENTS_FILE, comments);
        console.log(`已删除文章 ${articleId} 的所有评论。`);
    }
}

// 辅助函数：删除特定用户的所有评论
function deleteCommentsForUser(userId) {
    let comments = readJsonFile(COMMENTS_FILE);
    const initialLength = comments.length;
    comments = comments.filter(c => c.userId !== userId);
    if (comments.length < initialLength) {
        writeJsonFile(COMMENTS_FILE, comments);
        console.log(`已删除用户 ${userId} 的所有评论。`);
    }
}

module.exports = {
    UPLOADS_DIR,
    hashPassword,
    generateSalt,

    // --- (新增) 设置函数 ---
    getSettings: () => {
        const settings = readJsonFile(SETTINGS_FILE, DEFAULT_SETTINGS);
        // 确保默认值存在
        return { ...DEFAULT_SETTINGS, ...settings };
    },
    saveSettings: (settings) => {
        const currentSettings = readJsonFile(SETTINGS_FILE, DEFAULT_SETTINGS);
        const newSettings = { ...currentSettings, ...settings };
        // 确保 articlesPerPage 是一个有效的数字
        if (newSettings.articlesPerPage !== undefined) {
             const parsedValue = parseInt(newSettings.articlesPerPage, 10);
             if (isNaN(parsedValue) || parsedValue < 1) {
                 newSettings.articlesPerPage = DEFAULT_SETTINGS.articlesPerPage; // 重置为默认值
             } else {
                 newSettings.articlesPerPage = parsedValue;
             }
        }
        writeJsonFile(SETTINGS_FILE, newSettings);
        return newSettings;
    },
    // --- (新增结束) ---


    getUsers: () => readJsonFile(USERS_FILE),
    saveUser: (userData) => {
        const users = readJsonFile(USERS_FILE);
        let userToSave = { ...userData };
        let isUpdating = false;

        if (userToSave.id) {
            const existingUserIndex = users.findIndex(u => u.id === userToSave.id);
            if (existingUserIndex > -1) {
                isUpdating = true;
                const existingUser = users[existingUserIndex];
                userToSave = { ...existingUser, ...userToSave };
            }
        }

        const conflictingUser = users.find(u => u.username === userToSave.username && u.id !== userToSave.id);
        if (conflictingUser && userToSave.username !== 'anyone') {
            console.error(`保存用户错误：用户名 "${userToSave.username}" 已被用户 ID "${conflictingUser.id}" 使用。`);
            return null;
        }

        if (userToSave.username === 'anyone') {
            userToSave.role = 'anonymous';
            delete userToSave.password;
            userToSave.salt = null;
            userToSave.hashedPassword = null;
        } else if (userData.hasOwnProperty('password')) {
            if (!userToSave.salt && !isUpdating) {
                userToSave.salt = generateSalt();
            } else if (!userToSave.salt && isUpdating && userData.password !== undefined) {
                userToSave.salt = generateSalt();
            }
            if (userToSave.salt) {
                 userToSave.hashedPassword = userData.password ? hashPassword(userData.password, userToSave.salt) : '';
            } else if (userData.password === '') {
                 userToSave.hashedPassword = '';
            }
            delete userToSave.password;
        }

        if (!userToSave.id) {
            userToSave.id = (userToSave.username === 'anyone') ?
                            `user_anyone_${Date.now()}` :
                            `user_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        }
        
        const existingIndexById = users.findIndex(u => u.id === userToSave.id);

        if (existingIndexById > -1) {
            users[existingIndexById] = userToSave;
        } else {
            users.push(userToSave);
        }
        writeJsonFile(USERS_FILE, users);
        const { salt, hashedPassword, ...safeUser } = userToSave;
        return safeUser;
    },
    findUserByUsername: (username) => {
        const user = readJsonFile(USERS_FILE).find(u => u.username === username);
        return user || null;
    },
    findUserById: (id) => {
        const user = readJsonFile(USERS_FILE).find(u => u.id === id);
        return user || null;
    },
    deleteUser: (userId) => {
        let users = readJsonFile(USERS_FILE);
        const initialLength = users.length;
        users = users.filter(u => u.id !== userId);
        if (users.length < initialLength) {
            writeJsonFile(USERS_FILE, users);
            
            // 删除该用户的文章和附件
            let articles = readJsonFile(ARTICLES_FILE);
            const userArticles = articles.filter(article => article.userId === userId);
            userArticles.forEach(article => {
                if (article.attachment && article.attachment.path) {
                    const attachmentFullPath = path.join(UPLOADS_DIR, article.attachment.path);
                    if (fs.existsSync(attachmentFullPath)) {
                        try { fs.unlinkSync(attachmentFullPath); }
                        catch (e) { console.error(`删除用户 ${userId} 的附件 ${attachmentFullPath} 失败:`, e); }
                    }
                }
                // 删除该文章的评论
                deleteCommentsForArticle(article.id);
            });
            articles = articles.filter(article => article.userId !== userId);
            writeJsonFile(ARTICLES_FILE, articles);
            
            // 删除该用户的评论
            deleteCommentsForUser(userId);

            // 删除该用户的上传目录
            const userUploadDir = path.join(UPLOADS_DIR, userId);
            if (fs.existsSync(userUploadDir)) {
                try { fs.rmSync(userUploadDir, { recursive: true, force: true }); }
                catch(e) { console.error(`删除用户 ${userId} 的上传目录 ${userUploadDir} 失败:`, e); }
            }
            return true;
        }
        return false;
    },

    // --- 文章 (Article) 函数 ---
    getArticles: () => readJsonFile(ARTICLES_FILE),
    saveArticle: (article) => {
        const articles = readJsonFile(ARTICLES_FILE);
        if (!article.id) {
            article.id = `article_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            article.createdAt = new Date().toISOString();
            article.updatedAt = new Date().toISOString();
            // (新增) 确保新文章有 isPinned 属性
            if (article.isPinned === undefined) {
                article.isPinned = false;
            }
            articles.push(article);
        } else {
            const index = articles.findIndex(n => n.id === article.id);
            if (index > -1) {
                // (新增) 确保更新时 isPinned 属性被保留或设置
                const existingArticle = articles[index];
                articles[index] = { 
                    ...existingArticle, 
                    ...article, 
                    updatedAt: new Date().toISOString(),
                    // 确保 isPinned 属性在更新时被正确处理
                    isPinned: (article.isPinned === undefined) ? (existingArticle.isPinned || false) : article.isPinned
                };
            } else {
                return null;
            }
        }
        writeJsonFile(ARTICLES_FILE, articles);
        // (修改) 返回更新后的文章对象
        return articles.find(a => a.id === article.id) || article;
    },
    findArticleById: (id) => readJsonFile(ARTICLES_FILE).find(n => n.id === id),
    deleteArticle: (articleId) => {
        let articles = readJsonFile(ARTICLES_FILE);
        const articleToDelete = articles.find(n => n.id === articleId);
        if (!articleToDelete) return false;
        
        // 1. 删除附件
        if (articleToDelete.attachment && articleToDelete.attachment.path) {
            const attachmentFullPath = path.join(UPLOADS_DIR, articleToDelete.attachment.path);
            if (fs.existsSync(attachmentFullPath)) {
                try { fs.unlinkSync(attachmentFullPath); }
                catch (e) { console.error(`删除附件 ${attachmentFullPath} 失败:`, e); }
            }
        }
        
        // 2. 删除文章的评论
        deleteCommentsForArticle(articleId);

        // 3. 删除文章
        const initialLength = articles.length;
        articles = articles.filter(n => n.id !== articleId);
        if (articles.length < initialLength) {
            writeJsonFile(ARTICLES_FILE, articles);
            return true;
        }
        return false;
    },

    // --- 评论 (Comment) 函数 ---
    getComments: (articleId) => {
        return readJsonFile(COMMENTS_FILE).filter(c => c.articleId === articleId)
               .sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt)); // 按时间升序
    },
    saveComment: (comment) => {
        const comments = readJsonFile(COMMENTS_FILE);
        if (!comment.id) {
            comment.id = `comment_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            comment.createdAt = new Date().toISOString();
            comments.push(comment);
        } else {
            // 评论一般不允许编辑，但保留逻辑以防万一
            const index = comments.findIndex(c => c.id === comment.id);
            if (index > -1) {
                comments[index] = { ...comments[index], ...comment };
            } else {
                return null;
            }
        }
        writeJsonFile(COMMENTS_FILE, comments);
        return comment;
    },
    findCommentById: (id) => readJsonFile(COMMENTS_FILE).find(c => c.id === id),
    deleteComment: (commentId) => {
        let comments = readJsonFile(COMMENTS_FILE);
        const initialLength = comments.length;
        comments = comments.filter(c => c.id !== commentId);
        if (comments.length < initialLength) {
            writeJsonFile(COMMENTS_FILE, comments);
            return true;
        }
        return false;
    }
};
