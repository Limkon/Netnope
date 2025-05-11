// noteController.js - 记事相关操作的控制器
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

function sanitizeAndMakeUniqueFilename(originalFilename, userId) {
    let safeName = originalFilename.replace(/[\\/:*?"<>|]/g, '_');
    safeName = safeName.replace(/\s+/g, '_');
    safeName = safeName.replace(/^_+|_+$/g, '').replace(/^\.+|\.+$/g, '');
    if (!safeName) safeName = "renamed_file";
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 7);
    return `${timestamp}_${randomSuffix}_${safeName}`;
}

module.exports = {
    getNotesPage: (context) => {
        // 匿名用户和登录用户都可以访问此页面
        // 前端 JS 将根据 context.session.role 调整 UI
        serveHtmlWithPlaceholders(context.res, path.join(PUBLIC_DIR, 'index.html'), {
            username: context.session ? context.session.username : '访客', // 如果是匿名，显示访客
            userRole: context.session ? context.session.role : 'anonymous'
        });
    },

    getNoteFormPage: (context, noteIdToEdit) => {
        if (context.session && context.session.role === 'anonymous') {
            return sendForbidden(context.res, "匿名用户不能访问此页面。");
        }
        // 只有登录用户可以访问
        serveHtmlWithPlaceholders(context.res, path.join(PUBLIC_DIR, 'note.html'), {
            username: context.session.username,
            noteId: noteIdToEdit || '',
            pageTitle: noteIdToEdit ? '编辑记事' : '新建记事'
        });
    },

    getAllNotes: (context) => {
        const { userId, role } = context.session || { role: 'anonymous' }; // 如果没有 session，则假定为匿名
        let notes = storage.getNotes();

        if (role === 'admin' || role === 'anonymous') { // 管理员和匿名用户看所有
            notes = notes.map(note => {
                const owner = storage.findUserById(note.userId);
                return { ...note, ownerUsername: owner ? owner.username : '未知用户' };
            }).sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        } else { // 普通登录用户看自己的
            notes = notes.filter(note => note.userId === userId)
                         .sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        }
        serveJson(context.res, notes);
    },

    getNoteById: (context) => {
        const noteId = context.pathname.split('/').pop();
        const note = storage.findNoteById(noteId);
        if (!note) return sendNotFound(context.res, "找不到指定的记事。");
        
        // 匿名用户可以查看任何记事
        if (context.session && context.session.role === 'anonymous') {
            return serveJson(context.res, note);
        }
        // 登录用户权限检查
        if (context.session.role !== 'admin' && note.userId !== context.session.userId) {
            return sendForbidden(context.res, "您无权查看此记事。");
        }
        serveJson(context.res, note);
    },

    createNote: (context) => {
        if (context.session && context.session.role === 'anonymous') {
            return sendForbidden(context.res, "匿名用户不能创建记事。");
        }
        // ... (其余创建逻辑不变) ...
        const { title, content } = context.body;
        const attachmentFile = context.files && context.files.attachment;
        if (!title || title.trim() === '' || !content || content.trim() === '') {
            return sendBadRequest(context.res, "标题和内容不能为空。");
        }
        const newNoteData = { userId: context.session.userId, title: title.trim(), content: content, attachment: null };
        if (attachmentFile && attachmentFile.content && attachmentFile.filename) {
            const userUploadDir = path.join(UPLOADS_DIR, context.session.userId);
            if (!fs.existsSync(userUploadDir)) {
                try { fs.mkdirSync(userUploadDir, { recursive: true }); }
                catch (e) { return sendError(context.res, "处理附件时发生错误 (目录创建失败)。");}
            }
            const uniqueFilenameForStorage = sanitizeAndMakeUniqueFilename(attachmentFile.filename, context.session.userId);
            const attachmentRelativePath = path.join(context.session.userId, uniqueFilenameForStorage);
            const attachmentFullPath = path.join(UPLOADS_DIR, attachmentRelativePath);
            try {
                fs.writeFileSync(attachmentFullPath, attachmentFile.content);
                newNoteData.attachment = {
                    originalName: attachmentFile.filename,
                    path: attachmentRelativePath,
                    mimeType: attachmentFile.contentType || 'application/octet-stream',
                    size: attachmentFile.content.length
                };
            } catch (e) { return sendError(context.res, "保存附件时发生错误。"); }
        }
        const savedNote = storage.saveNote(newNoteData);
        if (savedNote) serveJson(context.res, savedNote, 201);
        else sendError(context.res, "保存记事失败。");
    },

    updateNote: (context) => {
        if (context.session && context.session.role === 'anonymous') {
            return sendForbidden(context.res, "匿名用户不能修改记事。");
        }
        // ... (其余更新逻辑不变) ...
        const noteId = context.pathname.split('/').pop();
        const { title, content, removeAttachment } = context.body;
        const attachmentFile = context.files && context.files.attachment;
        const existingNote = storage.findNoteById(noteId);
        if (!existingNote) return sendNotFound(context.res, "找不到要更新的记事。");
        if (context.session.role !== 'admin' && existingNote.userId !== context.session.userId) {
            return sendForbidden(context.res, "您无权修改此记事。");
        }
        if (!title || title.trim() === '' || !content || content.trim() === '') {
            return sendBadRequest(context.res, "标题和内容不能为空。");
        }
        const updatedNoteData = { id: noteId, userId: existingNote.userId, title: title.trim(), content: content, attachment: existingNote.attachment };
        if (removeAttachment === 'true' && existingNote.attachment) {
            const oldAttachmentPath = path.join(UPLOADS_DIR, existingNote.attachment.path);
            if (fs.existsSync(oldAttachmentPath)) {
                try { fs.unlinkSync(oldAttachmentPath); } catch (e) { console.error(`删除旧附件 ${oldAttachmentPath} 失败:`, e); }
            }
            updatedNoteData.attachment = null;
        }
        if (attachmentFile && attachmentFile.content && attachmentFile.filename) {
            if (updatedNoteData.attachment && updatedNoteData.attachment.path) {
                 const oldAttachmentPath = path.join(UPLOADS_DIR, updatedNoteData.attachment.path);
                 if (fs.existsSync(oldAttachmentPath)) {
                    try { fs.unlinkSync(oldAttachmentPath); } catch (e) { console.error(`取代旧附件 ${oldAttachmentPath} 时删除失败:`, e); }
                 }
            }
            const userUploadDir = path.join(UPLOADS_DIR, existingNote.userId);
            if (!fs.existsSync(userUploadDir)) {
                try { fs.mkdirSync(userUploadDir, { recursive: true }); }
                catch (e) { return sendError(context.res, "处理附件时发生错误 (目录创建失败)。"); }
            }
            const uniqueFilenameForStorage = sanitizeAndMakeUniqueFilename(attachmentFile.filename, existingNote.userId);
            const attachmentRelativePath = path.join(existingNote.userId, uniqueFilenameForStorage);
            const attachmentFullPath = path.join(UPLOADS_DIR, attachmentRelativePath);
            try {
                fs.writeFileSync(attachmentFullPath, attachmentFile.content);
                updatedNoteData.attachment = {
                    originalName: attachmentFile.filename,
                    path: attachmentRelativePath,
                    mimeType: attachmentFile.contentType || 'application/octet-stream',
                    size: attachmentFile.content.length
                };
            } catch (e) { return sendError(context.res, "更新时保存新附件失败。"); }
        }
        const savedNote = storage.saveNote(updatedNoteData);
        if (savedNote) serveJson(context.res, savedNote);
        else sendError(context.res, "更新记事失败。");
    },

    deleteNoteById: (context) => {
        if (context.session && context.session.role === 'anonymous') {
            return sendForbidden(context.res, "匿名用户不能删除记事。");
        }
        // ... (其余删除逻辑不变) ...
        const noteId = context.pathname.split('/').pop();
        const noteToDelete = storage.findNoteById(noteId);
        if (!noteToDelete) return sendNotFound(context.res, "找不到要删除的记事。");
        if (context.session.role !== 'admin' && noteToDelete.userId !== context.session.userId) {
            return sendForbidden(context.res, "您无权删除此记事。");
        }
        if (storage.deleteNote(noteId)) {
            serveJson(context.res, { message: `记事 (ID: ${noteId}) 已成功删除。` });
        } else {
            sendError(context.res, "删除记事失败。");
        }
    }
};
