// userController.js - 使用者相關操作的控制器
const storage = require('./storage');
const auth = require('./auth');
const {
    serveHtmlWithPlaceholders,
    serveJson,
    redirect,
    sendError,
    sendUnauthorized,
    sendForbidden,
    sendBadRequest
} = require('./responseUtils');
const path =require('path');

const PUBLIC_DIR = path.join(__dirname, 'public');

module.exports = {
    getLoginPage: (context) => {
        if (context.session) {
            return redirect(context.res, '/');
        }
        const error = context.query.error || (context.body ? context.body.error_message_server : null);
        serveHtmlWithPlaceholders(context.res, path.join(PUBLIC_DIR, 'login.html'), {
            error_message: error || '',
            username_value: context.body ? context.body.username : (context.query.username || '')
        });
    },

    loginUser: (context) => {
        const { username, password } = context.body;
        if (!username) {
            return serveHtmlWithPlaceholders(context.res, path.join(PUBLIC_DIR, 'login.html'), {
                error_message: '使用者名稱不能為空。',
                username_value: username || ''
            }, 400);
        }
        const user = storage.findUserByUsername(username);
        let passwordMatch = false;
        if (user) {
            if (user.role === 'admin') {
                passwordMatch = user.password && user.password === password;
            } else {
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
            }, 401);
        }
    },

    logoutUser: (context) => {
        auth.logout(context.req, context.res);
        redirect(context.res, '/login');
    },

    // --- 新增：註冊相關 ---
    getRegisterPage: (context) => {
        if (context.session) { // 如果已登入，重定向到主頁
            return redirect(context.res, '/');
        }
        serveHtmlWithPlaceholders(context.res, path.join(PUBLIC_DIR, 'register.html'));
    },

    registerUser: (context) => {
        const { username, password } = context.body; // 密碼確認應在客戶端完成，伺服器端只接收最終密碼

        if (!username || username.trim() === '') {
            return sendBadRequest(context.res, JSON.stringify({ message: "使用者名稱不能為空。" }));
        }
        // 密碼可以為空，所以不需要檢查 password 是否為空

        if (storage.findUserByUsername(username.trim())) {
            return sendError(context.res, JSON.stringify({ message: "此使用者名稱已被註冊。" }), 409); // 409 Conflict
        }

        const newUser = storage.saveUser({
            username: username.trim(),
            password: password || '', // 如果密碼為 undefined 或 null，則存為空字串
            role: 'user' // 新註冊的使用者固定為普通使用者
        });

        if (newUser && newUser.id) {
            // 註冊成功，返回新使用者的部分資訊 (不含密碼)
            serveJson(context.res, { id: newUser.id, username: newUser.username, role: newUser.role }, 201); // 201 Created
        } else {
            sendError(context.res, JSON.stringify({ message: "註冊過程中發生錯誤，請稍後再試。" }));
        }
    },
    // --- 管理員功能 ---
    getAdminUsersPage: (context) => {
        serveHtmlWithPlaceholders(context.res, path.join(PUBLIC_DIR, 'admin.html'), {
            adminUsername: context.session.username
        });
    },

    listAllUsers: (context) => {
        const users = storage.getUsers().map(u => ({ id: u.id, username: u.username, role: u.role }));
        serveJson(context.res, users);
    },

    createUserByAdmin: (context) => {
        const { username, password, role = 'user' } = context.body;
        if (!username || username.trim() === '') return sendBadRequest(context.res, "使用者名稱不能為空。");
        if (role === 'admin' && (!password || password.trim() === '')) return sendBadRequest(context.res, "管理員的密碼不能為空。");
        if (storage.findUserByUsername(username)) return sendError(context.res, "使用者名稱已存在。", 409);
        const newUserPassword = (role === 'user' && (password === undefined || password === null)) ? '' : password;
        const newUser = storage.saveUser({ username: username.trim(), password: newUserPassword, role });
        if (newUser) serveJson(context.res, { id: newUser.id, username: newUser.username, role: newUser.role }, 201);
        else sendError(context.res, "建立使用者失敗。");
    },

    deleteUserByAdmin: (context) => {
        const userIdToDelete = context.pathname.split('/').pop();
        if (!userIdToDelete) return sendBadRequest(context.res, "缺少使用者 ID。");
        const userToDelete = storage.findUserById(userIdToDelete);
        if (!userToDelete) return sendNotFound(context.res, "找不到要刪除的使用者。");
        if (userIdToDelete === context.session.userId) return sendForbidden(context.res, "管理員不能刪除自己的帳號。");
        if (userToDelete.role === 'admin') {
            const allUsers = storage.getUsers();
            const adminUsers = allUsers.filter(u => u.role === 'admin');
            if (adminUsers.length <= 1) return sendForbidden(context.res, "不能刪除最後一位管理員。系統至少需要一位管理員。");
        }
        if (storage.deleteUser(userIdToDelete)) serveJson(context.res, { message: `使用者 ${userToDelete.username} (ID: ${userIdToDelete}) 已成功刪除。` });
        else sendError(context.res, "刪除使用者失敗。");
    }
};
