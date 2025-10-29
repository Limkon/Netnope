// router.js - 请求路由处理
const url = require('url');
const querystring = require('querystring');
const path = require('path');
const fs = require('fs');
const { authenticate } = require('./auth');
const userController = require('./userController');
const articleController = require('./articleController'); // 重命名
const commentController = require('./commentController'); // 新增
const { serveStaticFile, sendNotFound, redirect, sendForbidden, sendError, sendBadRequest, serveHtmlWithPlaceholders } = require('./responseUtils');
const storage = require('./storage');

const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOADS_DIR = storage.UPLOADS_DIR;

// (parseMultipartFormData 函数保持不变)
function parseMultipartFormData(rawBuffer, contentTypeHeader) {
    const boundaryMatch = contentTypeHeader.match(/boundary=(.+)/);
    if (!boundaryMatch) {
        console.warn("解析 multipart/form-data 失败：找不到 boundary。");
        return { fields: {}, files: {} };
    }
    const boundary = `--${boundaryMatch[1]}`;
    const result = { fields: {}, files: {} };
    let lastIndex = 0;
    let boundaryIndex = rawBuffer.indexOf(boundary, lastIndex);
    while (boundaryIndex !== -1) {
        let nextBoundaryIndex = rawBuffer.indexOf(boundary, boundaryIndex + boundary.length);
        if (nextBoundaryIndex === -1) break;
        const partStart = boundaryIndex + boundary.length + 2;
        const partEnd = nextBoundaryIndex - 2;
        if (partStart >= partEnd) {
            boundaryIndex = nextBoundaryIndex; continue;
        }
        const partBuffer = rawBuffer.subarray(partStart, partEnd);
        const separatorIndex = partBuffer.indexOf('\r\n\r\n');
        if (separatorIndex === -1) {
            boundaryIndex = nextBoundaryIndex; continue;
        }
        const headerBuffer = partBuffer.subarray(0, separatorIndex);
        const bodyBuffer = partBuffer.subarray(separatorIndex + 4);
        const headerString = headerBuffer.toString('utf-8');
        const dispositionLine = headerString.split('\r\n').find(line => line.toLowerCase().startsWith('content-disposition:'));
        if (!dispositionLine) {
            boundaryIndex = nextBoundaryIndex; continue;
        }
        const fieldNameMatch = dispositionLine.match(/name="([^"]+)"/i);
        if (!fieldNameMatch) {
            boundaryIndex = nextBoundaryIndex; continue;
        }
        const fieldName = fieldNameMatch[1];
        let originalFileName = "unknown_file.dat";
        const filenameStarMatch = dispositionLine.match(/filename\*=(utf-8|iso-8859-1)''([^;]+)/i);
        if (filenameStarMatch) {
            const encodedName = filenameStarMatch[2];
            try { originalFileName = decodeURIComponent(encodedName); }
            catch (e) { console.warn(`解碼 filename* 属性 "${encodedName}" 失败:`, e); originalFileName = "fallback_filename_decode_error.dat"; }
        } else {
            const filenameMatch = dispositionLine.match(/filename="((?:[^"\\]|\\.)*)"/i);
            if (filenameMatch) {
                let name = filenameMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                try { originalFileName = decodeURIComponent(name); }
                catch (e) { console.warn(`解码普通 filename 属性 "${name}" 失败:`, e); originalFileName = name; }
            }
        }
        if (dispositionLine.includes('filename=')) {
            const contentTypeMatch = headerString.match(/Content-Type: (.+)/i);
            const fileContentType = contentTypeMatch ? contentTypeMatch[1].trim() : 'application/octet-stream';
            result.files[fieldName] = { filename: originalFileName, contentType: fileContentType, content: bodyBuffer };
        } else {
            result.fields[fieldName] = bodyBuffer.toString('utf-8');
        }
        boundaryIndex = nextBoundaryIndex;
    }
    return result;
}


