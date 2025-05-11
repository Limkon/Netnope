// auth.js - 用户认证与会话管理 (使用哈希密码)
const crypto = require('crypto');
const storage = require('./storage'); // 需要 storage 来访问 hashPassword

const sessions = {};
const SESSION_DURATION = 24 * 60 * 60 * 1000;

function generateSessionId() {
    return crypto.randomBytes(32).toString('hex');
}

function parseCookies(cookieHeader = '') {
    const list = {};
    if (!cookieHeader) return list;
    cookieHeader.split(';').forEach(cookie => {
        let [name, ...rest] = cookie.split('=');
        name = name?.trim();
        if (!name) return;
        const value = rest.join('=').trim();
        try { list[name] = decodeURIComponent(value); }
        catch (e) { list[name] = value; }
    });
    return list;
}

module.exports = {
    verifyPassword: (providedPassword, salt, hashedPassword) => {
        // 如果存储的哈希密码为空字符串，表示用户设置了空密码
        if (hashedPassword === '') {
            return (providedPassword === '' || providedPassword === null || providedPassword === undefined);
        }
        // 如果提供的密码为空，但存储的密码非空，则不匹配
        if (providedPassword === '' || providedPassword === null || providedPassword === undefined) {
            return false;
        }
        // 正常比较哈希值
        return storage.hashPassword(providedPassword, salt) === hashedPassword;
    },
    login: (res, userSessionData) => { // userSessionData 应该是 { id, username, role }
        const sessionId = generateSessionId();
        const expiresAt = Date.now() + SESSION_DURATION;
        sessions[sessionId] = {
            userId: userSessionData.id,
            username: userSessionData.username,
            role: userSessionData.role,
            expiresAt
        };
        res.setHeader('Set-Cookie', `sessionId=${sessionId}; HttpOnly; Path=/; Max-Age=${SESSION_DURATION / 1000}; SameSite=Lax`);
        console.log(`用户 ${userSessionData.username} 登录成功，Session ID: ${sessionId}`);
    },
    logout: (req, res) => {
        const cookies = parseCookies(req.headers.cookie);
        const sessionId = cookies.sessionId;
        if (sessionId && sessions[sessionId]) {
            const username = sessions[sessionId].username;
            delete sessions[sessionId];
            console.log(`用户 ${username} (Session ID: ${sessionId}) 已登出。`);
        }
        res.setHeader('Set-Cookie', 'sessionId=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
    },
    authenticate: (req) => {
        const cookies = parseCookies(req.headers.cookie);
        const sessionId = cookies.sessionId;
        if (sessionId && sessions[sessionId]) {
            const sessionData = sessions[sessionId];
            if (sessionData.expiresAt > Date.now()) {
                return sessionData;
            } else {
                delete sessions[sessionId];
            }
        }
        return null;
    },
    cleanupExpiredSessions: () => {
        const now = Date.now();
        let cleanedCount = 0;
        for (const sessionId in sessions) {
            if (sessions[sessionId].expiresAt <= now) {
                delete sessions[sessionId];
                cleanedCount++;
            }
        }
        if (cleanedCount > 0) console.log(`已清理 ${cleanedCount} 个过期会话。`);
    }
};
setInterval(module.exports.cleanupExpiredSessions, 60 * 60 * 1000);
