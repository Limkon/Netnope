// noteController.js - 记事相关操作的控制器
const storage = require('./storage');
const {
    serveHtmlWithPlaceholders,
    serveJson,
    redirect, // redirect 可能未使用，但保留以备将来之需
    sendError,
    sendNotFound,
    sendForbidden,
    sendBadRequest
} = require('./responseUtils');
const path = require('path');
const fs = require('fs'); // 仅在处理附件时需要

const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOADS_DIR = storage.UPLOADS_DIR;

// 辅助函数：清理和产生唯一的档案名称，支援 Unicode
function sanitizeAndMakeUniqueFilename(originalFilename, userId) {
    // 1. 移除或替换不安全的字符，但保留 Unicode 字母、数字、点、底线、连字号和空格
    //    将 \ / : * ? " < > | 等字符替换为底线
    let safeName = originalFilename.replace(/[\\/:*?"<>|]/g, '_');

    // 2. 将一个或多个空格替换为单个底线
    safeName = safeName.replace(/\s+/g, '_');

    // 3. 移除档名开头和结尾的底线或点
    safeName = safeName.replace(/^_+|_+$/g, '').replace(/^\.+|\.+$/g, '');
    if (!safeName) safeName = "renamed_file"; // 如果档名变成空的，给一个预设值

    // 4. 加上时间戳和随机字串以确保唯一性
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
            userRole: context.session ? context.session.role : 'anonymous' // 如果没有 session (auth 返回 null)，则为匿名
        });
    },

    getNoteFormPage: (context, noteIdToEdit) => {
        // 只有已认证的非匿名用户可以访问此页面
        if (!context.session || context.session.role === 'anonymous') {
            return sendForbidden(context.res, "匿名用户不能访问此页面。请先登录。");
        }
        serveHtmlWithPlaceholders(context.res, path.join(PUBLIC_DIR, 'note.html'), {
            username: context.session.username,
            noteId: noteIdToEdit || '',
            pageTitle: noteIdToEdit ? '编辑记事' : '新建记事'
        });
    },

    getAllNotes: (context) => {
        // context.session 可能为 null (如果 auth.js 中 "anyone" 用户不存在且用户未登录)
        // 或包含匿名用户信息，或包含已登录用户信息
        const sessionRole = context.session ? context.session.role : 'anonymous_fallback'; // 如果没有会话，则按最严格的匿名处理（或完全禁止）
        const sessionUserId = context.session ? context.session.userId : null;

        let notes = storage.getNotes();

        if (sessionRole === 'admin' || sessionRole === 'anonymous' || sessionRole === 'anonymous_fallback') {
            // 管理员和匿名用户（如果启用了匿名访问）可以看到所有记事
            // anonymous_fallback 意味着 "anyone" 用户不存在，但我们仍按匿名逻辑显示所有记事（如果路由允许）
            notes = notes.map(note => {
                const owner = storage.findUserById(note.userId);
                return { ...note, ownerUsername: owner ? owner.username : '未知用户' };
            }).sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        } else { // 普通登录用户看自己的
            notes = notes.filter(note => note.userId === sessionUserId)
                         .sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        }
        serveJson(context.res, notes);
    },

    getNoteById: (context) => {
        const noteId = context.pathname.split('/').pop();
        const note = storage.findNoteById(noteId);
        if (!note) return sendNotFound(context.res, "找不到指定的记事。");
        
        const sessionRole = context.session ? context.session.role : 'anonymous_fallback';
        const sessionUserId = context.session ? context.session.userId : null;

        // 匿名用户可以查看任何记事
        if (sessionRole === 'anonymous' || sessionRole === 'anonymous_fallback') {
            return serveJson(context.res, note);
        }
        // 登录用户权限检查
        if (sessionRole !== 'admin' && note.userId !== sessionUserId) {
            return sendForbidden(context.res, "您无权查看此记事。");
        }
        serveJson(context.res, note);
    },

    createNote: (context) => {
        if (!context.session || context.session.role === 'anonymous') {
            return sendForbidden(context.res, "匿名用户不能创建记事。请先登录。");
        }
        const { title, content } = context.body;
        const attachmentFile = context.files && context.files.attachment;
        if (!title || title.trim() === '' || !content || content.trim() === '') {
            return sendBadRequest(context.res, "标题和内容不能为空。");
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
            } catch (e) { 
                console.error("保存附件失败:", e);
                return sendError(context.res, "保存附件时发生错误。"); 
            }
        }
        const savedNote = storage.saveNote(newNoteData);
        if (savedNote) serveJson(context.res, savedNote, 201);
        else sendError(context.res, "保存记事失败。");
    },

    updateNote: (context) => {
        if (!context.session || context.session.role === 'anonymous') {
            return sendForbidden(context.res, "匿名用户不能修改记事。请先登录。");
        }
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
            } catch (e) { 
                console.error("更新时保存新附件失败:", e);
                return sendError(context.res, "更新时保存新附件失败。"); 
            }
        }
        const savedNote = storage.saveNote(updatedNoteData);
        if (savedNote) serveJson(context.res, savedNote);
        else sendError(context.res, "更新记事失败。");
    },

    deleteNoteById: (context) => {
        if (!context.session || context.session.role === 'anonymous') {
            return sendForbidden(context.res, "匿名用户不能删除记事。请先登录。");
        }
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
