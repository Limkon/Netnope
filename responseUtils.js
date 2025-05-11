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
                console.error(`[serveHtml] 读取 HTML 文件 ${htmlFilePath} 错误:`, err);
                return module.exports.sendError(res, `加载页面 ${path.basename(htmlFilePath)} 时发生错误`);
            }
            let renderedHtml = html;
            // console.log(`[serveHtml] 开始处理模板: ${htmlFilePath}`);
            // console.log(`[serveHtml] 传入的 placeholders:`, JSON.stringify(placeholders));

            // 1. 迭代处理 {{#if conditionKey}} content {{/if}} 块
            const conditionalRegex = /\{\{#if\s*([a-zA-Z0-9_]+)\s*\}\}([\s\S]*?)\{\{\/if\s*\}\}/g;
            let iterations = 0;
            const MAX_ITERATIONS = 10; // 防止无限循环
            let previousHtmlIteration;

            do {
                previousHtmlIteration = renderedHtml;
                // 每次 replace 都需要一个新的 regex 实例，或者重置 lastIndex
                // 对于 String.prototype.replace(RegExp, function) 这种用法，
                // 如果 RegExp 是全局的，它会查找所有匹配项。
                // 关键是循环的条件，确保当没有更多替换发生时循环停止。
                
                // 重置正则表达式的 lastIndex，确保 replace 从头开始搜索
                conditionalRegex.lastIndex = 0; 

                renderedHtml = renderedHtml.replace(conditionalRegex, (match, conditionKey, content) => {
                    const conditionValue = placeholders[conditionKey];
                    const isTruthy = !!conditionValue; 
                    // console.log(`[serveHtml Iteration ${iterations+1}] -- 条件块: key='${conditionKey}', value='${conditionValue}', isTruthy=${isTruthy}`);
                    return isTruthy ? content : '';
                });
                iterations++;
            } while (renderedHtml !== previousHtmlIteration && iterations < MAX_ITERATIONS);
            
            if (iterations >= MAX_ITERATIONS && renderedHtml !== previousHtmlIteration) {
                console.warn(`[serveHtml] 条件处理可能达到最大迭代次数 (${MAX_ITERATIONS}) 且HTML仍在变化，可能存在未解析的嵌套或复杂条件。 文件: ${htmlFilePath}`);
            }
            // console.log(`[serveHtml] 条件块处理后的 HTML (前500字符): ${renderedHtml.substring(0, 500)}`);

            // 2. 处理 {{variable}} 替换
            for (const key in placeholders) {
                if (placeholders.hasOwnProperty(key)) { 
                    const valueToReplace = (placeholders[key] === null || placeholders[key] === undefined) ? '' : String(placeholders[key]);
                    const variableRegex = new RegExp(`\\{\\{${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`, 'g');
                    renderedHtml = renderedHtml.replace(variableRegex, valueToReplace);
                }
            }
            // console.log(`[serveHtml] 变量替换后的 HTML (前500字符): ${renderedHtml.substring(0, 500)}`);

            res.writeHead(statusCode, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(renderedHtml);
        });
    }
};
