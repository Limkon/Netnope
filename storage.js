// storage.js - 資料持久化邏輯 (讀寫JSON檔案)
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const NOTES_FILE = path.join(DATA_DIR, 'notes.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// 輔助函數：讀取 JSON 檔案
function readJsonFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            // 如果檔案不存在，根據檔案類型返回空陣列或進行初始化
            if (filePath === USERS_FILE || filePath === NOTES_FILE) {
                fs.writeFileSync(filePath, '[]', 'utf8');
                return [];
            }
            return null; // 或拋出錯誤，取決於需求
        }
        const fileContent = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(fileContent);
    } catch (e) {
        console.error(`讀取 JSON 檔案 ${filePath} 失敗:`, e);
        // 如果解析失敗，可能檔案已損壞，返回空陣列以避免應用程式崩潰
        return [];
    }
}

// 輔助函數：寫入 JSON 檔案
function writeJsonFile(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error(`寫入 JSON 檔案 ${filePath} 失敗:`, e);
    }
}

module.exports = {
    UPLOADS_DIR, // 匯出上傳目錄路徑，供其他模組使用

    // --- 使用者相關操作 ---
    getUsers: () => readJsonFile(USERS_FILE),
    saveUser: (user) => {
        const users = readJsonFile(USERS_FILE);
        if (!user.id) user.id = `user_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`; // 確保有 ID
        const existingIndex = users.findIndex(u => u.id === user.id || u.username === user.username);

        if (existingIndex > -1) { // 更新現有使用者 (或基於使用者名稱的衝突)
            // 如果是基於 username 找到的，但 id 不同，則可能是 username 衝突
            if (users[existingIndex].username === user.username && users[existingIndex].id !== user.id) {
                console.error("儲存使用者錯誤：使用者名稱已存在但ID不同。");
                return null; // 或拋出錯誤
            }
            users[existingIndex] = { ...users[existingIndex], ...user };
        } else { // 新增使用者
            users.push(user);
        }
        writeJsonFile(USERS_FILE, users);
        return user;
    },
    findUserByUsername: (username) => readJsonFile(USERS_FILE).find(u => u.username === username),
    findUserById: (id) => readJsonFile(USERS_FILE).find(u => u.id === id),
    deleteUser: (userId) => {
        let users = readJsonFile(USERS_FILE);
        const initialLength = users.length;
        users = users.filter(u => u.id !== userId);
        if (users.length < initialLength) {
            writeJsonFile(USERS_FILE, users);
            // 重要：同時刪除該使用者的所有記事和附件
            let notes = readJsonFile(NOTES_FILE);
            const userNotes = notes.filter(note => note.userId === userId);
            userNotes.forEach(note => {
                if (note.attachment && note.attachment.path) {
                    const attachmentFullPath = path.join(UPLOADS_DIR, note.attachment.path);
                    if (fs.existsSync(attachmentFullPath)) {
                        try { fs.unlinkSync(attachmentFullPath); }
                        catch (e) { console.error(`刪除使用者 ${userId} 的附件 ${attachmentFullPath} 失敗:`, e); }
                    }
                }
            });
            notes = notes.filter(note => note.userId !== userId);
            writeJsonFile(NOTES_FILE, notes);
            // 刪除使用者上傳目錄
            const userUploadDir = path.join(UPLOADS_DIR, userId);
            if (fs.existsSync(userUploadDir)) {
                try { fs.rmSync(userUploadDir, { recursive: true, force: true }); } // Node v14.14+
                catch(e) { console.error(`刪除使用者 ${userId} 的上傳目錄 ${userUploadDir} 失敗:`, e); }
            }
            return true;
        }
        return false;
    },

    // --- 記事相關操作 ---
    getNotes: () => readJsonFile(NOTES_FILE),
    saveNote: (note) => {
        const notes = readJsonFile(NOTES_FILE);
        if (!note.id) { // 新建記事
            note.id = `note_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            note.createdAt = new Date().toISOString();
            note.updatedAt = new Date().toISOString();
            notes.push(note);
        } else { // 更新記事
            const index = notes.findIndex(n => n.id === note.id);
            if (index > -1) {
                notes[index] = { ...notes[index], ...note, updatedAt: new Date().toISOString() };
            } else {
                console.error(`更新記事失敗：找不到 ID 為 ${note.id} 的記事。`);
                return null; // 未找到則更新失敗
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

        // 刪除關聯的附件
        if (noteToDelete.attachment && noteToDelete.attachment.path) {
            const attachmentFullPath = path.join(UPLOADS_DIR, noteToDelete.attachment.path);
            if (fs.existsSync(attachmentFullPath)) {
                try {
                    fs.unlinkSync(attachmentFullPath);
                    console.log(`附件 ${attachmentFullPath} 已刪除。`);
                } catch (e) {
                    console.error(`刪除附件 ${attachmentFullPath} 失敗:`, e);
                    // 即使附件刪除失敗，也應繼續刪除記事記錄
                }
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
