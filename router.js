// router.js - 請求路由處理
const url = require('url');
const querystring = require('querystring');
const path = require('path');
const fs = require('fs'); // 需要 fs 來處理檔案上傳的儲存
const { authenticate } = require('./auth');
const userController = require('./userController');
const noteController = require('./noteController');
const { serveStaticFile, sendNotFound, redirect, sendForbidden, sendError, sendBadRequest } = require('./responseUtils');
const storage = require('./storage'); // 為了 UPLOADS_DIR

const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOADS_DIR = storage.UPLOADS_DIR; // 從 storage 模組獲取

// 非常基礎的 multipart/form-data 解析器
// 注意：這個解析器非常簡陋，可能無法處理所有邊界情況，且對大型檔案效率不高。
// 在實際應用中，強烈建議使用成熟的庫 (如 formidable, busboy, multiparty)。
function parseMultipartFormData(rawBuffer, contentTypeHeader) {
    const boundaryMatch = contentTypeHeader.match(/boundary=(.+)/);
    if (!boundaryMatch) {
        console.warn("解析 multipart/form-data 失敗：找不到 boundary。");
        return { fields: {}, files: {} };
    }
    const boundary = `--${boundaryMatch[1]}`; // 完整的 boundary 標記
    const result = { fields: {}, files: {} };

    // 使用 Buffer.indexOf 進行分割，效率可能優於字串轉換和分割
    let lastIndex = 0;
    let boundaryIndex = rawBuffer.indexOf(boundary, lastIndex);

    while (boundaryIndex !== -1) {
        // 找到下一個 boundary 或結尾 boundary (--boundary--)
        let nextBoundaryIndex = rawBuffer.indexOf(boundary, boundaryIndex + boundary.length);
        if (nextBoundaryIndex === -1) break; // 可能是結尾的 boundary，或者資料不完整

        // 提取一個 part 的資料 (從目前 boundary 之後到下一個 boundary 之前)
        // 需要跳過 boundary 本身以及它後面的 \r\n
        const partStart = boundaryIndex + boundary.length + 2; // +2 for \r\n
        const partEnd = nextBoundaryIndex -2; // -2 for \r\n before next boundary

        if (partStart >= partEnd) { // 空 part 或格式錯誤
            boundaryIndex = nextBoundaryIndex;
            continue;
        }

        const partBuffer = rawBuffer.subarray(partStart, partEnd);

        // 找到 part 的 header 和 body 分隔符 (\r\n\r\n)
        const separatorIndex = partBuffer.indexOf('\r\n\r\n');
        if (separatorIndex === -1) {
            boundaryIndex = nextBoundaryIndex;
            continue;
        }

        const headerBuffer = partBuffer.subarray(0, separatorIndex);
        const bodyBuffer = partBuffer.subarray(separatorIndex + 4); // +4 for \r\n\r\n
        const headerString = headerBuffer.toString('utf-8'); // 假設 header 是 utf-8

        const dispositionMatch = headerString.match(/Content-Disposition: form-data; name="([^"]+)"(?:; filename="([^"]+)")?/i);
        if (!dispositionMatch) {
            boundaryIndex = nextBoundaryIndex;
            continue;
        }

        const fieldName = dispositionMatch[1];
        const fileName = dispositionMatch[2]; // 如果是檔案，會有 filename

        if (fileName) { // 这是一个文件
            const contentTypeMatch = headerString.match(/Content-Type: (.+)/i);
            const contentType = contentTypeMatch ? contentTypeMatch[1].trim() : 'application/octet-stream';
            // 尝试解码文件名 (UTF-8 是常见的，但原始规范是 US-ASCII，现代浏览器会做编码)
            let decodedFileName;
            try {
                decodedFileName = decodeURIComponent(escape(Buffer.from(fileName, 'binary').toString('utf-8')));
            } catch (e) {
                try {
                    decodedFileName = Buffer.from(fileName, 'latin1').toString('utf-8'); // 尝试 latin1 作为备选
                } catch (e2) {
                    console.warn(`解码文件名 "${fileName}" 失败: `, e, e2);
                    decodedFileName = fileName; // 使用原始文件名
                }
            }

            result.files[fieldName] = {
                filename: decodedFileName,
                contentType: contentType,
                content: bodyBuffer // Buffer 对象
            };
        } else { // 这是一个普通字段
            result.fields[fieldName] = bodyBuffer.toString('utf-8'); // 假设字段值是 utf-8
        }
        boundaryIndex = nextBoundaryIndex;
    }
    return result;
}


