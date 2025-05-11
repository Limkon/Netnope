// storage.js - 数据持久化逻辑 (读写JSON文件, 密码加密)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const NOTES_FILE = path.join(DATA_DIR, 'notes.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

const HASH_ITERATIONS = 100000;
const HASH_KEYLEN = 64;
const HASH_DIGEST = 'sha512';
const SALT_LEN = 16;

function generateSalt() {
    return crypto.randomBytes(SALT_LEN).toString('hex');
}

function hashPassword(password, salt) {
    if (!password) return '';
    return crypto.pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_KEYLEN, HASH_DIGEST).toString('hex');
}

function readJsonFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            if (filePath === USERS_FILE || filePath === NOTES_FILE) {
                fs.writeFileSync(filePath, '[]', 'utf8');
                return [];
            }
            return null;
        }
        const fileContent = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(fileContent);
    } catch (e) {
        console.error(`读取 JSON 文件 ${filePath} 失败:`, e);
        return [];
    }
}

function writeJsonFile(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error(`写入 JSON 文件 ${filePath} 失败:`, e);
    }
}

// 新增：初始化 "anyone" 匿名用户
function initializeAnonymousUser() {
    const users = readJsonFile(USERS_FILE);
    const anyoneUser = users.find(u => u.username === 'anyone');
    if (!anyoneUser) {
        users.push({
            id: `user_anyone_${Date.now()}`,
            username: 'anyone',
            role: 'anonymous',
            // 匿名用户不需要密码、盐或哈希密码
            salt: null,
            hashedPassword: null
        });
        writeJsonFile(USERS_FILE, users);
        console.log('匿名用户 "anyone" 已创建。');
    }
}
// 在模块加载时调用，以确保 "anyone" 用户存在 (如果需要)
// 或者在 server.js 启动时调用
// initializeAnonymousUser(); // 移动到 server.js 中调用

module.exports = {
    UPLOADS_DIR,
    hashPassword,
    generateSalt,
    initializeAnonymousUser, // 导出以便 server.js 调用

    getUsers: () => readJsonFile(USERS_FILE),
    saveUser: (userData) => {
        const users = readJsonFile(USERS_FILE);
        let userToSave = { ...userData };

        // 防止修改 "anyone" 用户的关键属性
        if (userToSave.username === 'anyone' && userData.id && userData.id.startsWith('user_anyone_')) {
            const existingAnyone = users.find(u => u.id === userData.id);
            if (existingAnyone) {
                userToSave.role = 'anonymous'; // 强制角色
                // 不允许修改 anyone 的用户名，密码相关字段也不适用
                userToSave.username = 'anyone';
                delete userToSave.password;
                delete userToSave.salt;
                delete userToSave.hashedPassword;
            }
        } else if (userToSave.hasOwnProperty('password')) {
            if (!userToSave.salt) {
                userToSave.salt = generateSalt();
            }
            userToSave.hashedPassword = userToSave.password ? hashPassword(userToSave.password, userToSave.salt) : '';
            delete userToSave.password;
        }

        if (!userToSave.id) userToSave.id = `user_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        
        const existingIndexById = users.findIndex(u => u.id === userToSave.id);
        const existingIndexByUsername = users.findIndex(u => u.username === userToSave.username);

        if (existingIndexById > -1) {
            users[existingIndexById] = { ...users[existingIndexById], ...userToSave };
        } else if (existingIndexByUsername > -1 && userToSave.username !== 'anyone') { // 新用户 (非anyone)，但用户名已存在
             console.error("保存用户错误：用户名已存在。");
             return null;
        }
        else {
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
        const userToDelete = module.exports.findUserById(userId);
        if (userToDelete && userToDelete.username === 'anyone') {
            console.warn('禁止删除 "anyone" 匿名用户。');
            return false; // 不允许删除 "anyone" 用户
        }

        let users = readJsonFile(USERS_FILE);
        const initialLength = users.length;
        users = users.filter(u => u.id !== userId);
        if (users.length < initialLength) {
            writeJsonFile(USERS_FILE, users);
            let notes = readJsonFile(NOTES_FILE);
            const userNotes = notes.filter(note => note.userId === userId);
            userNotes.forEach(note => {
                if (note.attachment && note.attachment.path) {
                    const attachmentFullPath = path.join(UPLOADS_DIR, note.attachment.path);
                    if (fs.existsSync(attachmentFullPath)) {
                        try { fs.unlinkSync(attachmentFullPath); }
                        catch (e) { console.error(`删除用户 ${userId} 的附件 ${attachmentFullPath} 失败:`, e); }
                    }
                }
            });
            notes = notes.filter(note => note.userId !== userId);
            writeJsonFile(NOTES_FILE, notes);
            const userUploadDir = path.join(UPLOADS_DIR, userId);
            if (fs.existsSync(userUploadDir)) {
                try { fs.rmSync(userUploadDir, { recursive: true, force: true }); }
                catch(e) { console.error(`删除用户 ${userId} 的上传目录 ${userUploadDir} 失败:`, e); }
            }
            return true;
        }
        return false;
    },

    getNotes: () => readJsonFile(NOTES_FILE),
    saveNote: (note) => {
        const notes = readJsonFile(NOTES_FILE);
        if (!note.id) {
            note.id = `note_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            note.createdAt = new Date().toISOString();
            note.updatedAt = new Date().toISOString();
            notes.push(note);
        } else {
            const index = notes.findIndex(n => n.id === note.id);
            if (index > -1) {
                notes[index] = { ...notes[index], ...note, updatedAt: new Date().toISOString() };
            } else {
                return null;
            }
        }
        writeJsonFile(NOTES_FILE, notes);
        return note;
    },
    findNoteById: (id) => readJsonFile(NOTES_FILE).find(n => n.id === id),
    deleteNote: (noteId) => {
        let notes = readJsonFile(NOTES_FILE);
        const noteToDelete = notes.find(n => n.id === noteId);
        if (!noteToDelete) return false;
        if (noteToDelete.attachment && noteToDelete.attachment.path) {
            const attachmentFullPath = path.join(UPLOADS_DIR, noteToDelete.attachment.path);
            if (fs.existsSync(attachmentFullPath)) {
                try { fs.unlinkSync(attachmentFullPath); }
                catch (e) { console.error(`删除附件 ${attachmentFullPath} 失败:`, e); }
            }
        }
        const initialLength = notes.length;
        notes = notes.filter(n => n.id !== noteId);
        if (notes.length < initialLength) {
            writeJsonFile(NOTES_FILE, notes);
            return true;
        }
        return false;
    }
};
