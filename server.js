import express from 'express';
import methodOverride from 'method-override';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import session from 'express-session';

// 路由导入
import noteRoutes from './routes/notes.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';

// 工具函数和中间件导入
import { ensureUploadsDir, ensureNotesDataDir } from './utils/fileStore.js'; // 确保这些函数已在 fileStore.js 中正确导出
import { setLocals } from './middleware/authMiddleware.js'; // 用于将 session 信息传递给模板

// 配置 dotenv，加载 .env 文件中的环境变量
dotenv.config();

// ES Modules 中获取 __filename 和 __dirname 的方法
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 初始化 Express 应用
const app = express();
const PORT = process.env.PORT || 8100;

// 启动时确保必要的目录存在
// (fileStore.js 和 userStore.js 在其内部也可能有自己的目录检查逻辑)
ensureUploadsDir().catch(err => console.error("Failed to ensure uploads directory on startup:", err));
ensureNotesDataDir().catch(err => console.error("Failed to ensure notes data directory on startup:", err));
// 注意：userStore.js 内部的 ensureDataDir 会确保 data/users.json 的父目录存在

// Session 配置
app.use(session({
  secret: process.env.SESSION_SECRET, // 从 .env 文件读取，非常重要，请设置为一个复杂随机字符串
  resave: false,                      // 强制将会话保存回会话存储，即使会话在请求期间未曾修改。通常设置为 false。
  saveUninitialized: false,           // 强制将“未初始化”的会话保存到存储。当会话是新的但未修改时，它是未初始化的。通常设置为 false。
  cookie: {
    secure: process.env.NODE_ENV === 'production', // 在生产环境中应为 true (需要HTTPS)
    httpOnly: true,                               // 防止客户端JavaScript访问cookie，增强安全性
    maxAge: 24 * 60 * 60 * 1000                   // cookie 有效期，例如24小时 (单位：毫秒)
  }
}));

// EJS 视图引擎设置
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views')); // 设置视图文件的查找目录

// Express 内置中间件
app.use(express.urlencoded({ extended: true })); // 解析 URL-encoded 请求体 (例如来自HTML表单)
app.use(express.json());                         // 解析 JSON 请求体

// method-override 中间件，用于支持 PUT 和 DELETE 等HTTP方法 (通过 _method 查询参数)
app.use(methodOverride('_method'));

// 静态文件服务中间件 (用于 public 目录下的 CSS, JS, 图片等)
app.use(express.static(path.join(__dirname, 'public')));

// 自定义中间件: 将用户信息和 flash 消息传递给所有视图
app.use(setLocals);

// --- 路由挂载 ---
// 根路径重定向逻辑
app.get('/', (req, res) => {
  if (req.session.user) {
    res.redirect('/notes'); // 如果用户已登录，重定向到记事列表
  } else {
    res.redirect('/auth/login'); // 否则，重定向到登录页面
  }
});

app.use('/auth', authRoutes);   // 挂载认证相关的路由 (例如 /auth/login, /auth/register)
app.use('/notes', noteRoutes);  // 挂载记事本相关的路由 (例如 /notes, /notes/new, /notes/:id)
app.use('/admin', adminRoutes); // 挂载管理员相关的路由 (例如 /admin/users)

// --- 错误处理中间件 ---
// 404 错误处理 (应在所有正常路由之后)
app.use((req, res, next) => {
  res.status(404).render('partials/404', { // 假设您有 views/partials/404.ejs
    pageTitle: '404 - 页面未找到',
    // currentUser: req.session.user // currentUser 已通过 setLocals 提供
  });
});

// 全局错误处理中间件 (必须有四个参数: err, req, res, next)
app.use((err, req, res, next) => {
  console.error("全局错误处理器捕获到错误:", err); // 在服务器控制台记录完整错误
  
  const statusCode = err.status || 500;
  const isDevelopment = process.env.NODE_ENV === 'development';

  res.status(statusCode).render('partials/error', { // 渲染 views/partials/error.ejs
    pageTitle: `错误 ${statusCode}`,
    error: {
      message: err.message || '服务器发生内部错误，请稍后再试。',
      status: statusCode,
      // 仅在开发环境中暴露堆栈信息
      stack: isDevelopment ? err.stack : undefined
    },
    // currentUser: req.session.user // currentUser 已通过 setLocals 提供
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`服务器已成功启动，正在监听端口 ${PORT}`);
  console.log(`请通过 http://localhost:${PORT} 访问`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`当前运行环境: ${process.env.NODE_ENV || 'development'}`);
    console.log("提示: 如果是首次运行且没有用户，第一个注册的用户将自动成为 'admin' 角色。");
  }
});
