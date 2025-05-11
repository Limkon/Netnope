// router.js - 請求路由處理
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
        console.warn("解析 multipart/form-data 失敗：找不到 boundary。");
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
            catch (e) { console.warn(`解碼 filename* 屬性 "${encodedName}" 失敗:`, e); originalFileName = "fallback_filename_decode_error.dat"; }
        } else {
            const filenameMatch = dispositionLine.match(/filename="((?:[^"\\]|\\.)*)"/i);
            if (filenameMatch) {
                let name = filenameMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                try { originalFileName = decodeURIComponent(name); }
                catch (e) { console.warn(`解碼普通 filename 屬性 "${name}" 失敗:`, e); originalFileName = name; }
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
                catch (e) { return sendBadRequest(res, "請求體格式錯誤。"); }
            } else if (contentType.includes('application/json')) {
                try { body = JSON.parse(rawBuffer.toString('utf8')); }
                catch (e) { return sendBadRequest(res, "JSON 格式錯誤。"); }
            } else if (contentType.includes('multipart/form-data')) {
                try {
                    const parsedMultipart = parseMultipartFormData(rawBuffer, contentType);
                    body = parsedMultipart.fields; files = parsedMultipart.files;
                } catch (e) { console.error("解析 multipart/form-data 請求體錯誤:", e); return sendError(res, "處理上傳檔案時發生錯誤。"); }
            }
        }

        const context = { req, res, pathname, method, query, headers, body, files, rawBuffer, session: null };
        context.session = authenticate(req);

        if (method === 'GET') {
            if (pathname.startsWith('/css/') || pathname.startsWith('/js/')) {
                const staticFilePath = path.join(PUBLIC_DIR, pathname);
                if (path.resolve(staticFilePath).startsWith(path.resolve(PUBLIC_DIR))) return serveStaticFile(res, staticFilePath);
                else return sendForbidden(res, "禁止存取此路徑的靜態資源。");
            }
            if (pathname.startsWith('/uploads/')) {
                if (!context.session) return sendUnauthorized(res, "您需要登入才能下載附件。");
                const requestedFileRelativePath = decodeURIComponent(pathname.substring('/uploads/'.length));
                const fullPath = path.join(UPLOADS_DIR, requestedFileRelativePath);
                if (!path.resolve(fullPath).startsWith(path.resolve(UPLOADS_DIR))) return sendForbidden(res, "禁止存取此檔案路徑！");
                const note = storage.getNotes().find(n => n.attachment && n.attachment.path === requestedFileRelativePath);
                if (context.session.role !== 'admin' && (!note || note.userId !== context.session.userId)) return sendForbidden(res, "您無權存取此附件。");
                if (!fs.existsSync(fullPath)) return sendNotFound(res, "請求的附件不存在。");
                return serveStaticFile(res, fullPath);
            }
        }

        // --- 公共路由 (無需登入) ---
        if (pathname === '/login' && method === 'GET') return userController.getLoginPage(context);
        if (pathname === '/login' && method === 'POST') return userController.loginUser(context);
        if (pathname === '/register' && method === 'GET') return userController.getRegisterPage(context); // 新增: 註冊頁面
        if (pathname === '/api/users/register' && method === 'POST') return userController.registerUser(context); // 新增: 處理註冊請求

        // --- 以下路由需要登入 ---
        if (pathname === '/logout' && method === 'POST') return userController.logoutUser(context); // 登出移到這裡，因为它需要会话

        if (!context.session) {
            if (pathname.startsWith('/api/')) return sendUnauthorized(res, "請先登入後再操作。");
            if (pathname !== '/login' && pathname !== '/register') return redirect(res, '/login'); // 避免对公共页面的重定向
            return; // 允许访问登录和注册页
        }

        // --- 受保護路由 ---
        if ((pathname === '/' || pathname === '/index.html') && method === 'GET') return noteController.getNotesPage(context);
        if (pathname === '/api/notes' && method === 'GET') return noteController.getAllNotes(context);
        if (pathname === '/api/notes' && method === 'POST') return noteController.createNote(context);
        if (pathname.startsWith('/api/notes/') && method === 'GET') return noteController.getNoteById(context);
        if (pathname.startsWith('/api/notes/') && method === 'PUT') return noteController.updateNote(context);
        if (pathname.startsWith('/api/notes/') && method === 'DELETE') return noteController.deleteNoteById(context);
        if (pathname === '/note/new' && method === 'GET') return noteController.getNoteFormPage(context, null);
        if (pathname === '/note/edit' && method === 'GET') {
            if (!query.id) return sendBadRequest(res, "缺少記事 ID 進行編輯。");
            return noteController.getNoteFormPage(context, query.id);
        }

        if (context.session.role === 'admin') {
            if (pathname === '/admin/users' && method === 'GET') return userController.getAdminUsersPage(context);
            if (pathname === '/api/admin/users' && method === 'GET') return userController.listAllUsers(context);
            if (pathname === '/api/admin/users' && method === 'POST') return userController.createUserByAdmin(context);
            if (pathname.startsWith('/api/admin/users/') && method === 'DELETE') return userController.deleteUserByAdmin(context);
        } else {
            if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
                return sendForbidden(res, "您沒有權限存取此管理員功能。");
            }
        }

        return sendNotFound(res, `請求的路徑 ${pathname} 未找到。`);
    }
};
