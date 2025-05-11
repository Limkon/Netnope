import express from 'express';
import { getAllUsers, deleteUserById, findUserById } from '../utils/userStore.js'; // 假设 userStore 有这些函数
import { isAdmin, isAuthenticated } from '../middleware/authMiddleware.js'; // 我们将创建这个中间件

const router = express.Router();

// GET /admin/users - 显示用户列表 (仅限管理员)
router.get('/users', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const users = await getAllUsers();
        res.render('admin/users', {
            pageTitle: '用户管理',
            users: users,
            currentUser: req.session.user, // 传递 currentUser 给模板
            message: req.session.message,
            error: req.session.error
        });
        delete req.session.message;
        delete req.session.error;
    } catch (error) {
        console.error("获取用户列表错误:", error);
        req.session.error = '无法加载用户列表。';
        res.redirect('/notes'); // 或者渲染一个错误页面
    }
});

// DELETE /admin/users/:id - 删除用户 (仅限管理员)
router.delete('/users/:id', isAuthenticated, isAdmin, async (req, res) => {
    const userIdToDelete = req.params.id;
    const currentUserId = req.session.user.id;

    if (userIdToDelete === currentUserId) {
        req.session.error = '不能删除自己。';
        return res.redirect('/admin/users');
    }

    try {
        const userToDelete = await findUserById(userIdToDelete);
        if (!userToDelete) {
            req.session.error = '用户未找到。';
            return res.redirect('/admin/users');
        }
        // 额外的安全措施：防止非admin尝试删除或admin尝试删除其他admin（除非有更细致的权限）
        if (userToDelete.role === 'admin') {
             req.session.error = '不能删除其他管理员账户。';
             return res.redirect('/admin/users');
        }

        const success = await deleteUserById(userIdToDelete);
        if (success) {
            req.session.message = '用户删除成功。';
        } else {
            req.session.error = '删除用户失败。';
        }
    } catch (error) {
        console.error("删除用户错误:", error);
        req.session.error = '删除用户时发生错误。';
    }
    res.redirect('/admin/users');
});


export default router;
