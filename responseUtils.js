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
            console.log(`\n[DEBUG serveHtml] ======================================================`);
            console.log(`[DEBUG serveHtml] 开始处理模板: ${htmlFilePath}`);
            console.log(`[DEBUG serveHtml] 传入的 placeholders:`, JSON.stringify(placeholders, null, 2));
            console.log(`[DEBUG serveHtml] 初始 HTML (片段): \n${renderedHtml.substring(0, 800)}\n...`);

            // 1. 迭代处理 {{#if conditionKey}} content {{/if}} 块
            const conditionalRegex = /\{\{#if\s*([a-zA-Z0-9_]+)\s*\}\}([\s\S]*?)\{\{\/if\s*\}\}/g;
            let iterations = 0;
            const MAX_ITERATIONS = 10; 
            let previousHtmlIteration;
            let changedInIteration;

            do {
                previousHtmlIteration = renderedHtml;
                changedInIteration = false;
                iterations++;
                console.log(`\n[DEBUG serveHtml] --- 条件处理迭代 #${iterations} ---`);
                
                // 每次迭代都应该在当前的 renderedHtml 上操作
                // String.prototype.replace with a global regex and a function will process all non-overlapping matches in one go.
                // The loop is to handle nested structures, where one replacement might reveal another conditional block.
                
                // 重置正则表达式的 lastIndex 不是必需的，因为我们每次都对新的 renderedHtml 字符串调用 replace
                // conditionalRegex.lastIndex = 0; 

                renderedHtml = renderedHtml.replace(conditionalRegex, (match, conditionKey, content) => {
                    const conditionValue = placeholders[conditionKey];
                    // 检查 conditionValue 是否为 undefined 也很重要，因为 !!undefined 是 false
                    const isTruthy = conditionValue !== undefined && !!conditionValue; 
                    
                    console.log(`[DEBUG serveHtml Iteration ${iterations}] -- 匹配到条件块 --`);
                    console.log(`[DEBUG serveHtml Iteration ${iterations}]   完整匹配: '${match.substring(0,120).replace(/\n/g, "\\n")}...'`);
                    console.log(`[DEBUG serveHtml Iteration ${iterations}]   条件键 (conditionKey): '${conditionKey}'`);
                    console.log(`[DEBUG serveHtml Iteration ${iterations}]   placeholders['${conditionKey}']:`, conditionValue, `(类型: ${typeof conditionValue})`);
                    console.log(`[DEBUG serveHtml Iteration ${iterations}]   条件判断 (isTruthy): ${isTruthy}`);
                    
                    if (isTruthy) {
                        console.log(`[DEBUG serveHtml Iteration ${iterations}]   结果: 保留内容`);
                        return content;
                    } else {
                        console.log(`[DEBUG serveHtml Iteration ${iterations}]   结果: 移除块`);
                        return '';
                    }
                });

                if (renderedHtml !== previousHtmlIteration) {
                    changedInIteration = true;
                    console.log(`[DEBUG serveHtml Iteration ${iterations}] HTML 在此迭代中已更改。`);
                    // console.log(`[DEBUG serveHtml Iteration ${iterations}] 当前 HTML (片段): \n${renderedHtml.substring(0, 800)}\n...`);
                } else {
                    console.log(`[DEBUG serveHtml Iteration ${iterations}] HTML 在此迭代中未更改，条件处理可能完成。`);
                }

            } while (changedInIteration && iterations < MAX_ITERATIONS);
            
            if (iterations >= MAX_ITERATIONS && changedInIteration) {
                console.warn(`[DEBUG serveHtml] 条件处理达到最大迭代次数 (${MAX_ITERATIONS}) 且HTML仍在变化，可能存在未解析的嵌套或复杂条件。 文件: ${htmlFilePath}`);
            }
            console.log(`\n[DEBUG serveHtml] --- 条件块处理完成 (共 ${iterations} 次迭代) ---`);
            console.log(`[DEBUG serveHtml] 条件处理后的 HTML (片段): \n${renderedHtml.substring(0, 800)}\n...`);


            // 2. 处理 {{variable}} 替换
            console.log(`\n[DEBUG serveHtml] --- 开始变量替换 ---`);
            for (const key in placeholders) {
                if (placeholders.hasOwnProperty(key)) { 
                    const valueToReplace = (placeholders[key] === null || placeholders[key] === undefined) ? '' : String(placeholders[key]);
                    const variableRegex = new RegExp(`\\{\\{${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`, 'g');
                    
                    if (renderedHtml.match(variableRegex)) {
                        // console.log(`[DEBUG serveHtml] 准备替换变量 '{{${key}}}' 为 '${valueToReplace}'`);
                        renderedHtml = renderedHtml.replace(variableRegex, valueToReplace);
                    }
                }
            }
            console.log(`[DEBUG serveHtml] 变量替换后的 HTML (片段): \n${renderedHtml.substring(0, 800)}\n...`);
            console.log(`[DEBUG serveHtml] ======================================================\n`);

            res.writeHead(statusCode, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(renderedHtml);
        });
    }
};
