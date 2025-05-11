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
    if (!password) return ''; // 如果密码为空，则存储空字符串
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
    hashPassword,
    generateSalt,
    // initializeAnonymousUser 函数已移除，"anyone" 用户由管理员手动创建

    getUsers: () => readJsonFile(USERS_FILE),
    saveUser: (userData) => {
        const users = readJsonFile(USERS_FILE);
        let userToSave = { ...userData };

        // 如果是 "anyone" 用户，强制其角色和处理密码字段
        if (userToSave.username === 'anyone') {
            userToSave.role = 'anonymous';
            // 匿名用户不应该有密码或盐
            delete userToSave.password; // 确保明文密码字段被移除
            userToSave.salt = null;
            userToSave.hashedPassword = null;
        } else if (userToSave.hasOwnProperty('password')) { // 对于其他用户，处理密码哈希
            if (!userToSave.salt) { // 如果是新用户或首次加密密码
                userToSave.salt = generateSalt();
            }
            userToSave.hashedPassword = userToSave.password ? hashPassword(userToSave.password, userToSave.salt) : '';
            delete userToSave.password; // 从存储对象中移除明文密码
        }


        if (!userToSave.id) {
            // 为新用户（包括新创建的 anyone 用户）生成 ID
            if (userToSave.username === 'anyone') {
                userToSave.id = `user_anyone_${Date.now()}`;
            } else {
                userToSave.id = `user_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            }
        }
        
        const existingIndexById = users.findIndex(u => u.id === userToSave.id);
        // 检查用户名是否已存在 (排除正在更新的同一用户，并允许 "anyone" 用户名存在，但不允许重复的 "anyone" ID)
        const existingUserWithSameName = users.find(u => u.username === userToSave.username && u.id !== userToSave.id);

        if (existingUserWithSameName && userToSave.username !== 'anyone') { // 不允许非 "anyone" 用户名重复
             console.error("保存用户错误：用户名已存在。");
             return null;
        }
        // 如果是更新 "anyone" 用户，确保其 ID 也是 "anyone" 用户的 ID
        if (userToSave.username === 'anyone' && existingIndexById > -1 && !users[existingIndexById].id.startsWith('user_anyone_')) {
            console.error("保存用户错误：尝试用 'anyone' 用户名更新非 'anyone' ID 的用户。");
            return null;
        }


        if (existingIndexById > -1) { // 更新通过 ID 找到的用户
            users[existingIndexById] = { ...users[existingIndexById], ...userToSave };
        } else { // 新用户
            users.push(userToSave);
        }
        writeJsonFile(USERS_FILE, users);
        const { salt, hashedPassword, ...safeUser } = userToSave;
        return safeUser;
    },
    findUserByUsername: (username) => {
        const user = readJsonFile(USERS_FILE).find(u => u.username === username);
        return user || null; // 返回包含 salt 和 hashedPassword 的完整用户对象
    },
    findUserById: (id) => {
        const user = readJsonFile(USERS_FILE).find(u => u.id === id);
        return user || null; // 返回包含 salt 和 hashedPassword 的完整用户对象
    },
    deleteUser: (userId) => {
        // 移除之前阻止删除 "anyone" 用户的逻辑。
        // 管理员现在可以删除 "anyone" 用户以禁用匿名访问。
        // 其他删除保护逻辑（如不能删除自己，不能删除最后一个管理员）应在 userController.js 中处理。

        let users = readJsonFile(USERS_FILE);
        const initialLength = users.length;
        users = users.filter(u => u.id !== userId);
        if (users.length < initialLength) {
            writeJsonFile(USERS_FILE, users);
            // 删除关联的记事和附件
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
