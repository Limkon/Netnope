// storage.js - 数据持久化与加密层 (Node.js 原生文件系统实现)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const ARTICLES_FILE = path.join(DATA_DIR, 'articles.json'); 
const COMMENTS_FILE = path.join(DATA_DIR, 'comments.json'); 
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json'); 
const TRAFFIC_LOG_FILE = path.join(DATA_DIR, 'traffic.log.jsonl'); 
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// 密码加密参数 (PBKDF2)
const HASH_ITERATIONS = 100000;
const HASH_KEYLEN = 64;
const HASH_DIGEST = 'sha512';
const SALT_LEN = 16;

// 内存常驻统计缓存
let trafficStatsCache = {
    totalViews: 0
};

// 站点默认设置
const DEFAULT_SETTINGS = {
    articlesPerPage: 10
};

// 盐值生成
function generateSalt() {
    return crypto.randomBytes(SALT_LEN).toString('hex');
}

// 密码哈希 (PBKDF2 同步加密)
function hashPassword(password, salt) {
    if (!password) return '';
    return crypto.pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_KEYLEN, HASH_DIGEST).toString('hex');
}

// 安全读取 JSON 文件
function readJsonFile(filePath, defaultValue = []) { 
    try {
        if (!fs.existsSync(filePath)) {
            if (filePath === USERS_FILE || filePath === ARTICLES_FILE || filePath === COMMENTS_FILE) {
                fs.writeFileSync(filePath, '[]', 'utf8');
                return [];
            }
            if (filePath === SETTINGS_FILE) { 
                fs.writeFileSync(filePath, JSON.stringify(DEFAULT_SETTINGS, null, 2), 'utf8');
                return DEFAULT_SETTINGS;
            }
            return defaultValue; 
        }
        const fileContent = fs.readFileSync(filePath, 'utf8');
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
        if (filePath === SETTINGS_FILE) return DEFAULT_SETTINGS; 
        return defaultValue; 
    }
}

// 安全写入 JSON 文件
function writeJsonFile(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error(`写入 JSON 文件 ${filePath} 失败:`, e);
    }
}

// 级联清理文章的所有评论
function deleteCommentsForArticle(articleId) {
    let comments = readJsonFile(COMMENTS_FILE);
    const initialLength = comments.length;
    comments = comments.filter(c => c.articleId !== articleId);
    if (comments.length < initialLength) {
        writeJsonFile(COMMENTS_FILE, comments);
        console.log(`已级联删除文章 ${articleId} 的所有关联评论。`);
    }
}

// 级联清理用户的所有评论
function deleteCommentsForUser(userId) {
    let comments = readJsonFile(COMMENTS_FILE);
    const initialLength = comments.length;
    comments = comments.filter(c => c.userId !== userId);
    if (comments.length < initialLength) {
        writeJsonFile(COMMENTS_FILE, comments);
        console.log(`已级联删除用户 ${userId} 的所有发表评论。`);
    }
}

