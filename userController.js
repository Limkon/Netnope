// userController.js - 用户相关操作的控制器
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

// 辅助函数，用于获取传递给模板的导航数据
// 这个函数主要用于通用的 username 和 userRole，对于 admin 页面可能需要更特定的数据
function getGeneralNavData(session) {
    return {
        username: session ? session.username : '访客',
        userRole: session ? session.role : 'anonymous',
        userId: session ? session.userId : '' // 确保 userId 也传递
    };
}

module.exports = {
    getLoginPage: (context) => {
        if (context.session && context.session.role !== 'anonymous') {
            return redirect(context.res, '/');
        }
        serveHtmlWithPlaceholders(context.res, path.join(PUBLIC_DIR, 'login.html'), {
            error_message: context.query.error || '',
            username_value: context.query.username_value || '',
            ...getGeneralNavData(context.session) 
        });
    },

    loginUser: (context) => {
        const { username, password } = context.body;
        if (!username) {
            return serveHtmlWithPlaceholders(context.res, path.join(PUBLIC_DIR, 'login.html'), {
                error_message: '用户名不能为空。', username_value: username || '',
                ...getGeneralNavData(context.session)
            }, 400);
        }
        const user = storage.findUserByUsername(username); 

        if (user && user.salt && auth.verifyPassword(password, user.salt, user.hashedPassword)) {
            auth.login(context.res, { id: user.id, username: user.username, role: user.role });
            redirect(context.res, '/');
        } else {
            serveHtmlWithPlaceholders(context.res, path.join(PUBLIC_DIR, 'login.html'), {
                error_message: '用户名或密码错误。', username_value: username || '',
                ...getGeneralNavData(context.session)
            }, 401);
        }
    },

    logoutUser: (context) => {
        auth.logout(context.req, context.res);
        redirect(context.res, '/login');
    },

    getRegisterPage: (context) => {
        if (context.session && context.session.role !== 'anonymous') { 
            return redirect(context.res, '/');
        }
        serveHtmlWithPlaceholders(context.res, path.join(PUBLIC_DIR, 'register.html'), {
            ...getGeneralNavData(context.session)
        });
    },

    registerUser: (context) => {
        const { username, password } = context.body; 
        if (!username || username.trim() === '') {
            return sendBadRequest(context.res, JSON.stringify({ message: "用户名不能为空。" }));
        }
        if (storage.findUserByUsername(username.trim())) {
            return sendError(context.res, JSON.stringify({ message: "此用户名已被注册。" }), 409);
        }
        const newUser = storage.saveUser({
            username: username.trim(),
            password: password, 
            role: 'user' 
        });
        if (newUser && newUser.id) {
            serveJson(context.res, { id: newUser.id, username: newUser.username, role: newUser.role }, 201);
        } else {
            sendError(context.res, JSON.stringify({ message: "注册过程中发生错误，请稍后再试。" }));
        }
    },
    
    getAdminUsersPage: (context) => {
        // 权限应在 router 中检查
        if (!context.session || context.session.role !== 'admin') {
            return sendForbidden(context.res, "您没有权限访问此页面。");
        }
        serveHtmlWithPlaceholders(context.res, path.join(PUBLIC_DIR, 'admin.html'), {
            adminUsername: context.session.username, // 明确传递 adminUsername
            adminUserId: context.session.userId,   // 明确传递 adminUserId
            // 也传递通用的导航数据，以防模板中其他地方使用 {{username}} 或 {{userRole}}
            username: context.session.username,
            userRole: context.session.role,
            userId: context.session.userId
        });
    },

    listAllUsers: (context) => {
        const users = storage.getUsers().map(u => ({
            id: u.id,
            username: u.username,
            role: u.role
        }));
        serveJson(context.res, users);
    },

    createUserByAdmin: (context) => {
        const { username, password, role = 'user' } = context.body;
        if (!username || username.trim() === '') return sendBadRequest(context.res, "用户名不能为空。");
        if (role === 'admin' && (!password || password.trim() === '')) return sendBadRequest(context.res, "管理员的密码不能为空。");
        
        if (storage.findUserByUsername(username.trim())) {
            return sendError(context.res, "用户名已存在。", 409);
        }
        
        const newUser = storage.saveUser({ username: username.trim(), password: password, role });
        if (newUser && newUser.id) { 
            serveJson(context.res, { id: newUser.id, username: newUser.username, role: newUser.role }, 201);
        } else {
            sendError(context.res, "创建用户失败。可能是用户名已存在或发生内部错误。");
        }
    },

    deleteUserByAdmin: (context) => {
        const userIdToDelete = context.pathname.split('/').pop();
        if (!userIdToDelete) return sendBadRequest(context.res, "缺少用户 ID。");
        const userToDelete = storage.findUserById(userIdToDelete);
        if (!userToDelete) return sendNotFound(context.res, "找不到要删除的用户。");
        if (userIdToDelete === context.session.userId) return sendForbidden(context.res, "管理员不能删除自己的帐号。");
        if (userToDelete.role === 'admin') {
            const allUsers = storage.getUsers();
            const adminUsers = allUsers.filter(u => u.role === 'admin');
            if (adminUsers.length <= 1) return sendForbidden(context.res, "不能删除最后一位管理员。系统至少需要一位管理员。");
        }
        if (storage.deleteUser(userIdToDelete)) serveJson(context.res, { message: `用户 ${userToDelete.username} (ID: ${userIdToDelete}) 已成功删除。` });
        else sendError(context.res, "删除用户失败。");
    },

    updateUserPasswordByAdmin: (context) => {
        const userIdToUpdate = context.pathname.split('/')[3]; 
        const { newPassword } = context.body;

        if (!userIdToUpdate) {
            return sendBadRequest(context.res, JSON.stringify({ message: "缺少用户 ID。" }));
        }
        const userToUpdate = storage.findUserById(userIdToUpdate);
        if (!userToUpdate) {
            return sendNotFound(context.res, JSON.stringify({ message: "找不到要更新密码的用户。" }));
        }
        if (userToUpdate.role === 'admin' && (newPassword === undefined || newPassword === null || newPassword.trim() === '')) {
            return sendBadRequest(context.res, JSON.stringify({ message: "管理员的新密码不能为空。" }));
        }
        
        const updatedUser = storage.saveUser({ ...userToUpdate, password: newPassword });
        if (updatedUser) {
            serveJson(context.res, { message: `用户 ${userToUpdate.username} 的密码已成功更新。` });
        } else {
            sendError(context.res, JSON.stringify({ message: "更新密码失败。" }));
        }
    },

    getChangePasswordPage: (context) => {
        if (!context.session || context.session.role === 'anonymous') { 
             return redirect(context.res, '/login');
        }
        serveHtmlWithPlaceholders(context.res, path.join(PUBLIC_DIR, 'change-password.html'), {
            ...getGeneralNavData(context.session) 
        });
    },

    changeOwnPassword: (context) => {
        const { currentPassword, newPassword, confirmNewPassword } = context.body;
        const userId = context.session.userId;

        if (newPassword !== confirmNewPassword) {
            return sendBadRequest(context.res, JSON.stringify({ message: "新密码和确认密码不匹配。" }));
        }
        
        const user = storage.findUserById(userId);
        if (!user || !user.salt) { 
            return sendError(context.res, JSON.stringify({ message: "无法验证当前用户。" }));
        }

        if (!auth.verifyPassword(currentPassword, user.salt, user.hashedPassword)) {
            return sendError(context.res, JSON.stringify({ message: "当前密码不正确。" }), 403);
        }
        
        if (user.role === 'admin' && newPassword.trim() === '') {
             return sendBadRequest(context.res, JSON.stringify({ message: "管理员的新密码不能为空。" }));
        }

        const updatedUser = storage.saveUser({ ...user, password: newPassword });
        if (updatedUser) {
            serveJson(context.res, { message: "密码已成功修改。" });
        } else {
            sendError(context.res, JSON.stringify({ message: "修改密码失败，请稍后再试。" }));
        }
    }
};
