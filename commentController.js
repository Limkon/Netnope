// commentController.js - 评论相关操作的控制器
const storage = require('./storage');
const {
    serveJson,
    sendError,
    sendNotFound,
    sendForbidden,
    sendBadRequest
} = require('./responseUtils');

module.exports = {
    // API: 获取某篇文章的所有评论
    getCommentsForArticle: (context) => {
        const pathParts = context.pathname.split('/'); 
        const articleId = pathParts[3]; // /api/articles/{articleId}/comments

        if (!articleId) {
            return sendBadRequest(context.res, "缺少文章 ID。");
        }
        
        // 验证文章是否存在且已发布 (或用户有权查看)
        const article = storage.findArticleById(articleId);
        if (!article) {
             return sendNotFound(context.res, "找不到关联的文章。");
        }
        
        const sessionRole = context.session ? context.session.role : 'anonymous';
        if (article.status !== 'published') {
            if (sessionRole !== 'admin' && article.userId !== (context.session ? context.session.userId : null)) {
                return sendForbidden(context.res, "无法加载未发布文章的评论。");
            }
        }

        // 获取评论并附加上下文信息（例如评论者用户名）
        const comments = storage.getComments(articleId).map(comment => {
            const user = storage.findUserById(comment.userId);
            return {
                ...comment,
                username: user ? user.username : '未知用户',
                // 允许删除吗？(管理员或评论作者)
                canDelete: context.session && (context.session.role === 'admin' || context.session.userId === comment.userId)
            };
        });
        
        serveJson(context.res, comments);
    },

    // API: 创建评论
    createComment: (context) => {
        // 权限检查：(修改) 允许 'anonymous' (即 'anyone' 用户)
        if (!context.session || (context.session.role !== 'member' && context.session.role !== 'consultant' && context.session.role !== 'anonymous')) {
            return sendForbidden(context.res, "您必须登录才能发表评论。");
        }
        
        const pathParts = context.pathname.split('/'); 
        const articleId = pathParts[3]; // /api/articles/{articleId}/comments
        const { content } = context.body;

        if (!articleId) {
            return sendBadRequest(context.res, "缺少文章 ID。");
        }
        if (!content || content.trim() === '') {
            return sendBadRequest(context.res, "评论内容不能为空。");
        }

        // 验证文章是否存在
        const article = storage.findArticleById(articleId);
        if (!article || article.status !== 'published') {
             return sendForbidden(context.res, "无法评论不存在或未发布的文章。");
        }

        const newComment = {
            articleId: articleId,
            userId: context.session.userId,
            content: content.trim()
        };

        const savedComment = storage.saveComment(newComment);
        if (savedComment) {
            // 返回附带用户名的评论
            const user = storage.findUserById(savedComment.userId);
            const commentWithUser = {
                ...savedComment,
                username: user ? user.username : '未知用户',
                canDelete: true // 作者本人总能删除
            };
            serveJson(context.res, commentWithUser, 201);
        } else {
            sendError(context.res, "保存评论失败。");
        }
    },

    // API: 删除评论
    deleteCommentById: (context) => {
        const pathParts = context.pathname.split('/'); 
        const commentId = pathParts[3]; // /api/comments/{commentId}

        if (!commentId) {
            return sendBadRequest(context.res, "缺少评论 ID。");
        }

        const commentToDelete = storage.findCommentById(commentId);
        if (!commentToDelete) {
            return sendNotFound(context.res, "找不到要删除的评论。");
        }

        // 权限检查：必须是 admin 或 评论作者
        if (!context.session || (context.session.role !== 'admin' && commentToDelete.userId !== context.session.userId)) {
            return sendForbidden(context.res, "您无权删除此评论。");
        }

        if (storage.deleteComment(commentId)) {
            serveJson(context.res, { message: `评论 (ID: ${commentId}) 已成功删除。` });
        } else {
            sendError(context.res, "删除评论失败。");
        }
    }
};
