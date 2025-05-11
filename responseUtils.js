// responseUtils.js - HTTP回應輔助函數
const fs = require('fs');
const path = require('path');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain; charset=utf-8',
    // 按需添加更多 MIME 類型
};

function getContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return MIME_TYPES[ext] || 'application/octet-stream'; // 預設為二進制流
}

module.exports = {
    sendResponse: (res, content, contentType = 'text/plain; charset=utf-8', statusCode = 200) => {
        res.writeHead(statusCode, { 'Content-Type': contentType });
        res.end(content);
    },
    serveJson: (res, data, statusCode = 200) => {
        res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(data));
    },
    redirect: (res, url, statusCode = 302) => { // 302: Found (常用於暫時重定向)
        res.writeHead(statusCode, { 'Location': url });
        res.end();
    },
    sendNotFound: (res, message = '404 - 資源未找到') => {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(message);
    },
    sendError: (res, message = '500 - 伺服器內部錯誤', statusCode = 500) => {
        console.error(`伺服器錯誤: ${message} (狀態碼: ${statusCode})`);
        res.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(message);
    },
    sendBadRequest: (res, message = '400 - 錯誤的請求') => {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(message);
    },
    sendUnauthorized: (res, message = '401 - 未授權') => {
        // 通常與 WWW-Authenticate 標頭一起使用，但此處簡化
        res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(message);
    },
    sendForbidden: (res, message = '403 - 禁止存取') => {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(message);
    },
    serveStaticFile: (res, filePath) => {
        const fullPath = path.resolve(filePath); // 解析為絕對路徑以增加安全性
        // 基礎安全檢查：防止路徑遍歷 (更嚴格的檢查應在 router 中完成)
        if (!fullPath.startsWith(path.resolve(__dirname, 'public')) && !fullPath.startsWith(path.resolve(__dirname, 'uploads'))) {
             // 此處的檢查是第二道防線，主要檢查應在 router 中針對 uploads 目錄進行
            if (!fullPath.startsWith(path.resolve(require('./storage').UPLOADS_DIR))) { // 檢查是否在合法的 uploads 目錄
                 console.warn(`嘗試存取非法路徑 (static file): ${fullPath}`);
                 module.exports.sendForbidden(res, "禁止存取此檔案路徑。");
                 return;
            }
        }

        fs.readFile(fullPath, (err, content) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    console.warn(`靜態檔案未找到: ${fullPath}`);
                    module.exports.sendNotFound(res, `檔案 ${path.basename(fullPath)} 未找到`);
                } else {
                    console.error(`讀取靜態檔案 ${fullPath} 錯誤:`, err);
                    module.exports.sendError(res, `讀取檔案 ${path.basename(fullPath)} 時發生伺服器錯誤`);
                }
                return;
            }
            const contentType = getContentType(fullPath);
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        });
    },
    // 簡單的 HTML 模板渲染 (替換佔位符)
    serveHtmlWithPlaceholders: (res, htmlFilePath, placeholders = {}, statusCode = 200) => {
        fs.readFile(htmlFilePath, 'utf8', (err, html) => {
            if (err) {
                console.error(`讀取 HTML 檔案 ${htmlFilePath} 錯誤:`, err);
                module.exports.sendError(res, `載入頁面 ${path.basename(htmlFilePath)} 時發生錯誤`);
                return;
            }
            let renderedHtml = html;
            for (const key in placeholders) {
                // 使用正則表達式進行全域替換，並處理特殊字元
                const regex = new RegExp(`\\{\\{${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`, 'g');
                renderedHtml = renderedHtml.replace(regex, String(placeholders[key])); // 確保值為字串
            }
            // 移除任何未被替換的佔位符 (可選)
            // renderedHtml = renderedHtml.replace(/\{\{[^}]+\}\}/g, '');

            res.writeHead(statusCode, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(renderedHtml);
        });
    }
};
