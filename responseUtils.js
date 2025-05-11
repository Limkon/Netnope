// responseUtils.js - HTTP回應輔助函數
const fs =require('fs');
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
        res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(message);
    },
    sendForbidden: (res, message = '403 - 禁止存取') => {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(message);
    },
    serveStaticFile: (res, filePath) => {
        const fullPath = path.resolve(filePath);
        // This check is a secondary defense; primary checks for uploads should be in the router.
        const uploadsDir = require('./storage').UPLOADS_DIR; // Get UPLOADS_DIR dynamically
        if (!fullPath.startsWith(path.resolve(__dirname, 'public')) && !fullPath.startsWith(path.resolve(uploadsDir))) {
            console.warn(`Attempt to access illegal path (static file): ${fullPath}`);
            module.exports.sendForbidden(res, "禁止存取此檔案路徑。");
            return;
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
    serveHtmlWithPlaceholders: (res, htmlFilePath, placeholders = {}, statusCode = 200) => {
        fs.readFile(htmlFilePath, 'utf8', (err, html) => {
            if (err) {
                console.error(`讀取 HTML 檔案 ${htmlFilePath} 錯誤:`, err);
                module.exports.sendError(res, `載入頁面 ${path.basename(htmlFilePath)} 時發生錯誤`);
                return;
            }
            let renderedHtml = html;

            // 1. Handle simple {{#if conditionKey}} content {{/if}} blocks
            // This regex handles a single level of if block. It doesn't support nested ifs or else clauses.
            renderedHtml = renderedHtml.replace(/\{\{#if\s+([a-zA-Z0-9_]+)\s*\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, conditionKey, content) => {
                // If the key exists and is truthy in placeholders, keep the content, otherwise remove the whole block.
                return placeholders[conditionKey] ? content : '';
            });

            // 2. Handle {{variable}} replacements
            for (const key in placeholders) {
                // Ensure we don't try to replace the 'if' condition key itself if it wasn't meant to be a standalone variable.
                // This regex replaces {{key}} with the value from placeholders.
                const regex = new RegExp(`\\{\\{${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`, 'g');
                renderedHtml = renderedHtml.replace(regex, String(placeholders[key] == null ? '' : placeholders[key])); // Replace null/undefined with empty string
            }

            // Optional: Remove any remaining {{variable}} placeholders that were not in the data
            // renderedHtml = renderedHtml.replace(/\{\{[^}]+\}\}/g, '');

            res.writeHead(statusCode, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(renderedHtml);
        });
    }
};
