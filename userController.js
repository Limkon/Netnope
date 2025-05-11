// userController.js - 使用者相關操作的控制器
const storage = require('../storage');
const auth = require('../auth');
const {
    serveHtmlWithPlaceholders,
    serveJson,
    redirect,
    sendError,
    sendUnauthorized,
    sendForbidden,
    sendBadRequest
} = require('../responseUtils');
const path =require('path');

const PUBLIC_DIR = path.join(__dirname, '../public');

module.exports = {
    getLoginPage: (context) => {
        if (context.session) { // 如果已登入，重定向到主頁
            return redirect(context.res, '/');
        }
        serveHtmlWithPlaceholders(context.res, path.join(PUBLIC_DIR, 'login.html'));
    },

    loginUser: (context) => {
        const { username, password } = context.body; // context.body 已由 router 解析
        if (!username) { // 密碼可以為空，但使用者名稱不能
            // return sendBadRequest(context.res, "使用者名稱不能為空。");
            return serveHtmlWithPlaceholders(context.res, path.join(PUBLIC_DIR, 'login.html'), {
                error_message: '使用者名稱不能為空。',
                username_value: username || ''
            }, 400);
        }

        const user = storage.findUserByUsername(username);

        // 密碼檢查：允許普通使用者密碼為空。明文比較。
        // 管理員密碼不能為空。
        let passwordMatch = false;
        if (user) {
            if (user.role === 'admin') {
                passwordMatch = user.password && user.password === password;
            } else { // 普通使用者
                // 處理 undefined, null, 或空字串密碼的情況
                const userStoredPassword = user.password === null || user.password === undefined ? "" : user.password;
                const providedPassword = password === null || password === undefined ? "" : password;
                passwordMatch = userStoredPassword === providedPassword;
            }
        }

        if (user && passwordMatch) {
            auth.login(context.res, user);
            redirect(context.res, '/');
        } else {
            serveHtmlWithPlaceholders(context.res, path.join(PUBLIC_DIR, 'login.html'), {
                error_message: '使用者名稱或密碼錯誤。',
                username_value: username || ''
            }, 401); // 401 Unauthorized for login failure
        }
    },

    logoutUser: (context) => {
        auth.logout(context.req, context.res);
        redirect(context.res, '/login');
    },

    // --- 管理員功能 ---
    getAdminUsersPage: (context) => {
        // 權限已在 router 中檢查
        serveHtmlWithPlaceholders(context.res, path.join(PUBLIC_DIR, 'admin.html'), {
            adminUsername: context.session.username
        });
    },

    listAllUsers: (context) => {
        // 權限已在 router 中檢查
        const users = storage.getUsers().map(u => ({ id: u.id, username: u.username, role: u.role })); // 不返回密碼
        serveJson(context.res, users);
    },

    createUserByAdmin: (context) => {
        // 權限已在 router 中檢查
        const { username, password, role = 'user' } = context.body;

        if (!username || username.trim() === '') {
            return sendBadRequest(context.res, "使用者名稱不能為空。");
        }
        if (role === 'admin' && (!password || password.trim() === '')) {
            return sendBadRequest(context.res, "管理員的密碼不能為空。");
        }
        if (storage.findUserByUsername(username)) {
            return sendError(context.res, "使用者名稱已存在。", 409); // 409 Conflict
        }
        // 對於普通使用者，密碼可以為空字串
        const newUserPassword = (role === 'user' && (password === undefined || password === null)) ? '' : password;

        const newUser = storage.saveUser({
            username: username.trim(),
            password: newUserPassword, // 明文儲存，極不安全
            role
        });
        if (newUser) {
            serveJson(context.res, { id: newUser.id, username: newUser.username, role: newUser.role }, 201); // 201 Created
        } else {
            sendError(context.res, "建立使用者失敗。可能是因為使用者名稱重複（即使ID不同）。");
        }
    },

    deleteUserByAdmin: (context) => {
        // 權限已在 router 中檢查
        const userIdToDelete = context.pathname.split('/').pop(); // 從 URL 中獲取使用者 ID
        if (!userIdToDelete) {
            return sendBadRequest(context.res, "缺少使用者 ID。");
        }
        if (userIdToDelete === context.session.userId) {
            return sendForbidden(context.res, "管理員不能刪除自己的帳號。");
        }
        const userToDelete = storage.findUserById(userIdToDelete);
        if (!userToDelete) {
            return sendNotFound(context.res, "找不到要刪除的使用者。");
        }
        if (userToDelete.role === 'admin' && userToDelete.username === 'admin') {
             // 可以考慮不允許刪除預設的 admin 帳號，或者至少給出警告
             // return sendForbidden(context.res, "不能刪除主要的 'admin' 帳號。");
        }

        if (storage.deleteUser(userIdToDelete)) {
            serveJson(context.res, { message: `使用者 ${userToDelete.username} (ID: ${userIdToDelete}) 已成功刪除。` });
        } else {
            sendError(context.res, "刪除使用者失敗。");
        }
    }
    // 可選：updateUserByAdmin (例如：重設密碼)
    // updateUserByAdmin: (context) => { ... }
};