module.exports = {
    handleRequest: async (req, res, rawBuffer) => { // 将函数标记为 async 以便内部使用 await
        const parsedUrl = url.parse(req.url, true); // true 表示解析 query string
        const pathname = parsedUrl.pathname;
        const method = req.method.toUpperCase();
        const query = parsedUrl.query;
        const headers = req.headers;

        let body = {}; // 用於儲存解析後的請求體 (application/x-www-form-urlencoded 或 application/json)
        let files = {}; // 用於儲存解析後的檔案 (multipart/form-data)

        // 解析請求體
        if ((method === 'POST' || method === 'PUT') && rawBuffer && rawBuffer.length > 0) {
            const contentType = headers['content-type'] || '';
            if (contentType.includes('application/x-www-form-urlencoded')) {
                try {
                    body = querystring.parse(rawBuffer.toString('utf8'));
                } catch (e) {
                    console.error("解析 x-www-form-urlencoded 請求體錯誤:", e);
                    return sendBadRequest(res, "請求體格式錯誤。");
                }
            } else if (contentType.includes('application/json')) {
                try {
                    body = JSON.parse(rawBuffer.toString('utf8'));
                } catch (e) {
                    console.error("解析 JSON 請求體錯誤:", e);
                    return sendBadRequest(res, "JSON 格式錯誤。");
                }
            } else if (contentType.includes('multipart/form-data')) {
                try {
                    const parsedMultipart = parseMultipartFormData(rawBuffer, contentType);
                    body = parsedMultipart.fields;
                    files = parsedMultipart.files;
                } catch (e) {
                    console.error("解析 multipart/form-data 請求體錯誤:", e);
                    return sendError(res, "處理上傳檔案時發生錯誤。");
                }
            }
        }

        const context = { req, res, pathname, method, query, headers, body, files, rawBuffer, session: null };
        context.session = authenticate(req); // 執行身份驗證

        // --- 靜態檔案服務 ---
        // 優先處理靜態檔案，避免後續路由的複雜判斷
        if (method === 'GET') {
            if (pathname.startsWith('/css/') || pathname.startsWith('/js/')) {
                const staticFilePath = path.join(PUBLIC_DIR, pathname);
                // 確保檔案在 public 目錄下，防止路徑遍歷
                if (path.resolve(staticFilePath).startsWith(path.resolve(PUBLIC_DIR))) {
                    return serveStaticFile(res, staticFilePath);
                } else {
                    return sendForbidden(res, "禁止存取此路徑的靜態資源。");
                }
            }
            // 附件下載路由 (非常重要：需要嚴格的權限控制)
            if (pathname.startsWith('/uploads/')) {
                if (!context.session) return sendUnauthorized(res, "您需要登入才能下載附件。");

                const requestedFileRelativePath = decodeURIComponent(pathname.substring('/uploads/'.length));
                const fullPath = path.join(UPLOADS_DIR, requestedFileRelativePath);

                // 安全性：再次確認路徑是否在 UPLOADS_DIR 內
                if (!path.resolve(fullPath).startsWith(path.resolve(UPLOADS_DIR))) {
                    console.warn(`嘗試存取 uploads 目錄外的檔案: ${fullPath}`);
                    return sendForbidden(res, "禁止存取此檔案路徑！");
                }

                // 權限檢查：使用者只能下載自己的附件，或管理員可以下載任何附件
                // 假設附件路徑格式為: userId/filename.ext
                const pathParts = requestedFileRelativePath.split(path.sep); // 使用 path.sep 以支援跨平台
                const ownerId = pathParts[0];

                if (context.session.role !== 'admin' && context.session.userId !== ownerId) {
                    // 檢查該記事是否屬於目前使用者 (如果附件與記事關聯)
                    // 這裡簡化為直接比較 userId in path
                    const note = storage.getNotes().find(n => n.attachment && n.attachment.path === requestedFileRelativePath);
                    if (!note || note.userId !== context.session.userId) {
                         console.warn(`使用者 ${context.session.username} 嘗試存取不屬於自己的附件: ${requestedFileRelativePath}`);
                         return sendForbidden(res, "您無權存取此附件。");
                    }
                }
                // 檢查檔案是否存在
                if (!fs.existsSync(fullPath)) {
                    return sendNotFound(res, "請求的附件不存在。");
                }
                return serveStaticFile(res, fullPath);
            }
        }

        // --- API 和頁面路由 ---
        // 登入頁面和操作
        if (pathname === '/login' && method === 'GET') return userController.getLoginPage(context);
        if (pathname === '/login' && method === 'POST') return userController.loginUser(context);
        if (pathname === '/logout' && method === 'POST') return userController.logoutUser(context); // 通常登出用 POST 避免 CSRF

        // --- 以下路由需要登入 ---
        if (!context.session) {
            // 對於 API 請求，如果未登入，返回 401
            if (pathname.startsWith('/api/')) {
                return sendUnauthorized(res, "請先登入後再操作。");
            }
            // 對於頁面請求，重定向到登入頁
            if (pathname !== '/login') { // 避免無限重定向
                 return redirect(res, '/login');
            }
            return; // 如果是 /login 且未認證，則由上面的路由處理
        }

        // 主頁 (記事列表)
        if ((pathname === '/' || pathname === '/index.html') && method === 'GET') return noteController.getNotesPage(context);

        // 記事相關 API
        if (pathname === '/api/notes' && method === 'GET') return noteController.getAllNotes(context);
        if (pathname === '/api/notes' && method === 'POST') return noteController.createNote(context); // 建立記事 (可能包含檔案上傳)
        if (pathname.startsWith('/api/notes/') && method === 'GET') return noteController.getNoteById(context);
        if (pathname.startsWith('/api/notes/') && method === 'PUT') return noteController.updateNote(context); // 更新記事 (可能包含檔案上傳)
        if (pathname.startsWith('/api/notes/') && method === 'DELETE') return noteController.deleteNoteById(context);

        // 記事表單頁面 (新增/編輯)
        if (pathname === '/note/new' && method === 'GET') return noteController.getNoteFormPage(context, null);
        if (pathname === '/note/edit' && method === 'GET') {
            if (!query.id) return sendBadRequest(res, "缺少記事 ID 進行編輯。");
            return noteController.getNoteFormPage(context, query.id);
        }


        // --- 管理員專用路由 ---
        if (context.session.role !== 'admin') {
            // 如果普通使用者嘗試存取管理員路徑
            if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
                return sendForbidden(res, "您沒有權限存取此管理員功能。");
            }
        } else {
            // 管理員使用者管理頁面
            if (pathname === '/admin/users' && method === 'GET') return userController.getAdminUsersPage(context);
            // 管理員使用者管理 API
            if (pathname === '/api/admin/users' && method === 'GET') return userController.listAllUsers(context);
            if (pathname === '/api/admin/users' && method === 'POST') return userController.createUserByAdmin(context);
            if (pathname.startsWith('/api/admin/users/') && method === 'DELETE') return userController.deleteUserByAdmin(context);
            // (可選) 管理員更新使用者資訊 API (例如重設密碼，此處未完全實現)
            // if (pathname.startsWith('/api/admin/users/') && method === 'PUT') return userController.updateUserByAdmin(context);
        }

        // 如果沒有匹配到任何路由
        return sendNotFound(res, `請求的路徑 ${pathname} 未找到。`);
    }
};
