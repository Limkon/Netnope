// articleController.js - 文章相关操作的控制器 (由 noteController.js 重构)
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

// 辅助函数，用于获取传递给模板的导航数据
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
    // 首页（文章列表页）
    getArticlesPage: (context) => {
        // (无修改，因为分页和分类数据将通过 /api/articles 获取)
        serveHtmlWithPlaceholders(context.res, path.join(PUBLIC_DIR, 'index.html'), {
            ...getNavData(context.session)
        });
    },

    // 获取文章表单页面（新建或编辑）
    getArticleFormPage: (context, articleIdToEdit) => {
        // (无修改)
        // 只有 'consultant' 或 'admin' 可以访问此页面
        if (!context.session || (context.session.role !== 'consultant' && context.session.role !== 'admin')) {
            return sendForbidden(context.res, "您没有权限创建或编辑文章。请联系管理员升级为咨询师。");
        }
        
        // 如果是 admin 在编辑，他们可以编辑任何文章
        // 如果是 consultant，他们只能编辑自己的文章
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
            pageTitle: articleIdToEdit ? '编辑文章' : '发表新文章'
        };
        // 页面重命名为 article.html
        serveHtmlWithPlaceholders(context.res, path.join(PUBLIC_DIR, 'article.html'), placeholders);
    },

    // 获取文章详情页
    getArticleViewPage: (context) => {
        // (无修改)
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

        // 权限检查：
        // 1. 如果文章不是 'published'
        if (article.status !== 'published') {
            // 2. 只有 'admin' 或 作者本人 ('consultant') 才能查看
            if (sessionRole !== 'admin' && article.userId !== sessionUserId) {
                 return sendForbidden(context.res, "此文章尚未发布，您无权查看。");
            }
        }
        // 3. 如果文章已发布，所有人都可以查看 (admin, member, consultant, anonymous)

        const owner = storage.findUserById(article.userId);
        const templateData = {
            ...getNavData(context.session),
            articleTitle: article.title,
            articleContent: article.content, // 注意：富文本XSS风险
            articleId: article.id,
            articleCategory: article.category || '未分类', 
            articleOwnerUsername: owner ? owner.username : '未知用户',
            articleCreatedAt: new Date(article.createdAt).toLocaleString('zh-CN'),
            articleUpdatedAt: new Date(article.updatedAt).toLocaleString('zh-CN'),
            articleAttachmentPath: article.attachment ? article.attachment.path : null,
            articleAttachmentOriginalName: article.attachment ? article.attachment.originalName : null,
            articleAttachmentSizeKB: article.attachment ? (article.attachment.size / 1024).toFixed(1) : null,
            // 编辑权限：admin 或 (consultant 且是作者)
            canEdit: context.session && context.session.role !== 'anonymous' && 
                     (context.session.role === 'admin' || (context.session.role === 'consultant' && article.userId === sessionUserId)),
            // 评论权限：登录用户 (member 或 consultant)
            canComment: context.session && (context.session.role === 'member' || context.session.role === 'consultant'),
            
            // --- (修复) ---
            // 添加一个简单的布尔值，用于替换模板中 '==' 的复杂比较
            isAnonymous: (sessionRole === 'anonymous')
            // --- (修复结束) ---
        };
        // 页面重命名为 view-article.html
        serveHtmlWithPlaceholders(context.res, path.join(PUBLIC_DIR, 'view-article.html'), templateData);
    },

    // API: 获取所有文章 (*** 重大修改 ***)
    getAllArticles: (context) => {
        const sessionRole = context.session ? context.session.role : 'anonymous';
        const sessionUserId = context.session ? context.session.userId : null;
        
        // (新增) 获取查询参数
        const searchTerm = context.query.search ? context.query.search.toLowerCase() : null;
        const categoryFilter = context.query.category ? context.query.category : null;
        const requestedPage = parseInt(context.query.page, 10) || 1;
        
        // (新增) 获取设置
        const settings = storage.getSettings();
        const articlesPerPage = settings.articlesPerPage || 10;

        let articles = storage.getArticles();

        // 1. 根据角色过滤
        if (sessionRole === 'consultant') {
            // 咨询师：查看自己所有的文章（包括草稿） + 其他人已发布的文章
            const myArticles = articles.filter(article => article.userId === sessionUserId);
            const otherPublishedArticles = articles.filter(article => article.userId !== sessionUserId && article.status === 'published');
            articles = [...myArticles, ...otherPublishedArticles];
        } else if (sessionRole === 'admin') {
            // (更新) 管理员应该能看到所有文章，包括草稿
             articles = articles;
        } else {
            // Member, Anonymous：只能看 'published' 的文章
            articles = articles.filter(article => article.status === 'published');
        }

        // (新增) 提取所有可用分类 (在搜索前，基于角色可见的文章)
        const allCategories = [...new Set(articles.map(a => a.category || '未分类'))].sort();

        // 2. (新增) 根据分类过滤
        if (categoryFilter && categoryFilter !== 'all') {
            articles = articles.filter(article => (article.category || '未分类') === categoryFilter);
        }

        // 3. 根据搜索词过滤
        if (searchTerm) {
            articles = articles.filter(article => {
                const titleMatch = article.title.toLowerCase().includes(searchTerm);
                const contentText = article.content.replace(/<[^>]+>/g, '');
                const contentMatch = contentText.toLowerCase().includes(searchTerm);
                const categoryMatch = (article.category || '').toLowerCase().includes(searchTerm);
                return titleMatch || contentMatch || categoryMatch;
            });
        }
        
        // 4. (新增) 分页计算
        const totalArticles = articles.length;
        const totalPages = Math.ceil(totalArticles / articlesPerPage);
        const startIndex = (requestedPage - 1) * articlesPerPage;
        const endIndex = startIndex + articlesPerPage;
        
        let paginatedArticles = articles.slice(startIndex, endIndex);

        // 5. 附加作者信息并排序 (排序应该在分页 *之前* 进行)
        // (修正) 排序应在过滤后、分页前
        paginatedArticles = articles
            .sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt)) // 先排序
            .slice(startIndex, endIndex) // 再分页
            .map(article => { // 最后附加作者信息
                const owner = storage.findUserById(article.userId);
                return { ...article, ownerUsername: owner ? owner.username : '未知用户' };
            });

        // (修改) 返回包含分页和分类信息的数据结构
        serveJson(context.res, {
            articles: paginatedArticles,
            totalPages: totalPages,
            currentPage: requestedPage,
            totalArticles: totalArticles,
            categories: allCategories // 发送所有可用分类
        });
    },

    // API: 获取单篇文章 (用于编辑加载)
    getArticleById: (context) => {
        // (无修改)
        const articleId = context.pathname.split('/').pop();
        const article = storage.findArticleById(articleId);
        if (!article) return sendNotFound(context.res, "找不到指定的文章。");
        
        const sessionRole = context.session ? context.session.role : 'anonymous';
        const sessionUserId = context.session ? context.session.userId : null;

        // 权限检查：必须是 Admin 或是 作者 (Consultant)
        if (sessionRole !== 'admin' && !(sessionRole === 'consultant' && article.userId === sessionUserId)) {
            return sendForbidden(context.res, "您无权访问此文章数据。");
        }
        serveJson(context.res, article);
    },

    // API: 创建文章
    createArticle: (context) => {
        // (无修改)
        // 权限检查：必须是 consultant 或 admin
        if (!context.session || (context.session.role !== 'consultant' && context.session.role !== 'admin')) {
            return sendForbidden(context.res, "您没有权限发表文章。");
        }
        
        const { title, content, category, status = 'draft' } = context.body; // 新增字段
        const attachmentFile = context.files && context.files.attachment;
        
        if (!title || title.trim() === '' || content === undefined || content === null ) { 
             return sendBadRequest(context.res, "标题和内容不能为空。");
        }
        if (status !== 'published' && status !== 'draft') {
            return sendBadRequest(context.res, "无效的状态值。");
        }

        const newArticleData = { 
            userId: context.session.userId, 
            title: title.trim(), 
            content: content, 
            category: category || '未分类', // 新增
            status: status, // 新增
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
        // (无修改)
        const articleId = context.pathname.split('/').pop();
        const { title, content, category, status, removeAttachment } = context.body; // 新增字段
        const attachmentFile = context.files && context.files.attachment;
        
        const existingArticle = storage.findArticleById(articleId);
        if (!existingArticle) return sendNotFound(context.res, "找不到要更新的文章。");

        // 权限检查：必须是 admin 或 作者 (consultant)
        if (!context.session || (context.session.role !== 'admin' && !(context.session.role === 'consultant' && existingArticle.userId === context.session.userId))) {
            return sendForbidden(context.res, "您无权修改此文章。");
        }
        
        if (!title || title.trim() === '' || content === undefined || content === null ) {
            return sendBadRequest(context.res, "标题和内容不能为空。");
        }
        if (status && status !== 'published' && status !== 'draft') {
            return sendBadRequest(context.res, "无效的状态值。");
        }

        const updatedArticleData = { 
            id: articleId, 
            userId: existingArticle.userId, 
            title: title.trim(), 
            content: content, 
            category: category || existingArticle.category, // 更新
            status: status || existingArticle.status, // 更新
            attachment: existingArticle.attachment 
        };

        if (removeAttachment === 'true' && existingArticle.attachment) {
            const oldAttachmentPath = path.join(UPLOADS_DIR, existingArticle.attachment.path);
            if (fs.existsSync(oldAttachmentPath)) {
                try { fs.unlinkSync(oldAttachmentPath); } catch (e) { /* console.error(...) */ }
            }
            updatedArticleData.attachment = null;
        }

        if (attachmentFile && attachmentFile.content && attachmentFile.filename) {
            if (updatedArticleData.attachment && updatedArticleData.attachment.path) {
                 const oldAttachmentPath = path.join(UPLOADS_DIR, updatedArticleData.attachment.path);
                 if (fs.existsSync(oldAttachmentPath)) {
                    try { fs.unlinkSync(oldAttachmentPath); } catch (e) { /* ... */ }
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

    // API: 删除文章
    deleteArticleById: (context) => {
        // (无修改)
        const articleId = context.pathname.split('/').pop();
        const articleToDelete = storage.findArticleById(articleId);
        if (!articleToDelete) return sendNotFound(context.res, "找不到要删除的文章。");

        // 权限检查：必须是 admin 或 作者 (consultant)
        if (!context.session || (context.session.role !== 'admin' && !(context.session.role === 'consultant' && articleToDelete.userId === context.session.userId))) {
            return sendForbidden(context.res, "您无权删除此文章。");
        }
        
        // storage.deleteArticle 现在会一并删除附件和评论
        if (storage.deleteArticle(articleId)) {
            serveJson(context.res, { message: `文章 (ID: ${articleId}) 已成功删除。` });
        } else {
            sendError(context.res, "删除文章失败。");
        }
    }
};
