// noteController.js - 記事相關操作的控制器
const storage = require('./storage');
const {
    serveHtmlWithPlaceholders,
    serveJson,
    redirect,
    sendError,
    sendNotFound,
    sendForbidden,
    sendBadRequest
} = require('./responseUtils');
const path = require('path');
const fs = require('fs'); // 用於儲存上傳的檔案
// const { parseMultipartFormData } = require('./router'); // REMOVED: Router handles parsing and passes data via context

const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOADS_DIR = storage.UPLOADS_DIR;

// 輔助函數：清理和產生唯一的檔案名稱
function sanitizeAndMakeUniqueFilename(originalFilename, userId) {
    // 移除路徑字元和不安全字元
    const safeBasename = path.basename(originalFilename).replace(/[^a-zA-Z0-9._-]/g, '_');
    // 加上時間戳和隨機字串以確保唯一性
    return `${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${safeBasename}`;
}

module.exports = {
    getNotesPage: (context) => { // 主頁，顯示記事列表
        serveHtmlWithPlaceholders(context.res, path.join(PUBLIC_DIR, 'index.html'), {
            username: context.session.username,
            userRole: context.session.role // 用於客戶端判斷是否顯示管理員連結
        });
    },

    getNoteFormPage: (context, noteIdToEdit) => { // 新增/編輯記事表單頁
        serveHtmlWithPlaceholders(context.res, path.join(PUBLIC_DIR, 'note.html'), {
            username: context.session.username,
            noteId: noteIdToEdit || '', // 如果是編輯，傳入 noteId，客戶端 JS 會用它來獲取記事詳情
            pageTitle: noteIdToEdit ? '編輯記事' : '新增記事'
        });
    },

    getAllNotes: (context) => {
        const { userId, role } = context.session;
        let notes = storage.getNotes();

        if (role === 'admin') {
            // 管理員可以看到所有記事，並附帶擁有者資訊
            notes = notes.map(note => {
                const owner = storage.findUserById(note.userId);
                return { ...note, ownerUsername: owner ? owner.username : '未知使用者' };
            }).sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt)); // 按更新時間降序
        } else {
            // 普通使用者只能看到自己的記事
            notes = notes.filter(note => note.userId === userId)
                         .sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt)); // 按更新時間降序
        }
        serveJson(context.res, notes);
    },

    getNoteById: (context) => {
        const noteId = context.pathname.split('/').pop();
        const note = storage.findNoteById(noteId);

        if (!note) {
            return sendNotFound(context.res, "找不到指定的記事。");
        }
        // 權限檢查：使用者只能獲取自己的記事，或管理員可以獲取任何記事
        if (context.session.role !== 'admin' && note.userId !== context.session.userId) {
            return sendForbidden(context.res, "您無權檢視此記事。");
        }
        serveJson(context.res, note);
    },

    createNote: (context) => {
        // context.body 和 context.files 已經由 router.js 中的 parseMultipartFormData (如果適用) 解析
        const { title, content } = context.body;
        const attachmentFile = context.files && context.files.attachment;

        if (!title || title.trim() === '' || !content || content.trim() === '') {
            return sendBadRequest(context.res, "標題和內容不能為空。");
        }

        const newNoteData = {
            userId: context.session.userId,
            title: title.trim(),
            content: content, // 富文本 HTML 內容，XSS 風險!
            attachment: null // 初始化附件資訊
        };

        if (attachmentFile && attachmentFile.content && attachmentFile.filename) {
            const userUploadDir = path.join(UPLOADS_DIR, context.session.userId);
            if (!fs.existsSync(userUploadDir)) {
                try {
                    fs.mkdirSync(userUploadDir, { recursive: true });
                } catch (e) {
                    console.error(`建立使用者上傳目錄 ${userUploadDir} 失敗:`, e);
                    return sendError(context.res, "處理附件時發生錯誤 (目錄建立失敗)。");
                }
            }

            const uniqueFilename = sanitizeAndMakeUniqueFilename(attachmentFile.filename, context.session.userId);
            const attachmentRelativePath = path.join(context.session.userId, uniqueFilename); // 相對路徑: userId/filename.ext
            const attachmentFullPath = path.join(UPLOADS_DIR, attachmentRelativePath);

            try {
                fs.writeFileSync(attachmentFullPath, attachmentFile.content); // attachmentFile.content 是 Buffer
                newNoteData.attachment = {
                    originalName: attachmentFile.filename,
                    path: attachmentRelativePath,
                    mimeType: attachmentFile.contentType || 'application/octet-stream',
                    size: attachmentFile.content.length
                };
                console.log(`附件已儲存: ${attachmentFullPath}`);
            } catch (e) {
                console.error("儲存附件失敗:", e);
                return sendError(context.res, "儲存附件時發生錯誤。");
            }
        }

        const savedNote = storage.saveNote(newNoteData);
        if (savedNote) {
            serveJson(context.res, savedNote, 201); // 201 Created
        } else {
            sendError(context.res, "儲存記事失敗。");
        }
    },

    updateNote: (context) => {
        const noteId = context.pathname.split('/').pop();
        const { title, content, removeAttachment } = context.body; // removeAttachment 是一個標記
        const attachmentFile = context.files && context.files.attachment;

        const existingNote = storage.findNoteById(noteId);
        if (!existingNote) {
            return sendNotFound(context.res, "找不到要更新的記事。");
        }

        // 權限檢查
        if (context.session.role !== 'admin' && existingNote.userId !== context.session.userId) {
            return sendForbidden(context.res, "您無權修改此記事。");
        }

        if (!title || title.trim() === '' || !content || content.trim() === '') {
            return sendBadRequest(context.res, "標題和內容不能為空。");
        }

        const updatedNoteData = {
            id: noteId, // 必須包含 id 以便 storage 模組知道是更新
            userId: existingNote.userId, // 保持原有 userId
            title: title.trim(),
            content: content, // 富文本 HTML 內容
            attachment: existingNote.attachment // 預設保留舊附件
        };

        // 處理附件更新/刪除邏輯
        if (removeAttachment === 'true' && existingNote.attachment) {
            const oldAttachmentPath = path.join(UPLOADS_DIR, existingNote.attachment.path);
            if (fs.existsSync(oldAttachmentPath)) {
                try { fs.unlinkSync(oldAttachmentPath); console.log(`舊附件 ${oldAttachmentPath} 已刪除。`); }
                catch (e) { console.error(`刪除舊附件 ${oldAttachmentPath} 失敗:`, e); /* 記錄錯誤，但繼續 */ }
            }
            updatedNoteData.attachment = null; // 從記事中移除附件資訊
        }

        if (attachmentFile && attachmentFile.content && attachmentFile.filename) {
            // 如果有新附件上傳，先刪除舊附件 (如果存在且未被上面 removeAttachment 邏輯刪除)
            if (updatedNoteData.attachment && updatedNoteData.attachment.path) {
                 const oldAttachmentPath = path.join(UPLOADS_DIR, updatedNoteData.attachment.path);
                 if (fs.existsSync(oldAttachmentPath)) {
                    try { fs.unlinkSync(oldAttachmentPath); console.log(`更新時，舊附件 ${oldAttachmentPath} 已被新附件取代並刪除。`); }
                    catch (e) { console.error(`取代舊附件 ${oldAttachmentPath} 時刪除失敗:`, e); }
                 }
            }

            const userUploadDir = path.join(UPLOADS_DIR, existingNote.userId); // 附件應儲存在記事擁有者的目錄
            if (!fs.existsSync(userUploadDir)) {
                try { fs.mkdirSync(userUploadDir, { recursive: true }); }
                catch (e) { return sendError(context.res, "處理附件時發生錯誤 (目錄建立失敗)。"); }
            }

            const uniqueFilename = sanitizeAndMakeUniqueFilename(attachmentFile.filename, existingNote.userId);
            const attachmentRelativePath = path.join(existingNote.userId, uniqueFilename);
            const attachmentFullPath = path.join(UPLOADS_DIR, attachmentRelativePath);

            try {
                fs.writeFileSync(attachmentFullPath, attachmentFile.content);
                updatedNoteData.attachment = {
                    originalName: attachmentFile.filename,
                    path: attachmentRelativePath,
                    mimeType: attachmentFile.contentType || 'application/octet-stream',
                    size: attachmentFile.content.length
                };
                console.log(`新附件已儲存: ${attachmentFullPath}`);
            } catch (e) {
                console.error("更新時儲存新附件失敗:", e);
                return sendError(context.res, "更新時儲存新附件失敗。");
            }
        } // Closing brace for the "if (attachmentFile ...)" block in updateNote

        const savedNote = storage.saveNote(updatedNoteData);
        if (savedNote) {
            serveJson(context.res, savedNote);
        } else {
            sendError(context.res, "更新記事失敗。");
        }
    }, // Closing brace for updateNote function

    deleteNoteById: (context) => {
        const noteId = context.pathname.split('/').pop();
        const noteToDelete = storage.findNoteById(noteId);

        if (!noteToDelete) {
            return sendNotFound(context.res, "找不到要刪除的記事。");
        }
        // 權限檢查
        if (context.session.role !== 'admin' && noteToDelete.userId !== context.session.userId) {
            return sendForbidden(context.res, "您無權刪除此記事。");
        }

        if (storage.deleteNote(noteId)) { // storage.deleteNote 內部會處理附件檔案的刪除
            serveJson(context.res, { message: `記事 (ID: ${noteId}) 已成功刪除。` });
        } else {
            sendError(context.res, "刪除記事失敗。");
        }
    } // Closing brace for deleteNoteById function
}; // Closing brace for module.exports
