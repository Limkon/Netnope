import express from 'express';
import { createUser, findUserByUsername, verifyPassword } from '../utils/userStore.js';

const router = express.Router();

// GET /auth/register - 显示注册表单
router.get('/register', (req, res) => {
    if (req.session.user) {
        return res.redirect('/notes'); // 如果已登录，则重定向
    }
    res.render('auth/register', { pageTitle: '注册', error: null, username: '' });
});

// POST /auth/register - 处理注册逻辑
router.post('/register', async (req, res) => {
    const { username, password, confirmPassword } = req.body;

    if (!username || !password || !confirmPassword) {
        return res.status(400).render('auth/register', {
            pageTitle: '注册',
            error: '所有字段都是必填的。',
            username: username
        });
    }

    if (password !== confirmPassword) {
        return res.status(400).render('auth/register', {
            pageTitle: '注册',
            error: '两次输入的密码不匹配。',
            username: username
        });
    }

    try {
        const existingUser = await findUserByUsername(username);
        if (existingUser) {
            return res.status(400).render('auth/register', {
                pageTitle: '注册',
                error: '该用户名已被注册。',
                username: username
            });
        }

        const newUser = await createUser(username, password);
        // 注册成功后自动登录 (可选)
        // req.session.user = { id: newUser.id, username: newUser.username, role: newUser.role };
        // return res.redirect('/notes');
        // 或者重定向到登录页面并显示成功消息
        req.session.message = '注册成功！现在您可以登录了。'; // 临时消息，可使用connect-flash
        return res.redirect('/auth/login');

    } catch (err) {
        console.error('注册错误:', err);
        res.status(500).render('auth/register', {
            pageTitle: '注册',
            error: '注册过程中发生错误，请稍后再试。',
            username: username
        });
    }
});

// GET /auth/login - 显示登录表单
router.get('/login', (req, res) => {
    if (req.session.user) {
        return res.redirect('/notes');
    }
    const message = req.session.message; // 获取注册成功消息
    delete req.session.message; // 删除消息，避免重复显示
    res.render('auth/login', { pageTitle: '登录', error: null, message: message });
});

// POST /auth/login - 处理登录逻辑
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).render('auth/login', { pageTitle: '登录', error: '用户名和密码不能为空。', message: null });
    }

    try {
        const user = await findUserByUsername(username);
        if (!user) {
            return res.status(401).render('auth/login', { pageTitle: '登录', error: '用户名或密码错误。', message: null });
        }

        const isMatch = await verifyPassword(password, user.passwordHash);
        if (!isMatch) {
            return res.status(401).render('auth/login', { pageTitle: '登录', error: '用户名或密码错误。', message: null });
        }

        req.session.user = {
            id: user.id,
            username: user.username,
            role: user.role
        };
        res.redirect('/notes');

    } catch (err) {
        console.error('登录错误:', err);
        res.status(500).render('auth/login', { pageTitle: '登录', error: '登录过程中发生错误，请稍后再试。', message: null });
    }
});

// POST /auth/logout - 处理登出逻辑
router.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error("退出登录错误:", err);
            return res.redirect('/notes'); // 或者其他错误处理
        }
        res.clearCookie('connect.sid'); // 清除 session cookie
        res.redirect('/auth/login');
    });
});

export default router;
