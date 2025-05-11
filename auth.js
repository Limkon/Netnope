// auth.js - 使用者認證與會話管理
const crypto = require('crypto'); // 用於產生 sessionId

// 在記憶體中儲存會話。在生產環境中，應使用更持久的儲存方式（如 Redis 或資料庫）。
// 結構: { sessionId: { userId, username, role, expiresAt } }
const sessions = {};
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 會話有效期：24 小時 (毫秒)

function generateSessionId() {
    return crypto.randomBytes(32).toString('hex'); // 產生一個更長的隨機 sessionId
}

function parseCookies(cookieHeader = '') {
    const list = {};
    if (!cookieHeader) return list;

    cookieHeader.split(';').forEach(cookie => {
        let [name, ...rest] = cookie.split('=');
        name = name?.trim();
        if (!name) return;
        const value = rest.join('=').trim();
        try {
            list[name] = decodeURIComponent(value);
        } catch (e) {
            // 如果解碼失敗，可能 cookie 值包含無效的百分比編碼序列
            console.warn(`解碼 cookie "${name}" 失敗:`, e.message);
            list[name] = value; // 保留原始值
        }
    });
    return list;
}

module.exports = {
    login: (res, user) => {
        const sessionId = generateSessionId();
        const expiresAt = Date.now() + SESSION_DURATION;
        sessions[sessionId] = {
            userId: user.id,
            username: user.username,
            role: user.role,
            expiresAt
        };
        // HttpOnly: 防止客戶端 JS 存取 cookie，增加安全性
        // Secure: 應在 HTTPS 環境中設定，指示瀏覽器僅透過 HTTPS 發送 cookie
        // Path=/: 使 cookie 在整個網站中可用
        // Max-Age: cookie 的生命週期 (秒)
        // SameSite=Lax: 提供對 CSRF 的一些保護
        res.setHeader('Set-Cookie', `sessionId=${sessionId}; HttpOnly; Path=/; Max-Age=${SESSION_DURATION / 1000}; SameSite=Lax`);
        console.log(`使用者 ${user.username} 登入成功，Session ID: ${sessionId}`);
    },
    logout: (req, res) => {
        const cookies = parseCookies(req.headers.cookie);
        const sessionId = cookies.sessionId;
        if (sessionId && sessions[sessionId]) {
            const username = sessions[sessionId].username;
            delete sessions[sessionId];
            console.log(`使用者 ${username} (Session ID: ${sessionId}) 已登出。`);
        }
        // 設定一個立即過期的 cookie 以清除瀏覽器中的 sessionId
        res.setHeader('Set-Cookie', 'sessionId=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
    },
    authenticate: (req) => {
        const cookies = parseCookies(req.headers.cookie);
        const sessionId = cookies.sessionId;

        if (sessionId && sessions[sessionId]) {
            const sessionData = sessions[sessionId];
            if (sessionData.expiresAt > Date.now()) {
                // 可選：刷新會話有效期 (滑動會話)
                // sessionData.expiresAt = Date.now() + SESSION_DURATION;
                return sessionData; // 返回 { userId, username, role, expiresAt }
            } else {
                // 會話已過期
                console.log(`Session ID ${sessionId} (使用者: ${sessionData.username}) 已過期。`);
                delete sessions[sessionId];
            }
        }
        return null; // 未認證或會話無效/過期
    },
    // 清理過期的會話 (可以定期執行，例如使用 setInterval)
    cleanupExpiredSessions: () => {
        const now = Date.now();
        let cleanedCount = 0;
        for (const sessionId in sessions) {
            if (sessions[sessionId].expiresAt <= now) {
                delete sessions[sessionId];
                cleanedCount++;
            }
        }
        if (cleanedCount > 0) {
            console.log(`已清理 ${cleanedCount} 個過期會話。`);
        }
    }
};

// 定期清理過期會話 (例如，每小時一次)
setInterval(module.exports.cleanupExpiredSessions, 60 * 60 * 1000);
