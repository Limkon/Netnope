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
                console.error(`[DEBUG serveHtml] 读取 HTML 文件 ${htmlFilePath} 错误:`, err);
                return module.exports.sendError(res, `加载页面 ${path.basename(htmlFilePath)} 时发生错误`);
            }
            let renderedHtml = html;
            console.log(`[DEBUG serveHtml] 开始处理模板: ${htmlFilePath}`);
            console.log(`[DEBUG serveHtml] 传入的 placeholders:`, JSON.stringify(placeholders));

            // 1. Handle simple {{#if conditionKey}} content {{/if}} blocks
            // Regex to be a bit more tolerant with spaces:
            //   \{\{#if\s*([a-zA-Z0-9_]+)\s*\}\}  <-- allows zero or more spaces around key and after if
            //   ([\s\S]*?)                       <-- non-greedy match for content
            //   \{\{\/if\s*\}\}                    <-- allows zero or more spaces before closing /if
            const conditionalRegex = /\{\{#if\s*([a-zA-Z0-9_]+)\s*\}\}([\s\S]*?)\{\{\/if\s*\}\}/g;
            let match;
            let lastIndex = 0;
            let processedHtml = "";

            // Manual iteration to log each potential match
            const tempRenderedHtml = renderedHtml; // Work on a copy for logging this step
            console.log(`[DEBUG serveHtml] 查找条件块前的 HTML (前500字符): ${tempRenderedHtml.substring(0, 500)}`);

            while ((match = conditionalRegex.exec(tempRenderedHtml)) !== null) {
                const conditionKey = match[1];
                const content = match[2];
                const fullMatch = match[0];
                const conditionValue = placeholders[conditionKey];
                const isTruthy = !!conditionValue; 

                console.log(`[DEBUG serveHtml] -- 条件块处理 --`);
                console.log(`[DEBUG serveHtml] 匹配到的完整条件块: '${fullMatch.substring(0,100)}...'`);
                console.log(`[DEBUG serveHtml] 提取到的条件键 (conditionKey): '${conditionKey}'`);
                console.log(`[DEBUG serveHtml] placeholders 中的值 (placeholders['${conditionKey}']):`, conditionValue);
                console.log(`[DEBUG serveHtml] 条件是否为真 (isTruthy): ${isTruthy}`);
                console.log(`[DEBUG serveHtml] 条件块内容 (content): '${content.substring(0,100)}...'`);
                
                processedHtml += tempRenderedHtml.substring(lastIndex, match.index);
                if (isTruthy) {
                    processedHtml += content;
                    console.log(`[DEBUG serveHtml] 条件为真，保留内容。`);
                } else {
                    console.log(`[DEBUG serveHtml] 条件为假，移除块。`);
                }
                lastIndex = conditionalRegex.lastIndex;
            }
            processedHtml += tempRenderedHtml.substring(lastIndex);
            renderedHtml = processedHtml;
            console.log(`[DEBUG serveHtml] 条件块处理后的 HTML (前500字符): ${renderedHtml.substring(0, 500)}`);


            // 2. Handle {{variable}} replacements
            for (const key in placeholders) {
                if (placeholders.hasOwnProperty(key)) { 
                    const valueToReplace = (placeholders[key] === null || placeholders[key] === undefined) ? '' : String(placeholders[key]);
                    // More robust regex for variable replacement, ensuring a word boundary or non-alphanumeric before/after if needed,
                    // but for simple {{key}}, this is fine.
                    const variableRegex = new RegExp(`\\{\\{${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`, 'g');
                    
                    // Log if we are about to replace something
                    if (renderedHtml.match(variableRegex)) {
                        // console.log(`[DEBUG serveHtml] 准备替换变量 '{{${key}}}' 为 '${valueToReplace}'`);
                    }
                    renderedHtml = renderedHtml.replace(variableRegex, valueToReplace);
                }
            }
            // console.log(`[DEBUG serveHtml] 变量替换后的 HTML (前500字符): ${renderedHtml.substring(0, 500)}`);

            res.writeHead(statusCode, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(renderedHtml);
        });
    }
};
