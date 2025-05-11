// router.js - 请求路由处理
const url = require('url');
const querystring = require('querystring');
const path = require('path');
const fs = require('fs');
const { authenticate } = require('./auth');
const userController = require('./userController');
const noteController = require('./noteController');
const { serveStaticFile, sendNotFound, redirect, sendForbidden, sendError, sendBadRequest, serveHtmlWithPlaceholders } = require('./responseUtils');
const storage = require('./storage');

const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOADS_DIR = storage.UPLOADS_DIR;

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

        const context = { req, res, pathname, method, query, headers, body, files, rawBuffer, session: null };
        context.session = authenticate(req);

        if (method === 'GET') {
            if (pathname.startsWith('/css/') || pathname.startsWith('/js/')) {
                const staticFilePath = path.join(PUBLIC_DIR, pathname);
                if (path.resolve(staticFilePath).startsWith(path.resolve(PUBLIC_DIR))) return serveStaticFile(res, staticFilePath);
                else return sendForbidden(res, "禁止访问此路径的静态资源。");
            }
            if (pathname.startsWith('/uploads/')) {
                if (!context.session || context.session.role === 'anonymous') {
                    return sendForbidden(res, "您无权下载附件。");
                }
                const requestedFileRelativePath = decodeURIComponent(pathname.substring('/uploads/'.length));
                const fullPath = path.join(UPLOADS_DIR, requestedFileRelativePath);
                if (!path.resolve(fullPath).startsWith(path.resolve(UPLOADS_DIR))) return sendForbidden(res, "禁止访问此文件路径！");
                const note = storage.getNotes().find(n => n.attachment && n.attachment.path === requestedFileRelativePath);
                if (context.session.role !== 'admin' && (!note || note.userId !== context.session.userId)) return sendForbidden(res, "您无权访问此附件。");
                if (!fs.existsSync(fullPath)) return sendNotFound(res, "请求的附件不存在。");
                return serveStaticFile(res, fullPath);
            }
        }

        if (pathname === '/login' && method === 'GET') return userController.getLoginPage(context);
        if (pathname === '/login' && method === 'POST') return userController.loginUser(context);
        if (pathname === '/register' && method === 'GET') return userController.getRegisterPage(context);
        if (pathname === '/api/users/register' && method === 'POST') return userController.registerUser(context);
        
        // 新增：查看单个记事页面路由
        if (pathname === '/note/view' && method === 'GET') return noteController.getNoteViewPage(context);


        if (context.session && context.session.role === 'anonymous') {
            if ((pathname === '/' || pathname === '/index.html') && method === 'GET') return noteController.getNotesPage(context);
            if (pathname === '/api/notes' && method === 'GET') return noteController.getAllNotes(context); // 允许匿名获取所有笔记API
            // /note/view GET 已在上面处理，匿名用户可以访问
            // 匿名用户不能访问 /api/notes/:id (此API用于编辑数据加载)
            
            if (method !== 'GET' || (pathname !== '/' && pathname !== '/index.html' && pathname !== '/note/view' && !pathname.startsWith('/api/notes'))) {
                if (pathname.startsWith('/api/')) return sendForbidden(res, "匿名用户无权执行此操作。");
                return redirect(res, '/login');
            }
        }

        if (!context.session || context.session.role === 'anonymous') {
            if (pathname.startsWith('/api/') && pathname !== '/api/notes') { // 允许匿名用户访问 /api/notes
                 return sendUnauthorized(res, "请先登录后再操作。");
            }
            // 对于非API的、需要登录的页面，如果不是登录或注册页，则重定向
            if (!pathname.startsWith('/api/') && pathname !== '/login' && pathname !== '/register' && pathname !== '/note/view' && pathname !== '/' && pathname !== '/index.html') {
                 return redirect(res, '/login');
            }
            // 如果是首页或查看页，但匿名访问未启用（即 context.session 为 null），则也应重定向
            if (!context.session && (pathname === '/' || pathname === '/index.html' || pathname === '/note/view')) {
                return redirect(res, '/login');
            }
            if (!context.session && pathname.startsWith('/api/notes')) { // 如果匿名访问未启用，禁止访问笔记API
                 return sendUnauthorized(res, "请先登录后再操作。");
            }
            // 如果是其他情况（例如匿名用户访问允许的页面），则不执行任何操作，让后续路由处理
        }


        if (pathname === '/logout' && method === 'POST') return userController.logoutUser(context);
        if (pathname === '/change-password' && method === 'GET') return userController.getChangePasswordPage(context);
        if (pathname === '/api/users/me/password' && method === 'POST') return userController.changeOwnPassword(context);
        if ((pathname === '/' || pathname === '/index.html') && method === 'GET') return noteController.getNotesPage(context);
        if (pathname === '/api/notes' && method === 'GET') return noteController.getAllNotes(context); // 已登录用户获取笔记
        if (pathname === '/api/notes' && method === 'POST') return noteController.createNote(context);
        if (pathname.startsWith('/api/notes/') && method === 'GET') return noteController.getNoteById(context); // API 获取单个笔记数据
        if (pathname.startsWith('/api/notes/') && method === 'PUT') return noteController.updateNote(context);
        if (pathname.startsWith('/api/notes/') && method === 'DELETE') return noteController.deleteNoteById(context);
        if (pathname === '/note/new' && method === 'GET') return noteController.getNoteFormPage(context, null);
        if (pathname === '/note/edit' && method === 'GET') {
            if (!query.id) return sendBadRequest(res, "缺少记事 ID 进行编辑。");
            return noteController.getNoteFormPage(context, query.id);
        }

        if (context.session && context.session.role === 'admin') { // 确保 session 存在再检查 role
            if (pathname === '/admin/users' && method === 'GET') return userController.getAdminUsersPage(context);
            if (pathname === '/api/admin/users' && method === 'GET') return userController.listAllUsers(context);
            if (pathname === '/api/admin/users' && method === 'POST') return userController.createUserByAdmin(context);
            if (pathname.startsWith('/api/admin/users/') && pathname.endsWith('/password') && method === 'PUT') {
                return userController.updateUserPasswordByAdmin(context);
            }
            if (pathname.startsWith('/api/admin/users/') && method === 'DELETE') return userController.deleteUserByAdmin(context);
        } else {
            if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
                return sendForbidden(res, "您没有权限访问此管理员功能。");
            }
        }

        return sendNotFound(res, `请求的路径 ${pathname} 未找到。`);
    }
};
