// responseUtils.js - HTTP响应辅助函数
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
};

function getContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return MIME_TYPES[ext] || 'application/octet-stream';
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
    redirect: (res, url, statusCode = 302) => { 
        res.writeHead(statusCode, { 'Location': url });
        res.end();
    },
    sendNotFound: (res, message = '404 - 资源未找到') => {
        // 为了与前端 fetchData 的错误处理一致，尝试发送 JSON
        if (res.writable && !res.headersSent) {
            res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ message: message }));
        } else {
            console.error("sendNotFound: Headers already sent or stream not writable.");
        }
    },
    sendError: (res, message = '500 - 服务器内部错误', statusCode = 500) => {
        console.error(`服务器错误: ${message} (状态码: ${statusCode})`);
        if (res.writable && !res.headersSent) {
            res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ message: message }));
        } else {
            console.error("sendError: Headers already sent or stream not writable.");
        }
    },
    sendBadRequest: (res, message = '400 - 错误的请求') => {
        if (res.writable && !res.headersSent) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ message: message }));
        } else {
             console.error("sendBadRequest: Headers already sent or stream not writable.");
        }
    },
    sendUnauthorized: (res, message = '401 - 未授权') => {
        if (res.writable && !res.headersSent) {
            res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ message: message }));
        } else {
            console.error("sendUnauthorized: Headers already sent or stream not writable.");
        }
    },
    sendForbidden: (res, message = '403 - 禁止访问') => {
        if (res.writable && !res.headersSent) {
            res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ message: message }));
        } else {
            console.error("sendForbidden: Headers already sent or stream not writable.");
        }
    },
    serveStaticFile: (res, filePath) => {
        const fullPath = path.resolve(filePath);
        const uploadsDir = require('./storage').UPLOADS_DIR; 
        if (!fullPath.startsWith(path.resolve(__dirname, 'public')) && !fullPath.startsWith(path.resolve(uploadsDir))) {
            console.warn(`Attempt to access illegal path (static file): ${fullPath}`);
            module.exports.sendForbidden(res, "禁止访问此文件路径。");
            return;
        }

        fs.readFile(fullPath, (err, content) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    console.warn(`静态文件未找到: ${fullPath}`);
                    module.exports.sendNotFound(res, `文件 ${path.basename(fullPath)} 未找到`);
                } else {
                    console.error(`读取静态文件 ${fullPath} 错误:`, err);
                    module.exports.sendError(res, `读取文件 ${path.basename(fullPath)} 时发生服务器错误`);
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
                console.error(`[DEBUG] 读取 HTML 文件 ${htmlFilePath} 错误:`, err);
                // 使用 sendError 发送 JSON 错误
                return module.exports.sendError(res, `加载页面 ${path.basename(htmlFilePath)} 时发生错误`);
            }
            let renderedHtml = html;
            // console.log(`[DEBUG] Initial HTML for ${htmlFilePath}:`, renderedHtml.substring(0, 600)); 
            // console.log(`[DEBUG] Placeholders for ${htmlFilePath}:`, placeholders);

            // 1. Handle simple {{#if conditionKey}} content {{/if}} blocks
            const conditionalRegex = /\{\{#if\s+([a-zA-Z0-9_]+)\s*\}\}([\s\S]*?)\{\{\/if\}\}/g;
            renderedHtml = renderedHtml.replace(conditionalRegex, (match, conditionKey, content) => {
                const conditionValue = placeholders[conditionKey];
                const isTruthy = !!conditionValue; // Handles null, undefined, false, 0, "", NaN as falsy
                // console.log(`[DEBUG] Conditional: key='${conditionKey}', value='${conditionValue}', isTruthy=${isTruthy}, match='${match.substring(0,70)}...'`);
                if (isTruthy) {
                    return content;
                } else {
                    return '';
                }
            });
            // console.log(`[DEBUG] HTML after conditional processing for ${htmlFilePath}:`, renderedHtml.substring(0, 600));


            // 2. Handle {{variable}} replacements
            for (const key in placeholders) {
                if (placeholders.hasOwnProperty(key)) { 
                    const valueToReplace = (placeholders[key] === null || placeholders[key] === undefined) ? '' : String(placeholders[key]);
                    const regex = new RegExp(`\\{\\{${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`, 'g');
                    // if (renderedHtml.match(regex)) {
                    //      console.log(`[DEBUG] Replacing variable '{{${key}}}' with '${valueToReplace}'`);
                    // }
                    renderedHtml = renderedHtml.replace(regex, valueToReplace);
                }
            }
            // console.log(`[DEBUG] HTML after variable processing for ${htmlFilePath}:`, renderedHtml.substring(0, 600));

            res.writeHead(statusCode, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(renderedHtml);
        });
    }
};