module.exports = {
    UPLOADS_DIR,
    hashPassword,
    generateSalt,

    // ==========================================
    // 流量统计核心模块
    // ==========================================
    initializeTrafficStats: () => {
        let count = 0;
        try {
            if (fs.existsSync(TRAFFIC_LOG_FILE)) {
                const content = fs.readFileSync(TRAFFIC_LOG_FILE, 'utf8');
                if (content.trim() !== '') {
                    const lines = content.split('\n').filter(line => line.trim() !== '');
                    count = lines.length;
                }
            } else {
                fs.writeFileSync(TRAFFIC_LOG_FILE, '', 'utf8');
            }
        } catch (e) {
            console.error("初始化流量统计失败:", e);
        }
        trafficStatsCache.totalViews = count;
        console.log(`流量统计已就绪：历史总有效访问量 ${count} 次`);
    },

    logTraffic: (req, parsedUrl) => {
        const referrer = req.headers['referer'] || '';
        const ownHost = req.headers['host'];
        let isInternalNavigation = false;

        if (referrer && ownHost) {
            try {
                const referrerHost = new URL(referrer).host;
                if (referrerHost === ownHost) {
                    isInternalNavigation = true;
                }
            } catch (e) {}
        }
        
        // 站内内部点击跳转不计入新增外部入站
        if (isInternalNavigation) {
            return;
        }

        if (!fs.existsSync(DATA_DIR)) {
            try {
                fs.mkdirSync(DATA_DIR, { recursive: true });
            } catch (mkdirErr) {
                 console.error("创建 data 目录失败:", mkdirErr);
                 return; 
            }
        }

        try {
            const logEntry = {
                timestamp: new Date().toISOString(),
                ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.connection.remoteAddress,
                method: req.method,
                pathname: parsedUrl.pathname,
                userAgent: req.headers['user-agent'] || '',
                referrer: req.headers['referer'] || ''
            };
            const logLine = JSON.stringify(logEntry) + '\n';

            fs.appendFile(TRAFFIC_LOG_FILE, logLine, 'utf8', (err) => {
                if (err) console.error("写入流量日志失败:", err);
            });

            trafficStatsCache.totalViews += 1;
        } catch (e) {
            console.error("构建流量日志异常:", e);
        }
    },

    getTrafficStats: () => {
        return trafficStatsCache;
    },

    getDetailedTrafficStats: async () => {
        return new Promise((resolve, reject) => {
            fs.readFile(TRAFFIC_LOG_FILE, 'utf8', (err, data) => {
                if (err) {
                    console.error("读取详细统计日志失败:", err);
                    return reject(new Error("读取日志文件失败。"));
                }
                
                try {
                    const lines = data.split('\n').filter(line => line.trim() !== '');
                    const stats = {
                        totalViewsLog: lines.length,
                        uniqueVisitors: 0,
                        byPage: {},
                        byDate: {},
                        byReferrer: {}
                    };
                    const uniqueIPs = new Set();
                    
                    lines.forEach(line => {
                        try {
                            const entry = JSON.parse(line);
                            if (entry.ip) uniqueIPs.add(entry.ip);
                            
                            const page = entry.pathname || '/';
                            stats.byPage[page] = (stats.byPage[page] || 0) + 1;
                            
                            const date = entry.timestamp ? entry.timestamp.substring(0, 10) : '未知日期';
                            stats.byDate[date] = (stats.byDate[date] || 0) + 1;

                            let referrer = entry.referrer || '(direct)';
                            if (referrer.startsWith('http')) {
                                try {
                                    referrer = new URL(referrer).hostname; 
                                } catch (e) {}
                            }
                            if (referrer === '') referrer = '(direct)';
                            stats.byReferrer[referrer] = (stats.byReferrer[referrer] || 0) + 1;
                        } catch (parseErr) {}
                    });
                    
                    stats.uniqueVisitors = uniqueIPs.size;
                    
                    const sortAndSlice = (obj, limit = 15) => {
                        return Object.entries(obj)
                            .sort(([, a], [, b]) => b - a) 
                            .slice(0, limit)
                            .reduce((acc, [key, value]) => {
                                acc[key] = value;
                                return acc;
                            }, {});
                    };
                    
                    const sortDates = (obj, limit = 15) => {
                         return Object.entries(obj)
                            .sort(([keyA], [keyB]) => keyB.localeCompare(keyA)) 
                            .slice(0, limit)
                            .reduce((acc, [key, value]) => {
                                acc[key] = value;
                                return acc;
                            }, {});
                    };

                    resolve({
                        totalViewsLog: stats.totalViewsLog,
                        uniqueVisitors: stats.uniqueVisitors,
                        byPage: sortAndSlice(stats.byPage, 15),
                        byDate: sortDates(stats.byDate, 15),
                        byReferrer: sortAndSlice(stats.byReferrer, 15)
                    });
                } catch (processErr) {
                     console.error("分析详细统计异常:", processErr);
                     reject(new Error("分析日志数据失败。"));
                }
            });
        });
    },

    // ==========================================
    // 站点参数设置模块
    // ==========================================
    getSettings: () => {
        const settings = readJsonFile(SETTINGS_FILE, DEFAULT_SETTINGS);
        return { ...DEFAULT_SETTINGS, ...settings };
    },

    saveSettings: (settings) => {
        const currentSettings = readJsonFile(SETTINGS_FILE, DEFAULT_SETTINGS);
        const newSettings = { ...currentSettings, ...settings };
        if (newSettings.articlesPerPage !== undefined) {
             const parsedValue = parseInt(newSettings.articlesPerPage, 10);
             if (isNaN(parsedValue) || parsedValue < 1) {
                 newSettings.articlesPerPage = DEFAULT_SETTINGS.articlesPerPage; 
             } else {
                 newSettings.articlesPerPage = parsedValue;
             }
        }
        writeJsonFile(SETTINGS_FILE, newSettings);
        return newSettings;
    },
    
    // ==========================================
    // 用户模型持久化模块
    // ==========================================
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
            console.error(`保存用户失败：用户名 "${userToSave.username}" 已被占用。`);
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

            // 级联清理该用户发布的所有文章与对应附件
            let articles = readJsonFile(ARTICLES_FILE);
            const userArticles = articles.filter(article => article.userId === userId);
            userArticles.forEach(article => {
                if (article.attachment && article.attachment.path) {
                    const attachmentFullPath = path.join(UPLOADS_DIR, article.attachment.path);
                    if (fs.existsSync(attachmentFullPath)) {
                        try { fs.unlinkSync(attachmentFullPath); }
                        catch (e) { console.error(`删除附件失败:`, e); }
                    }
                }
                deleteCommentsForArticle(article.id);
            });

            articles = articles.filter(article => article.userId !== userId);
            writeJsonFile(ARTICLES_FILE, articles);

            deleteCommentsForUser(userId);

            const userUploadDir = path.join(UPLOADS_DIR, userId);
            if (fs.existsSync(userUploadDir)) {
                try { fs.rmSync(userUploadDir, { recursive: true, force: true }); }
                catch(e) { console.error(`清理用户目录失败:`, e); }
            }
            return true;
        }
        return false;
    },

    // ==========================================
    // 文章持久化模块 (含置顶逻辑)
    // ==========================================
    getArticles: () => readJsonFile(ARTICLES_FILE),

    saveArticle: (article) => {
        const articles = readJsonFile(ARTICLES_FILE);
        if (!article.id) {
            // 新建文章
            article.id = `article_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            article.createdAt = new Date().toISOString();
            article.updatedAt = new Date().toISOString();
            article.isPinned = (article.isPinned === true);
            articles.push(article);
        } else {
            // 更新文章
            const index = articles.findIndex(n => n.id === article.id);
            if (index > -1) {
                const existingArticle = articles[index];
                const resolvedPinned = (article.isPinned !== undefined) 
                    ? (article.isPinned === true) 
                    : (existingArticle.isPinned || false);

                articles[index] = { 
                    ...existingArticle, 
                    ...article, 
                    updatedAt: new Date().toISOString(),
                    isPinned: resolvedPinned
                };
            } else {
                return null;
            }
        }
        writeJsonFile(ARTICLES_FILE, articles);
        return articles.find(a => a.id === article.id) || article;
    },

    findArticleById: (id) => readJsonFile(ARTICLES_FILE).find(n => n.id === id),

    deleteArticle: (articleId) => {
        let articles = readJsonFile(ARTICLES_FILE);
        const articleToDelete = articles.find(n => n.id === articleId);
        if (!articleToDelete) return false;

        if (articleToDelete.attachment && articleToDelete.attachment.path) {
            const attachmentFullPath = path.join(UPLOADS_DIR, articleToDelete.attachment.path);
            if (fs.existsSync(attachmentFullPath)) {
                try { fs.unlinkSync(attachmentFullPath); }
                catch (e) { console.error(`删除附件失败:`, e); }
            }
        }

        deleteCommentsForArticle(articleId);

        const initialLength = articles.length;
        articles = articles.filter(n => n.id !== articleId);
        if (articles.length < initialLength) {
            writeJsonFile(ARTICLES_FILE, articles);
            return true;
        }
        return false;
    },

    // ==========================================
    // 评论模型持久化模块
    // ==========================================
    getComments: (articleId) => {
        return readJsonFile(COMMENTS_FILE).filter(c => c.articleId === articleId)
               .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    },

    saveComment: (comment) => {
        const comments = readJsonFile(COMMENTS_FILE);
        if (!comment.id) {
            comment.id = `comment_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            comment.createdAt = new Date().toISOString();
            comments.push(comment);
        } else {
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
