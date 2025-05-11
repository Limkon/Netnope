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
            console.error("[RESPONSE UTILS] sendNotFound: Headers already sent or stream not writable.");
        }
    },
    sendError: (res, message = '500 - 服务器内部错误', statusCode = 500) => {
        console.error(`[RESPONSE UTILS] 服务器错误: ${message} (状态码: ${statusCode})`);
        if (res.writable && !res.headersSent) {
            res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ message: message }));
        } else {
            console.error("[RESPONSE UTILS] sendError: Headers already sent or stream not writable.");
        }
    },
    sendBadRequest: (res, message = '400 - 错误的请求') => {
        if (res.writable && !res.headersSent) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ message: message }));
        } else {
             console.error("[RESPONSE UTILS] sendBadRequest: Headers already sent or stream not writable.");
        }
    },
    sendUnauthorized: (res, message = '401 - 未授权') => {
        if (res.writable && !res.headersSent) {
            res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ message: message }));
        } else {
            console.error("[RESPONSE UTILS] sendUnauthorized: Headers already sent or stream not writable.");
        }
    },
    sendForbidden: (res, message = '403 - 禁止访问') => {
        if (res.writable && !res.headersSent) {
            res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ message: message }));
        } else {
            console.error("[RESPONSE UTILS] sendForbidden: Headers already sent or stream not writable.");
        }
    },
    serveStaticFile: (res, filePath) => {
        const fullPath = path.resolve(filePath);
        const uploadsDir = require('./storage').UPLOADS_DIR; 
        if (!fullPath.startsWith(path.resolve(__dirname, 'public')) && !fullPath.startsWith(path.resolve(uploadsDir))) {
            // console.warn(`[RESPONSE UTILS] Attempt to access illegal path (static file): ${fullPath}`);
            return module.exports.sendForbidden(res, "禁止访问此文件路径。");
        }

        fs.readFile(fullPath, (err, content) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    // console.warn(`[RESPONSE UTILS] 静态文件未找到: ${fullPath}`);
                    return module.exports.sendNotFound(res, `文件 ${path.basename(fullPath)} 未找到`);
                } else {
                    // console.error(`[RESPONSE UTILS] 读取静态文件 ${fullPath} 错误:`, err);
                    return module.exports.sendError(res, `读取文件 ${path.basename(fullPath)} 时发生服务器错误`);
                }
            }
            const contentType = getContentType(fullPath);
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        });
    },
    serveHtmlWithPlaceholders: (res, htmlFilePath, placeholders = {}, statusCode = 200) => {
        console.log(`\n[DEBUG serveHtml START] ======================================================`);
        console.log(`[DEBUG serveHtml] 调用 serveHtmlWithPlaceholders 渲染: ${htmlFilePath}`);
        console.log(`[DEBUG serveHtml] 传入的 placeholders 对象:`, JSON.stringify(placeholders, null, 2));

        fs.readFile(htmlFilePath, 'utf8', (err, html) => {
            if (err) {
                console.error(`[DEBUG serveHtml] CRITICAL: 读取 HTML 文件 ${htmlFilePath} 失败:`, err);
                return module.exports.sendError(res, `加载页面 ${path.basename(htmlFilePath)} 时发生错误`);
            }
            let renderedHtml = html;
            console.log(`[DEBUG serveHtml] 初始 HTML 内容 (前 1000 字符): \n'''\n${renderedHtml.substring(0, 1000)}\n'''`);

            // 1. 迭代处理 {{#if conditionKey}} content {{/if}} 块
            let iterations = 0;
            const MAX_ITERATIONS = 10; 
            let changedInThisPass;

            console.log(`\n[DEBUG serveHtml] --- 开始条件渲染循环 ---`);
            do {
                let htmlBeforeThisPass = renderedHtml;
                changedInThisPass = false;
                iterations++;
                console.log(`[DEBUG serveHtml]   迭代 #${iterations}`);
                
                const conditionalRegex = new RegExp(
                    '\\{\\{#if\\s*([a-zA-Z0-9_]+)\\s*\\}\\}((?:\r\n|[\r\n]|.)*?)\\{\\{\\/if\\s*\\}\\}', 
                    'g'
                );
                
                let matchFoundInPass = false;
                renderedHtml = renderedHtml.replace(conditionalRegex, (match, conditionKey, content) => {
                    matchFoundInPass = true;
                    const conditionValue = placeholders[conditionKey];
                    const isTruthy = conditionValue !== undefined && !!conditionValue; 
                    
                    console.log(`[DEBUG serveHtml Iteration ${iterations}] ---- 匹配到条件块 ----`);
                    console.log(`[DEBUG serveHtml Iteration ${iterations}]     完整匹配 (前120字符): '${match.substring(0,120).replace(/\n/g, "\\n")}...'`);
                    console.log(`[DEBUG serveHtml Iteration ${iterations}]     条件键 (conditionKey): '${conditionKey}'`);
                    console.log(`[DEBUG serveHtml Iteration ${iterations}]     placeholders['${conditionKey}']:`, conditionValue, `(类型: ${typeof conditionValue})`);
                    console.log(`[DEBUG serveHtml Iteration ${iterations}]     条件判断 (isTruthy): ${isTruthy}`);
                    
                    if (isTruthy) {
                        console.log(`[DEBUG serveHtml Iteration ${iterations}]     结果: 保留内容 (长度: ${content.length})`);
                        return content;
                    } else {
                        console.log(`[DEBUG serveHtml Iteration ${iterations}]     结果: 移除块 (原匹配长度: ${match.length})`);
                        return '';
                    }
                });

                if (!matchFoundInPass && iterations > 1) { // 如果不是第一次迭代且没有找到匹配，说明之前的替换已处理完
                     // console.log(`[DEBUG serveHtml Iteration ${iterations}] 在此迭代中未找到新的 {{#if}} 块。`);
                }


                if (renderedHtml !== htmlBeforeThisPass) {
                    changedInThisPass = true;
                    // console.log(`[DEBUG serveHtml Iteration ${iterations}] HTML 在此迭代中已更改。新HTML (片段): \n'''\n${renderedHtml.substring(0, 800)}\n'''`);
                } else {
                    // console.log(`[DEBUG serveHtml Iteration ${iterations}] HTML 在此迭代中未更改。`);
                }

            } while (changedInThisPass && iterations < MAX_ITERATIONS);
            
            if (iterations >= MAX_ITERATIONS && changedInThisPass) {
                console.warn(`[DEBUG serveHtml] 条件处理达到最大迭代次数 (${MAX_ITERATIONS}) 且HTML仍在变化。 文件: ${htmlFilePath}`);
            }
            console.log(`[DEBUG serveHtml] --- 条件块处理完成 (共 ${iterations} 次迭代) ---`);
            // console.log(`[DEBUG serveHtml] 条件处理后的 HTML (片段): \n'''\n${renderedHtml.substring(0, 1000)}\n'''`);

            // 2. 处理 {{variable}} 替换
            // console.log(`\n[DEBUG serveHtml] --- 开始变量替换 ---`);
            for (const key in placeholders) {
                if (placeholders.hasOwnProperty(key)) { 
                    const valueToReplace = (placeholders[key] === null || placeholders[key] === undefined) ? '' : String(placeholders[key]);
                    const variableRegex = new RegExp(`\\{\\{${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`, 'g');
                    renderedHtml = renderedHtml.replace(variableRegex, valueToReplace);
                }
            }
            // console.log(`[DEBUG serveHtml] 变量替换后的 HTML (片段): \n'''\n${renderedHtml.substring(0, 1000)}\n'''`);
            console.log(`[DEBUG serveHtml] 最终发送的 HTML (片段): \n'''\n${renderedHtml.substring(0, 1000)}\n'''`);
            console.log(`[DEBUG serveHtml END] ======================================================\n`);

            res.writeHead(statusCode, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(renderedHtml);
        });
    }
};
