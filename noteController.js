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
const fs = require('fs');

const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOADS_DIR = storage.UPLOADS_DIR;

// 輔助函數：清理和產生唯一的檔案名稱，支援 Unicode
function sanitizeAndMakeUniqueFilename(originalFilename, userId) {
    // 1. 移除或替換不安全的字元，但保留 Unicode 字母、數字、點、底線、連字號和空格
    //    將 \ / : * ? " < > | 等字元替換為底線
    let safeName = originalFilename.replace(/[\\/:*?"<>|]/g, '_');

    // 2. 將一個或多個空格替換為單個底線
    safeName = safeName.replace(/\s+/g, '_');

    // 3. 移除檔名開頭和結尾的底線或點 (可選，但通常是好習慣)
    safeName = safeName.replace(/^_+|_+$/g, '').replace(/^\.+|\.+$/g, '');
    if (!safeName) safeName = "renamed_file"; // 如果檔名變成空的，給一個預設值

    // 4. 加上時間戳和隨機字串以確保唯一性
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 7);
    return `${timestamp}_${randomSuffix}_${safeName}`;
}

module.exports = {
    getNotesPage: (context) => {
        serveHtmlWithPlaceholders(context.res, path.join(PUBLIC_DIR, 'index.html'), {
            username: context.session.username,
            userRole: context.session.role
        });
    },

    getNoteFormPage: (context, noteIdToEdit) => {
        serveHtmlWithPlaceholders(context.res, path.join(PUBLIC_DIR, 'note.html'), {
            username: context.session.username,
            noteId: noteIdToEdit || '',
            pageTitle: noteIdToEdit ? '編輯記事' : '新增記事'
        });
    },

    getAllNotes: (context) => {
        const { userId, role } = context.session;
        let notes = storage.getNotes();
        if (role === 'admin') {
            notes = notes.map(note => {
                const owner = storage.findUserById(note.userId);
                return { ...note, ownerUsername: owner ? owner.username : '未知使用者' };
            }).sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        } else {
            notes = notes.filter(note => note.userId === userId)
                         .sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        }
        serveJson(context.res, notes);
    },

    getNoteById: (context) => {
        const noteId = context.pathname.split('/').pop();
        const note = storage.findNoteById(noteId);
        if (!note) return sendNotFound(context.res, "找不到指定的記事。");
        if (context.session.role !== 'admin' && note.userId !== context.session.userId) {
            return sendForbidden(context.res, "您無權檢視此記事。");
        }
        serveJson(context.res, note);
    },

    createNote: (context) => {
        const { title, content } = context.body;
        const attachmentFile = context.files && context.files.attachment;

        if (!title || title.trim() === '' || !content || content.trim() === '') {
            return sendBadRequest(context.res, "標題和內容不能為空。");
        }

        const newNoteData = {
            userId: context.session.userId,
            title: title.trim(),
            content: content,
            attachment: null
        };

        if (attachmentFile && attachmentFile.content && attachmentFile.filename) {
            const userUploadDir = path.join(UPLOADS_DIR, context.session.userId);
            if (!fs.existsSync(userUploadDir)) {
                try { fs.mkdirSync(userUploadDir, { recursive: true }); }
                catch (e) { return sendError(context.res, "處理附件時發生錯誤 (目錄建立失敗)。");}
            }

            // 使用解碼後的原始檔名 (attachmentFile.filename) 進行清理
            const uniqueFilenameForStorage = sanitizeAndMakeUniqueFilename(attachmentFile.filename, context.session.userId);
            const attachmentRelativePath = path.join(context.session.userId, uniqueFilenameForStorage);
            const attachmentFullPath = path.join(UPLOADS_DIR, attachmentRelativePath);

            try {
                fs.writeFileSync(attachmentFullPath, attachmentFile.content);
                newNoteData.attachment = {
                    originalName: attachmentFile.filename, // 儲存解碼後的原始檔名供顯示
                    path: attachmentRelativePath,          // 儲存清理和唯一化後的路徑
                    mimeType: attachmentFile.contentType || 'application/octet-stream',
                    size: attachmentFile.content.length
                };
            } catch (e) {
                console.error("儲存附件失敗:", e);
                return sendError(context.res, "儲存附件時發生錯誤。");
            }
        }

        const savedNote = storage.saveNote(newNoteData);
        if (savedNote) serveJson(context.res, savedNote, 201);
        else sendError(context.res, "儲存記事失敗。");
    },

    updateNote: (context) => {
        const noteId = context.pathname.split('/').pop();
        const { title, content, removeAttachment } = context.body;
        const attachmentFile = context.files && context.files.attachment;

        const existingNote = storage.findNoteById(noteId);
        if (!existingNote) return sendNotFound(context.res, "找不到要更新的記事。");
        if (context.session.role !== 'admin' && existingNote.userId !== context.session.userId) {
            return sendForbidden(context.res, "您無權修改此記事。");
        }
        if (!title || title.trim() === '' || !content || content.trim() === '') {
            return sendBadRequest(context.res, "標題和內容不能為空。");
        }

        const updatedNoteData = {
            id: noteId,
            userId: existingNote.userId,
            title: title.trim(),
            content: content,
            attachment: existingNote.attachment
        };

        if (removeAttachment === 'true' && existingNote.attachment) {
            const oldAttachmentPath = path.join(UPLOADS_DIR, existingNote.attachment.path);
            if (fs.existsSync(oldAttachmentPath)) {
                try { fs.unlinkSync(oldAttachmentPath); } catch (e) { console.error(`刪除舊附件 ${oldAttachmentPath} 失敗:`, e); }
            }
            updatedNoteData.attachment = null;
        }

        if (attachmentFile && attachmentFile.content && attachmentFile.filename) {
            if (updatedNoteData.attachment && updatedNoteData.attachment.path) {
                 const oldAttachmentPath = path.join(UPLOADS_DIR, updatedNoteData.attachment.path);
                 if (fs.existsSync(oldAttachmentPath)) {
                    try { fs.unlinkSync(oldAttachmentPath); } catch (e) { console.error(`取代舊附件 ${oldAttachmentPath} 時刪除失敗:`, e); }
                 }
            }
            const userUploadDir = path.join(UPLOADS_DIR, existingNote.userId);
            if (!fs.existsSync(userUploadDir)) {
                try { fs.mkdirSync(userUploadDir, { recursive: true }); }
                catch (e) { return sendError(context.res, "處理附件時發生錯誤 (目錄建立失敗)。"); }
            }

            const uniqueFilenameForStorage = sanitizeAndMakeUniqueFilename(attachmentFile.filename, existingNote.userId);
            const attachmentRelativePath = path.join(existingNote.userId, uniqueFilenameForStorage);
            const attachmentFullPath = path.join(UPLOADS_DIR, attachmentRelativePath);

            try {
                fs.writeFileSync(attachmentFullPath, attachmentFile.content);
                updatedNoteData.attachment = {
                    originalName: attachmentFile.filename, // 儲存解碼後的原始檔名
                    path: attachmentRelativePath,
                    mimeType: attachmentFile.contentType || 'application/octet-stream',
                    size: attachmentFile.content.length
                };
            } catch (e) {
                console.error("更新時儲存新附件失敗:", e);
                return sendError(context.res, "更新時儲存新附件失敗。");
            }
        }

        const savedNote = storage.saveNote(updatedNoteData);
        if (savedNote) serveJson(context.res, savedNote);
        else sendError(context.res, "更新記事失敗。");
    },

    deleteNoteById: (context) => {
        const noteId = context.pathname.split('/').pop();
        const noteToDelete = storage.findNoteById(noteId);
        if (!noteToDelete) return sendNotFound(context.res, "找不到要刪除的記事。");
        if (context.session.role !== 'admin' && noteToDelete.userId !== context.session.userId) {
            return sendForbidden(context.res, "您無權刪除此記事。");
        }
        if (storage.deleteNote(noteId)) {
            serveJson(context.res, { message: `記事 (ID: ${noteId}) 已成功刪除。` });
        } else {
            sendError(context.res, "刪除記事失敗。");
        }
    }
};
