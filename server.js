// server.js - 主伺服器邏輯
const http = require('http');
const fs = require('fs');
const path = require('path');
const { handleRequest } = require('./router'); // 路由處理函數
const storage = require('./storage'); // 引入 storage 模組以初始化管理員

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// 確保資料和上傳目錄存在
function initializeDirectories() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        console.log(`目錄 ${DATA_DIR} 已建立。`);
    }
    if (!fs.existsSync(UPLOADS_DIR)) {
        fs.mkdirSync(UPLOADS_DIR, { recursive: true });
        console.log(`目錄 ${UPLOADS_DIR} 已建立。`);
    }
    // 初始化 JSON 檔案 (如果不存在)
    if (!fs.existsSync(path.join(DATA_DIR, 'users.json'))) {
        fs.writeFileSync(path.join(DATA_DIR, 'users.json'), '[]', 'utf8');
        console.log(`檔案 ${path.join(DATA_DIR, 'users.json')} 已建立。`);
    }
    if (!fs.existsSync(path.join(DATA_DIR, 'notes.json'))) {
        fs.writeFileSync(path.join(DATA_DIR, 'notes.json'), '[]', 'utf8');
        console.log(`檔案 ${path.join(DATA_DIR, 'notes.json')} 已建立。`);
    }
}

// 初始化管理員帳號
function initializeAdminUser() {
    const adminUsername = 'admin';
    if (!storage.findUserByUsername(adminUsername)) {
        storage.saveUser({
            id: `user_${Date.now()}`, // 確保 ID 被設定
            username: adminUsername,
            password: 'admin', // 極度不安全，僅供演示
            role: 'admin'
        });
        console.log(`預設管理員帳號 '${adminUsername}' (密碼: 'admin') 已建立。`);
        console.warn("警告：預設管理員密碼非常不安全，請考慮在首次登入後修改 (雖然本應用未提供此功能)。");
    }
}

const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
        const rawBuffer = Buffer.concat(chunks); // 原始請求體 Buffer
        // 將原始 buffer 傳遞給路由處理，由路由或控制器決定如何解析
        handleRequest(req, res, rawBuffer);
    });
    req.on('error', (err) => {
        console.error('請求錯誤:', err);
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('伺服器內部錯誤');
    });
});

server.listen(PORT, () => {
    initializeDirectories();
    initializeAdminUser();
    console.log(`伺服器正在監聽 http://localhost:${PORT}/`);
    console.log("請注意：本應用程式密碼以明文儲存，存在嚴重安全風險，僅供演示用途。");
});

// 處理未捕獲的異常，防止伺服器崩潰
process.on('uncaughtException', (err) => {
    console.error('未捕獲的異常:', err);
    // 在生產環境中，您可能需要更優雅地關閉伺服器或重啟
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('未處理的 Promise Rejection:', promise, '原因:', reason);
});
