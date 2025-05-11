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

function getNavData(session) {
    return {
        username: session ? session.username : '访客',
        userRole: session ? session.role : 'anonymous',
        userId: session ? session.userId : '' 
    };
}

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
        serveHtmlWithPlaceholders(context.res, path.join(PUBLIC_DIR, 'index.html'), {
            ...getNavData(context.session)
        });
    },

    getNoteFormPage: (context, noteIdToEdit) => {
        if (!context.session || context.session.role === 'anonymous') {
            return sendForbidden(context.res, "匿名用户不能访问此页面。请先登录。");
        }
        serveHtmlWithPlaceholders(context.res, path.join(PUBLIC_DIR, 'note.html'), {
            ...getNavData(context.session),
            noteId: noteIdToEdit || '',
            pageTitle: noteIdToEdit ? '编辑记事' : '新建记事'
        });
    },

    getNoteViewPage: (context) => {
        // console.log(`[DEBUG getNoteViewPage] 开始处理查看记事请求，查询参数:`, context.query);
        const noteId = context.query.id;
        if (!noteId) {
            // console.error("[DEBUG getNoteViewPage] 错误: 缺少记事ID。");
            return sendBadRequest(context.res, "缺少记事ID。");
        }
        // console.log(`[DEBUG getNoteViewPage] 尝试查找记事 ID: ${noteId}`);
        const note = storage.findNoteById(noteId);
        if (!note) {
            // console.error(`[DEBUG getNoteViewPage] 错误: 找不到记事 ID: ${noteId}`);
            return sendNotFound(context.res, "找不到指定的记事。");
        }
        // console.log(`[DEBUG getNoteViewPage] 找到记事:`, {title: note.title, id: note.id});

        const sessionRole = context.session ? context.session.role : 'anonymous_fallback';
        const sessionUserId = context.session ? context.session.userId : null;

        let canView = false;
        if (sessionRole === 'anonymous' || sessionRole === 'anonymous_fallback' || sessionRole === 'admin') {
            canView = true;
        } else if (sessionUserId && note.userId === sessionUserId) {
            canView = true;
        }

        if (!canView) {
            // console.warn(`[DEBUG getNoteViewPage] 禁止访问: 用户 (ID: ${sessionUserId}, Role: ${sessionRole}) 尝试查看不属于自己的记事 (ID: ${noteId})`);
            return sendForbidden(context.res, "您无权查看此记事。");
        }

        const owner = storage.findUserById(note.userId);
        const templateData = {
            ...getNavData(context.session),
            noteTitle: note.title,
            noteContent: note.content, 
            noteId: note.id,
            noteOwnerUsername: owner ? owner.username : '未知用户',
            noteCreatedAt: new Date(note.createdAt).toLocaleString('zh-CN'),
            noteUpdatedAt: new Date(note.updatedAt).toLocaleString('zh-CN'),
            noteAttachmentPath: note.attachment ? note.attachment.path : null,
            noteAttachmentOriginalName: note.attachment ? note.attachment.originalName : null,
            noteAttachmentSizeKB: note.attachment ? (note.attachment.size / 1024).toFixed(1) : null,
            canEdit: context.session && context.session.role !== 'anonymous' && (context.session.role === 'admin' || note.userId === context.session.userId)
        };
        // console.log(`[DEBUG getNoteViewPage] 准备传递给模板的数据 (部分):`, {
        //     noteTitle: templateData.noteTitle,
        //     noteAttachmentPath: templateData.noteAttachmentPath,
        //     noteAttachmentSizeKB: templateData.noteAttachmentSizeKB,
        //     canEdit: templateData.canEdit,
        //     username: templateData.username,
        //     userRole: templateData.userRole
        // });
        // console.log(`[DEBUG getNoteViewPage] 调用 serveHtmlWithPlaceholders 渲染 view-note.html`);
        serveHtmlWithPlaceholders(context.res, path.join(PUBLIC_DIR, 'view-note.html'), templateData);
    },


    getAllNotes: (context) => {
        const sessionRole = context.session ? context.session.role : 'anonymous_fallback';
        const sessionUserId = context.session ? context.session.userId : null;
        const searchTerm = context.query.search ? context.query.search.toLowerCase() : null;
        let notes = storage.getNotes();
        if (searchTerm) {
            notes = notes.filter(note => {
                const titleMatch = note.title.toLowerCase().includes(searchTerm);
                const contentText = note.content.replace(/<[^>]+>/g, '');
                const contentMatch = contentText.toLowerCase().includes(searchTerm);
                return titleMatch || contentMatch;
            });
        }
        if (sessionRole === 'admin' || sessionRole === 'anonymous' || sessionRole === 'anonymous_fallback') {
            notes = notes.map(note => {
                const owner = storage.findUserById(note.userId);
                return { ...note, ownerUsername: owner ? owner.username : '未知用户' };
            }).sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        } else { 
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
        if (sessionRole === 'anonymous' || sessionRole === 'anonymous_fallback') {
            return sendForbidden(context.res, "匿名用户无权直接访问此API。");
        }
        if (sessionRole !== 'admin' && note.userId !== sessionUserId) {
            return sendForbidden(context.res, "您无权访问此记事数据。");
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