module.exports = {
    handleRequest: async (req, res, rawBuffer) => {
        const parsedUrl = url.parse(req.url, true);
        const pathname = parsedUrl.pathname;
        const method = req.method.toUpperCase();
        const query = parsedUrl.query;
        const headers = req.headers;
        let body = {}; let files = {};

        if ((method === 'POST' || method === 'PUT') && rawBuffer && rawBuffer.length > 0) {
            const contentType = headers['content-type'] || '';
            if (contentType.includes('application/x-www-form-urlencoded')) {
                try { body = querystring.parse(rawBuffer.toString('utf8')); }
                catch (e) { return sendBadRequest(res, "请求体格式错误。"); }
            } else if (contentType.includes('application/json')) {
                try { body = JSON.parse(rawBuffer.toString('utf8')); }
                catch (e) { return sendBadRequest(res, "JSON 格式错误。"); }
            } else if (contentType.includes('multipart/form-data')) {
                try {
                    const parsedMultipart = parseMultipartFormData(rawBuffer, contentType);
                    body = parsedMultipart.fields; files = parsedMultipart.files;
                } catch (e) { console.error("解析 multipart/form-data 请求体错误:", e); return sendError(res, "处理上传文件时发生错误。"); }
            }
        }

        const context = { req, res, pathname, method, query, files, body, rawBuffer, session: null };
        context.session = authenticate(req);

        // --- 静态文件路由 (CSS, JS, Uploads) ---
        if (method === 'GET') {
            if (pathname.startsWith('/css/') || pathname.startsWith('/js/')) {
                const staticFilePath = path.join(PUBLIC_DIR, pathname);
                if (path.resolve(staticFilePath).startsWith(path.resolve(PUBLIC_DIR))) return serveStaticFile(res, staticFilePath);
                else return sendForbidden(res, "禁止访问此路径的静态资源。");
            }
            if (pathname.startsWith('/uploads/')) {
                if (!context.session) {
                    return sendForbidden(res, "您需要登录或启用匿名访问才能下载附件。");
                }
                const requestedFileRelativePath = decodeURIComponent(pathname.substring('/uploads/'.length));
                const fullPath = path.join(UPLOADS_DIR, requestedFileRelativePath);
                if (!path.resolve(fullPath).startsWith(path.resolve(UPLOADS_DIR))) {
                    return sendForbidden(res, "禁止访问此文件路径！");
                }
                if (!fs.existsSync(fullPath)) {
                    return sendNotFound(res, "请求的附件不存在。");
                }
                
                // 权限检查：附件是附加在文章上的
                const article = storage.getArticles().find(n => n.attachment && n.attachment.path === requestedFileRelativePath);
                
                // 如果找不到文章，或者文章未发布
                if (!article || article.status !== 'published') {
                    // 只有 Admin 或 作者本人 (Consultant) 能下载
                    if (!context.session || (context.session.role !== 'admin' && context.session.userId !== (article ? article.userId : null))) {
                         return sendForbidden(res, "您无权下载此附件（文章未发布或不存在）。");
                    }
                }
                // 如果文章已发布，则所有人 (anonymous, member, consultant, admin) 都能下载
                return serveStaticFile(res, fullPath);
            }
        }

        // --- 公共页面和 API (无需登录或匿名即可访问) ---
        if (pathname === '/login' && method === 'GET') return userController.getLoginPage(context);
        if (pathname === '/login' && method === 'POST') return userController.loginUser(context);
        if (pathname === '/register' && method === 'GET') return userController.getRegisterPage(context);
        if (pathname === '/api/users/register' && method === 'POST') return userController.registerUser(context);
        if (pathname === '/article/view' && method === 'GET') return articleController.getArticleViewPage(context); // 重命名

        // 匿名用户 (session.role === 'anonymous') 的路由
        if (context.session && context.session.role === 'anonymous') {
            if ((pathname === '/' || pathname === '/index.html') && method === 'GET') return articleController.getArticlesPage(context); // 重命名
            // (修改) /api/articles 现在处理分页和过滤
            if (pathname === '/api/articles' && method === 'GET') return articleController.getAllArticles(context); // 重命名
            if (pathname.startsWith('/api/articles/') && pathname.endsWith('/comments') && method === 'GET') return commentController.getCommentsForArticle(context); // 新增
            
            // 匿名用户不能访问API获取单个文章数据 (getArticleById)
            if (pathname.startsWith('/api/articles/') && method === 'GET' && !pathname.endsWith('/comments')) {
                return sendForbidden(res, "匿名用户无权直接访问此API。");
            }

            // 拦截所有其他非 GET 请求或非允许的页面
            if (method !== 'GET' || (pathname !== '/' && pathname !== '/index.html' && pathname !== '/article/view' && pathname !== '/api/articles' && !pathname.endsWith('/comments'))) {
                if (pathname.startsWith('/api/')) return sendForbidden(res, "匿名用户无权执行此操作。");
                return redirect(res, '/login');
            }
        }

        // --- 需要会话 (session) 的路由 (如果 session 为 null 则拦截) ---
        if (!context.session || context.session.role === 'anonymous') {
            // 对于 /api/articles，如果匿名访问未启用 (context.session 为 null)，则禁止
            if (pathname === '/api/articles' && !context.session) {
                 return sendUnauthorized(res, "请先登录后再操作。");
            }
            // 允许匿名访问 /api/articles (上面已处理)
            if (pathname.startsWith('/api/') && pathname !== '/api/articles' && !pathname.endsWith('/comments')) { 
                 return sendUnauthorized(res, "请先登录后再操作。");
            }
            // 允许匿名访问 /, /index.html, /article/view (上面已处理)
            if (!pathname.startsWith('/api/') && pathname !== '/login' && pathname !== '/register' && pathname !== '/article/view' && pathname !== '/' && pathname !== '/index.html') {
                 return redirect(res, '/login');
            }
            if (!context.session && (pathname === '/' || pathname === '/index.html' || pathname === '/article/view')) {
                return redirect(res, '/login');
            }
        }

        // --- 登录用户 (member, consultant, admin) 路由 ---
        if (pathname === '/logout' && method === 'POST') return userController.logoutUser(context);
        if (pathname === '/change-password' && method === 'GET') return userController.getChangePasswordPage(context);
        if (pathname === '/api/users/me/password' && method === 'POST') return userController.changeOwnPassword(context);
        if ((pathname === '/' || pathname === '/index.html') && method === 'GET') return articleController.getArticlesPage(context);
        
        // 文章 API
        if (pathname === '/api/articles' && method === 'GET') return articleController.getAllArticles(context);
        if (pathname === '/api/articles' && method === 'POST') return articleController.createArticle(context); // 权限：consultant/admin
        if (pathname.startsWith('/api/articles/') && !pathname.includes('/comments') && method === 'GET') return articleController.getArticleById(context); // 权限：consultant/admin
        if (pathname.startsWith('/api/articles/') && !pathname.includes('/comments') && method === 'PUT') return articleController.updateArticle(context); // 权限：consultant(owner)/admin
        if (pathname.startsWith('/api/articles/') && !pathname.includes('/comments') && method === 'DELETE') return articleController.deleteArticleById(context); // 权限：consultant(owner)/admin
        
        // 文章页面
        if (pathname === '/article/new' && method === 'GET') return articleController.getArticleFormPage(context, null); // 权限：consultant/admin
        if (pathname === '/article/edit' && method === 'GET') { // 权限：consultant(owner)/admin
            if (!query.id) return sendBadRequest(res, "缺少文章 ID 进行编辑。");
            return articleController.getArticleFormPage(context, query.id);
        }

        // 评论 API (需要登录)
        if (pathname.startsWith('/api/articles/') && pathname.endsWith('/comments') && method === 'GET') return commentController.getCommentsForArticle(context);
        if (pathname.startsWith('/api/articles/') && pathname.endsWith('/comments') && method === 'POST') return commentController.createComment(context); // 权限：member/consultant
        if (pathname.startsWith('/api/comments/') && method === 'DELETE') return commentController.deleteCommentById(context); // 权限：admin/owner

        // --- 仅限 Admin 路由 ---
        if (context.session && context.session.role === 'admin') {
            if (pathname === '/admin/users' && method === 'GET') return userController.getAdminUsersPage(context);
            if (pathname === '/api/admin/users' && method === 'GET') return userController.listAllUsers(context);
            if (pathname === '/api/admin/users' && method === 'POST') return userController.createUserByAdmin(context);
            if (pathname.startsWith('/api/admin/users/') && pathname.endsWith('/password') && method === 'PUT') {
                return userController.updateUserPasswordByAdmin(context);
            }
            if (pathname.startsWith('/api/admin/users/') && method === 'DELETE') return userController.deleteUserByAdmin(context);
            
            // (新增) 设置 API 路由
            if (pathname === '/api/admin/settings' && method === 'GET') return userController.getSiteSettings(context);
            if (pathname === '/api/admin/settings' && method === 'POST') return userController.updateSiteSettings(context);

            // (新增) 置顶 API 路由
            if (pathname.startsWith('/api/admin/articles/') && pathname.endsWith('/pin') && method === 'PUT') {
                return articleController.toggleArticlePinStatus(context);
            }
        } else {
            if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
                return sendForbidden(res, "您没有权限访问此管理员功能。");
            }
        }

        return sendNotFound(res, `请求的路径 ${pathname} 未找到。`);
    }
};
