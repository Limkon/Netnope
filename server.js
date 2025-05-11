import express from 'express';
import methodOverride from 'method-override';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import session from 'express-session'; // 引入 express-session

// 路由
import noteRoutes from './routes/notes.js';
import authRoutes from './routes/auth.js';   // 引入 auth 路由
import adminRoutes from './routes/admin.js'; // 引入 admin 路由

import { ensureUploadsDir, ensureNotesDataDir } from './utils/fileStore.js'; // 假设 fileStore.js 导出 ensureNotesDataDir
import { setLocals } from './middleware/authMiddleware.js'; // 引入 setLocals 中间件

// 配置 dotenv
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8100;

// 确保上传目录和笔记数据目录存在
ensureUploadsDir().catch(err => console.error("Failed to ensure uploads directory on startup:", err));
// await ensureNotesDataDir(); // 如果 fileStore.js 中没有自动创建，这里可以调用

// Session 配置
app.use(session({
  secret: process.env.SESSION_SECRET, // 从 .env 文件读取
  resave: false,
  saveUninitialized: false, // 对于登录会话，通常设置为false
  cookie: {
    secure: process.env.NODE_ENV === 'production', // 在生产环境中应为 true (需要HTTPS)
    httpOnly: true, // 防止客户端JS访问cookie
    maxAge: 24 * 60 * 60 * 1000 // cookie 有效期，例如24小时
  }
}));

// 中间件
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

// 将用户信息和消息传递给所有视图的中间件
app.use(setLocals);


// 路由
app.get('/', (req, res) => {
  if (req.session.user) {
    res.redirect('/notes');
  } else {
    res.redirect('/auth/login');
  }
});
app.use('/auth', authRoutes);   // 挂载 auth 路由
app.use('/notes', noteRoutes);  // notes 路由现在需要认证保护
app.use('/admin', adminRoutes); // 挂载 admin 路由

// 404 错误处理 (应在所有路由之后)
app.use((req, res, next) => {
  res.status(404).render('partials/404', { pageTitle: '页面未找到' });
});

// 全局错误处理
app.use((err, req, res, next) => {
  console.error("全局错误处理器:", err.stack);
  // 根据错误类型渲染不同页面或返回不同JSON
  res.status(err.status || 500).render('partials/error', { // 假设你有一个 error.ejs
      pageTitle: '服务器错误',
      error: {
          message: err.message,
          status: err.status || 500,
          stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
      }
  });
});

app.listen(PORT, () => {
  console.log(`服务器正在运行于 http://localhost:${PORT}`);
  console.log(`提示: 第一个注册的用户将自动成为管理员。`);
});
