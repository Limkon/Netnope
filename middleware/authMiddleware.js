// middleware/authMiddleware.js
export function isAuthenticated(req, res, next) {
    if (req.session.user) {
        return next();
    }
    req.session.originalUrl = req.originalUrl; // 保存原始请求的URL，登录后可以重定向回去
    res.redirect('/auth/login');
}

export function isAdmin(req, res, next) {
    if (req.session.user && req.session.user.role === 'admin') {
        return next();
    }
    // 如果不是管理员，可以重定向到首页或显示一个错误消息
    // 对于API请求，可能返回403 Forbidden
    req.session.error = '您没有权限访问此页面。'; // 使用 session 存储错误信息
    res.status(403).redirect('/notes'); // 重定向到用户有权限的页面
    // res.status(403).send('禁止访问：仅限管理员。');
}

// 中间件，用于将用户信息和消息传递给所有视图
export function setLocals(req, res, next) {
    res.locals.currentUser = req.session.user;
    res.locals.message = req.session.message;
    res.locals.error = req.session.error;
    // 清除一次性消息，避免在下次渲染时仍然显示
    delete req.session.message;
    delete req.session.error;
    next();
}
