// articleController.js - 文章相关操作控制器 (置顶流与全站导航强化版)
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

// 辅助函数：提取导航公共数据
function getNavData(session) {
    let sessionUsername = '访客';
    if (session) {
        if (session.username === 'anyone' || (session.role === 'anonymous' && session.username === '匿名用戶')) {
            sessionUsername = '匿名用戶';
        } else if (session.username) {
            sessionUsername = session.username;
        }
    }
    
    return {
        username: sessionUsername,
        userRole: session ? session.role : 'anonymous',
        userId: session ? session.userId : ''
    };
}

// 辅助函数：显示名称格式化
function getDisplayName(user) {
    if (!user) return '未知用户';
    return (user.username === 'anyone') ? '匿名用戶' : user.username;
}

// 辅助函数：安全唯一文件名生成
function sanitizeAndMakeUniqueFilename(originalFilename, userId) {
    let safeName = originalFilename.replace(/[\\/:*?"<>|]/g, '_');
    safeName = safeName.replace(/\s+/g, '_');
    safeName = safeName.replace(/^_+|_+$/g, '').replace(/^\.+|\.+$/g, '');
    if (!safeName) safeName = "renamed_file";
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 7);
    return `${timestamp}_${randomSuffix}_${safeName}`;
}

// 辅助函数：布尔类型安全解析
function parseBoolean(val) {
    return val === true || val === 'true' || val === 1 || val === '1';
}

module.exports = {
    // 首页文章列表模板渲染
    getArticlesPage: (context) => {
        serveHtmlWithPlaceholders(context.res, path.join(PUBLIC_DIR, 'index.html'), {
            ...getNavData(context.session)
        });
    },

    // 获取文章表单页面（新建或编辑）
    getArticleFormPage: (context, articleIdToEdit) => {
        // 权限检查：consultant 或 admin
        if (!context.session || (context.session.role !== 'consultant' && context.session.role !== 'admin')) {
            return sendForbidden(context.res, "您没有权限创建或编辑文章。请联系管理员升级为咨询师。");
        }
        
        // 咨询师只能编辑自己的文章
        if (articleIdToEdit && context.session.role === 'consultant') {
             const existingArticle = storage.findArticleById(articleIdToEdit);
             if (!existingArticle) return sendNotFound(context.res, "找不到指定的文章。");
             if (existingArticle.userId !== context.session.userId) {
                 return sendForbidden(context.res, "您只能编辑自己的文章。");
             }
        }

        const placeholders = {
            ...getNavData(context.session),
            articleId: articleIdToEdit || '',
            pageTitle: articleIdToEdit ? '编辑文章' : '发表新文章',
            isAdmin: context.session.role === 'admin'
        };
        serveHtmlWithPlaceholders(context.res, path.join(PUBLIC_DIR, 'article.html'), placeholders);
    },

    // 获取文章详情页面
    getArticleViewPage: (context) => {
        const articleId = context.query.id;
        if (!articleId) {
            return sendBadRequest(context.res, "缺少文章ID。");
        }
        const article = storage.findArticleById(articleId);
        if (!article) {
            return sendNotFound(context.res, "找不到指定的文章。");
        }
        
        const sessionRole = context.session ? context.session.role : 'anonymous';
        const sessionUserId = context.session ? context.session.userId : null;

        // 草稿只允许作者本人或管理员查看
        if (article.status !== 'published') {
            if (sessionRole !== 'admin' && article.userId !== sessionUserId) {
                 return sendForbidden(context.res, "此文章尚未发布，您无权查看。");
            }
        }

        const owner = storage.findUserById(article.userId);
        const templateData = {
            ...getNavData(context.session),
            articleTitle: article.title,
            articleContent: article.content,
            articleId: article.id,
            articleCategory: article.category || '未分类', 
            articleOwnerUsername: getDisplayName(owner),
            articleCreatedAt: new Date(article.createdAt).toLocaleString('zh-CN'),
            articleUpdatedAt: new Date(article.updatedAt).toLocaleString('zh-CN'),
            articleAttachmentPath: article.attachment ? article.attachment.path : null,
            articleAttachmentOriginalName: article.attachment ? article.attachment.originalName : null,
            articleAttachmentSizeKB: article.attachment ? (article.attachment.size / 1024).toFixed(1) : null,
            // 置顶状态注入
            isPinned: !!article.isPinned,
            // 权限判断
            canEdit: context.session && context.session.role !== 'anonymous' && 
                     (context.session.role === 'admin' || (context.session.role === 'consultant' && article.userId === sessionUserId)),
            canComment: context.session && (context.session.role === 'member' || context.session.role === 'consultant' || context.session.role === 'anonymous'),
            isAnonymous: (!context.session)
        };
        serveHtmlWithPlaceholders(context.res, path.join(PUBLIC_DIR, 'view-article.html'), templateData);
    },

    // API: 获取所有文章 (包含搜索、分类与置顶优先分页)
    getAllArticles: (context) => {
        const sessionRole = context.session ? context.session.role : 'anonymous';
        const sessionUserId = context.session ? context.session.userId : null;
        
        const searchTerm = context.query.search ? context.query.search.toLowerCase().trim() : null;
        const categoryFilter = context.query.category ? context.query.category.trim() : null;
        const requestedPage = parseInt(context.query.page, 10) || 1;
        
        const settings = storage.getSettings();
        const articlesPerPage = settings.articlesPerPage || 10;

        let articles = storage.getArticles();

        // 1. 角色可见性过滤
        if (sessionRole === 'consultant') {
            const myArticles = articles.filter(article => article.userId === sessionUserId);
            const otherPublishedArticles = articles.filter(article => article.userId !== sessionUserId && article.status === 'published');
            articles = [...myArticles, ...otherPublishedArticles];
        } else if (sessionRole === 'admin') {
            articles = articles;
        } else {
            articles = articles.filter(article => article.status === 'published');
        }

        // 提取全量可用分类
        const allCategories = [...new Set(articles.map(a => a.category || '未分类'))].sort();

        // 2. 分类筛选
        if (categoryFilter && categoryFilter !== 'all') {
            articles = articles.filter(article => (article.category || '未分类') === categoryFilter);
        }

        // 3. 关键字搜索 (标题、纯文本内容、分类)
        if (searchTerm) {
            articles = articles.filter(article => {
                const titleMatch = (article.title || '').toLowerCase().includes(searchTerm);
                const contentText = (article.content || '').replace(/<[^>]+>/g, '').toLowerCase();
                const contentMatch = contentText.includes(searchTerm);
                const categoryMatch = (article.category || '').toLowerCase().includes(searchTerm);
                return titleMatch || contentMatch || categoryMatch;
            });
        }
        
        // 4. 置顶优先排序与更新时间次级排序 (过滤后、分页前统一排序)
        const sortedArticles = [...articles].sort((a, b) => {
            const aPinned = !!a.isPinned;
            const bPinned = !!b.isPinned;
            // 置顶文章无条件排在最前
            if (aPinned && !bPinned) return -1;
            if (!aPinned && bPinned) return 1;
            // 同级别按最后更新时间倒序
            return new Date(b.updatedAt) - new Date(a.updatedAt);
        });

        // 5. 分页截取计算
        const totalArticles = sortedArticles.length;
        const totalPages = Math.max(1, Math.ceil(totalArticles / articlesPerPage));
        const validPage = Math.min(Math.max(1, requestedPage), totalPages);
        const startIndex = (validPage - 1) * articlesPerPage;
        const endIndex = startIndex + articlesPerPage;

        const paginatedArticles = sortedArticles
            .slice(startIndex, endIndex)
            .map(article => {
                const owner = storage.findUserById(article.userId);
                return { 
                    ...article, 
                    isPinned: !!article.isPinned,
                    ownerUsername: getDisplayName(owner) 
                };
            });

        serveJson(context.res, {
            articles: paginatedArticles,
            totalPages: totalPages,
            currentPage: validPage,
            totalArticles: totalArticles,
            categories: allCategories
        });
    },

    // API: 获取单篇文章数据
    getArticleById: (context) => {
        const articleId = context.pathname.split('/').pop();
        const article = storage.findArticleById(articleId);
        if (!article) return sendNotFound(context.res, "找不到指定的文章。");
        
        const sessionRole = context.session ? context.session.role : 'anonymous';
        const sessionUserId = context.session ? context.session.userId : null;

        if (sessionRole !== 'admin' && !(sessionRole === 'consultant' && article.userId === sessionUserId)) {
            return sendForbidden(context.res, "您无权访问此文章数据。");
        }
        serveJson(context.res, { ...article, isPinned: !!article.isPinned });
    },

    // API: 创建文章
    createArticle: (context) => {
        if (!context.session || (context.session.role !== 'consultant' && context.session.role !== 'admin')) {
            return sendForbidden(context.res, "您没有权限发表文章。");
        }
        
        const { title, content, category, status = 'draft', isPinned } = context.body;
        const attachmentFile = context.files && context.files.attachment;
        
        if (!title || title.trim() === '' || content === undefined || content === null) { 
             return sendBadRequest(context.res, "文章标题和正文内容不能为空。");
        }
        if (status !== 'published' && status !== 'draft') {
            return sendBadRequest(context.res, "无效的状态值。");
        }

        // 仅管理员有权设定 isPinned
        const isPinnedBool = (context.session.role === 'admin') ? parseBoolean(isPinned) : false;

        const newArticleData = { 
            userId: context.session.userId, 
            title: title.trim(), 
            content: content, 
            category: category ? category.trim() : '未分类',
            status: status,
            attachment: null,
            isPinned: isPinnedBool
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
                newArticleData.attachment = {
                    originalName: attachmentFile.filename,
                    path: attachmentRelativePath,
                    mimeType: attachmentFile.contentType || 'application/octet-stream',
                    size: attachmentFile.content.length
                };
            } catch (e) { 
                return sendError(context.res, "保存附件时发生错误。"); 
            }
        }
        
        const savedArticle = storage.saveArticle(newArticleData);
        if (savedArticle) serveJson(context.res, savedArticle, 201);
        else sendError(context.res, "保存文章失败。");
    },

    // API: 更新文章
    updateArticle: (context) => {
        const articleId = context.pathname.split('/').pop();
        const { title, content, category, status, removeAttachment, isPinned } = context.body;
        const attachmentFile = context.files && context.files.attachment;
        
        const existingArticle = storage.findArticleById(articleId);
        if (!existingArticle) return sendNotFound(context.res, "找不到要更新的文章。");

        if (!context.session || (context.session.role !== 'admin' && !(context.session.role === 'consultant' && existingArticle.userId === context.session.userId))) {
            return sendForbidden(context.res, "您无权修改此文章。");
        }
        
        if (!title || title.trim() === '' || content === undefined || content === null) {
            return sendBadRequest(context.res, "标题和正文内容不能为空。");
        }
        if (status && status !== 'published' && status !== 'draft') {
            return sendBadRequest(context.res, "无效的状态值。");
        }

        const isPinnedBool = (context.session.role === 'admin' && isPinned !== undefined) 
                             ? parseBoolean(isPinned) 
                             : (existingArticle.isPinned || false);

        const updatedArticleData = { 
            id: articleId, 
            userId: existingArticle.userId, 
            title: title.trim(), 
            content: content, 
            category: category ? category.trim() : existingArticle.category,
            status: status || existingArticle.status,
            attachment: existingArticle.attachment,
            isPinned: isPinnedBool
        };

        if (removeAttachment === 'true' && existingArticle.attachment) {
            const oldAttachmentPath = path.join(UPLOADS_DIR, existingArticle.attachment.path);
            if (fs.existsSync(oldAttachmentPath)) {
                try { fs.unlinkSync(oldAttachmentPath); } catch (e) {}
            }
            updatedArticleData.attachment = null;
        }

        if (attachmentFile && attachmentFile.content && attachmentFile.filename) {
            if (updatedArticleData.attachment && updatedArticleData.attachment.path) {
                 const oldAttachmentPath = path.join(UPLOADS_DIR, updatedArticleData.attachment.path);
                 if (fs.existsSync(oldAttachmentPath)) {
                    try { fs.unlinkSync(oldAttachmentPath); } catch (e) {}
                 }
            }
            const userUploadDir = path.join(UPLOADS_DIR, existingArticle.userId);
            if (!fs.existsSync(userUploadDir)) {
                try { fs.mkdirSync(userUploadDir, { recursive: true }); }
                catch (e) { return sendError(context.res, "处理附件时发生错误 (目录创建失败)。"); }
            }
            const uniqueFilenameForStorage = sanitizeAndMakeUniqueFilename(attachmentFile.filename, existingArticle.userId);
            const attachmentRelativePath = path.join(existingArticle.userId, uniqueFilenameForStorage);
            const attachmentFullPath = path.join(UPLOADS_DIR, attachmentRelativePath);
            try {
                fs.writeFileSync(attachmentFullPath, attachmentFile.content);
                updatedArticleData.attachment = {
                    originalName: attachmentFile.filename,
                    path: attachmentRelativePath,
                    mimeType: attachmentFile.contentType || 'application/octet-stream',
                    size: attachmentFile.content.length
                };
            } catch (e) { 
                return sendError(context.res, "更新时保存新附件失败。"); 
            }
        }
        
        const savedArticle = storage.saveArticle(updatedArticleData);
        if (savedArticle) serveJson(context.res, savedArticle);
        else sendError(context.res, "更新文章失败。");
    },

    // API: 切换文章置顶状态 (Admin 专属)
    toggleArticlePinStatus: (context) => {
        if (!context.session || context.session.role !== 'admin') {
            return sendForbidden(context.res, "您没有权限执行置顶操作。");
        }

        const pathParts = context.pathname.split('/'); 
        const articleId = pathParts[4]; // /api/admin/articles/{articleId}/pin

        if (!articleId) {
            return sendBadRequest(context.res, "缺少目标文章 ID。");
        }

        const existingArticle = storage.findArticleById(articleId);
        if (!existingArticle) {
            return sendNotFound(context.res, "找不到要置顶或取消置顶的文章。");
        }

        const updatedArticleData = {
            id: existingArticle.id,
            isPinned: !existingArticle.isPinned 
        };

        const savedArticle = storage.saveArticle(updatedArticleData);
        
        if (savedArticle) {
            serveJson(context.res, { 
                message: `文章《${savedArticle.title}》已成功${savedArticle.isPinned ? '置顶推荐' : '取消置顶'}。`,
                article: savedArticle 
            });
        } else {
            sendError(context.res, "更新文章置顶状态失败。");
        }
    },

    // API: 删除文章
    deleteArticleById: (context) => {
        const articleId = context.pathname.split('/').pop();
        const articleToDelete = storage.findArticleById(articleId);
        if (!articleToDelete) return sendNotFound(context.res, "找不到要删除的文章。");

        if (!context.session || (context.session.role !== 'admin' && !(context.session.role === 'consultant' && articleToDelete.userId === context.session.userId))) {
            return sendForbidden(context.res, "您无权删除此文章。");
        }
        
        if (storage.deleteArticle(articleId)) {
            serveJson(context.res, { message: `文章 (ID: ${articleId}) 已成功删除。` });
        } else {
            sendError(context.res, "删除文章失败。");
        }
    }
};
