// storage.js - 数据持久化逻辑 (读写JSON文件, 密码加密)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto'); // 引入 crypto 模块

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const NOTES_FILE = path.join(DATA_DIR, 'notes.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// 哈希参数 (根据需要调整)
const HASH_ITERATIONS = 100000;
const HASH_KEYLEN = 64;
const HASH_DIGEST = 'sha512';
const SALT_LEN = 16;

// 辅助函数：生成盐
function generateSalt() {
    return crypto.randomBytes(SALT_LEN).toString('hex');
}

// 辅助函数：哈希密码
function hashPassword(password, salt) {
    if (!password) return ''; // 如果密码为空，则存储空字符串 (或特定标记)
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

module.exports = {
    UPLOADS_DIR,
    hashPassword, // 导出 hashPassword 供 auth.js 使用
    generateSalt, // 导出 generateSalt (虽然主要在内部使用)

    getUsers: () => readJsonFile(USERS_FILE),
    saveUser: (userData) => {
        const users = readJsonFile(USERS_FILE);
        let userToSave = { ...userData };

        // 如果提供了密码且密码字段存在 (表示需要更新或设置密码)
        if (userToSave.hasOwnProperty('password')) {
            if (!userToSave.salt) { // 如果是新用户或首次加密密码
                userToSave.salt = generateSalt();
            }
            // 只有当密码不是空字符串时才哈希，否则保持为空字符串 (代表空密码)
            userToSave.hashedPassword = userToSave.password ? hashPassword(userToSave.password, userToSave.salt) : '';
            delete userToSave.password; // 从存储对象中移除明文密码
        }


        if (!userToSave.id) userToSave.id = `user_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        
        const existingIndexById = users.findIndex(u => u.id === userToSave.id);
        const existingIndexByUsername = users.findIndex(u => u.username === userToSave.username);

        if (existingIndexById > -1) { // 更新通过 ID 找到的用户
            users[existingIndexById] = { ...users[existingIndexById], ...userToSave };
        } else if (existingIndexByUsername > -1 && !userToSave.id) { // 新用户，但用户名已存在
             console.error("保存用户错误：用户名已存在。");
             return null;
        }
        else { // 新用户
            users.push(userToSave);
        }
        writeJsonFile(USERS_FILE, users);
        // 返回的用户对象不应包含 salt 或 hashedPassword 的敏感信息，除非特定场景需要
        const { salt, hashedPassword, ...safeUser } = userToSave;
        return safeUser; // 返回不含密码和盐的用户信息
    },
    findUserByUsername: (username) => {
        const user = readJsonFile(USERS_FILE).find(u => u.username === username);
        // 返回包含 salt 和 hashedPassword 的完整用户对象，供认证使用
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
                console.error(`更新记事失败：找不到 ID 为 ${note.id} 的记事。`);
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
