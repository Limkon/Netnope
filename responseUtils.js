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
            console.log(`[RESPONSE_UTILS] Sending 404: ${message}`);
            res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ message: message }));
        } else {
            console.error("[RESPONSE_UTILS] sendNotFound: Headers already sent or stream not writable.");
        }
    },
    sendError: (res, message = '500 - 服务器内部错误', statusCode = 500) => {
        console.error(`[RESPONSE_UTILS] Sending Error ${statusCode}: ${message}`);
        if (res.writable && !res.headersSent) {
            res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ message: message }));
        } else {
            console.error("[RESPONSE_UTILS] sendError: Headers already sent or stream not writable.");
        }
    },
    sendBadRequest: (res, message = '400 - 错误的请求') => {
        if (res.writable && !res.headersSent) {
            console.log(`[RESPONSE_UTILS] Sending 400: ${message}`);
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ message: message }));
        } else {
             console.error("[RESPONSE_UTILS] sendBadRequest: Headers already sent or stream not writable.");
        }
    },
    sendUnauthorized: (res, message = '401 - 未授权') => {
        if (res.writable && !res.headersSent) {
            console.log(`[RESPONSE_UTILS] Sending 401: ${message}`);
            res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ message: message }));
        } else {
            console.error("[RESPONSE_UTILS] sendUnauthorized: Headers already sent or stream not writable.");
        }
    },
    sendForbidden: (res, message = '403 - 禁止访问') => {
        if (res.writable && !res.headersSent) {
            console.log(`[RESPONSE_UTILS] Sending 403: ${message}`);
            res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ message: message }));
        } else {
            console.error("[RESPONSE_UTILS] sendForbidden: Headers already sent or stream not writable.");
        }
    },
    serveStaticFile: (res, filePath) => {
        const fullPath = path.resolve(filePath);
        const uploadsDir = require('./storage').UPLOADS_DIR; 
        if (!fullPath.startsWith(path.resolve(__dirname, 'public')) && !fullPath.startsWith(path.resolve(uploadsDir))) {
            // console.warn(`[RESPONSE_UTILS] Attempt to access illegal path (static file): ${fullPath}`);
            return module.exports.sendForbidden(res, "禁止访问此文件路径。");
        }

        fs.readFile(fullPath, (err, content) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    // console.warn(`[RESPONSE_UTILS] 静态文件未找到: ${fullPath}`);
                    return module.exports.sendNotFound(res, `文件 ${path.basename(fullPath)} 未找到`);
                } else {
                    // console.error(`[RESPONSE_UTILS] 读取静态文件 ${fullPath} 错误:`, err);
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
            console.log(`[DEBUG serveHtml] 初始 HTML 内容 (完整): \n'''\n${renderedHtml}\n'''`);

            let iterations = 0;
            const MAX_ITERATIONS = 10; 
            let changedInThisPass;

            console.log(`\n[DEBUG serveHtml] --- 开始条件渲染循环 ---`);
            do {
                let htmlBeforeThisPass = renderedHtml;
                changedInThisPass = false;
                iterations++;
                console.log(`\n[DEBUG serveHtml]   迭代 #${iterations}`);
                
                const conditionalRegex = new RegExp(
                    '\\{\\{#if\\s*([a-zA-Z0-9_]+)\\s*\\}\\}((?:\r\n|[\r\n]|.)*?)\\{\\{\\/if\\s*\\}\\}', 
                    'g'
                );
                
                let matchFoundInPass = false;
                renderedHtml = renderedHtml.replace(conditionalRegex, (match, conditionKey, content) => {
                    matchFoundInPass = true;
                    changedInThisPass = true; // 只要有替换发生，就标记为更改
                    const conditionValue = placeholders[conditionKey];
                    const isTruthy = conditionValue !== undefined && !!conditionValue; 
                    
                    console.log(`[DEBUG serveHtml Iteration ${iterations}] ---- 匹配到条件块 ----`);
                    console.log(`[DEBUG serveHtml Iteration ${iterations}]     完整匹配: '${match.replace(/\n/g, "\\n")}'`);
                    console.log(`[DEBUG serveHtml Iteration ${iterations}]     条件键 (conditionKey): '${conditionKey}'`);
                    console.log(`[DEBUG serveHtml Iteration ${iterations}]     placeholders['${conditionKey}']:`, conditionValue, `(类型: ${typeof conditionValue})`);
                    console.log(`[DEBUG serveHtml Iteration ${iterations}]     条件判断 (isTruthy): ${isTruthy}`);
                    
                    if (isTruthy) {
                        console.log(`[DEBUG serveHtml Iteration ${iterations}]     结果: 保留内容 (内容片段: '${content.substring(0,50).replace(/\n/g, "\\n")}...')`);
                        return content;
                    } else {
                        console.log(`[DEBUG serveHtml Iteration ${iterations}]     结果: 移除块 (原匹配长度: ${match.length})`);
                        return '';
                    }
                });

                if (!matchFoundInPass && iterations > 0) { 
                     // 如果一次完整的 replace 调用后没有找到任何匹配项，说明所有顶层 if 都处理完了
                     // changedInThisPass 此时应该为 false，循环会自然结束
                     console.log(`[DEBUG serveHtml Iteration ${iterations}] 在此轮 replace 中未找到新的 {{#if}} 块。`);
                }

                if (renderedHtml !== htmlBeforeThisPass) {
                    console.log(`[DEBUG serveHtml Iteration ${iterations}] HTML 在此迭代中已更改。`);
                } else if (matchFoundInPass) {
                    // 即使 HTML 没变 (例如，所有条件都为假，所有块都被替换为空字符串)，但只要有匹配和替换发生，changedInThisPass 就应为 true
                    // 这个分支理论上不应该进入，因为如果 matchFoundInPass 为 true，changedInThisPass 也应为 true
                    console.log(`[DEBUG serveHtml Iteration ${iterations}] HTML 未更改，但有匹配发生 (逻辑可能需要检查)。`);
                } else {
                     console.log(`[DEBUG serveHtml Iteration ${iterations}] HTML 在此迭代中未更改，且未找到新匹配。`);
                }
                 console.log(`[DEBUG serveHtml Iteration ${iterations}] 当前 HTML (片段): \n'''\n${renderedHtml.substring(0, 1000)}\n'''`);


            } while (changedInThisPass && iterations < MAX_ITERATIONS);
            
            if (iterations >= MAX_ITERATIONS && changedInThisPass) {
                console.warn(`[DEBUG serveHtml] 条件处理达到最大迭代次数 (${MAX_ITERATIONS}) 且HTML仍在变化。 文件: ${htmlFilePath}`);
            }
            console.log(`\n[DEBUG serveHtml] --- 条件块处理完成 (共 ${iterations} 次迭代) ---`);
            
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
            console.log(`[DEBUG serveHtml] 变量替换后的 HTML (片段): \n'''\n${renderedHtml.substring(0, 1000)}\n'''`);
            console.log(`[DEBUG serveHtml END] ======================================================\n`);

            res.writeHead(statusCode, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(renderedHtml);
        });
    }
};
