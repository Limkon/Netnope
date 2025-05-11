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

// 中间件和工具函数导入
import { setLocals } from './middleware/authMiddleware.js';
// fileStore.js 中的目录确保函数通常在模块加载时自行调用，或者由 server.js 更早调用。
// 确保这些函数（如 ensureUploadsDir, ensureNotesDataDir）在 fileStore.js 中被正确调用或导出后在此处调用。
// 为了减少 server.js 的复杂性，建议这些目录检查逻辑主要在各自的模块（如 fileStore.js）初始化时处理。
// import { ensureUploadsDir, ensureNotesDataDir } from './utils/fileStore.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename); // 这是 server.js 文件所在的目录

const app = express();
const PORT = process.env.PORT || 8100;

// --- 核心中间件设置 ---

// 1. 设置视图引擎为 EJS
app.set('view engine', 'ejs');
// 2. 设置视图文件的查找目录 (例如 /home/std/views)
app.set('views', path.join(__dirname, 'views'));

// 3. 静态文件服务中间件 (非常重要，应尽早注册)
// 将 /home/std/public 目录下的内容作为静态资源提供
// 例如，浏览器请求 /css/style.css 将会从 /home/std/public/css/style.css 获取
app.use(express.static(path.join(__dirname, 'public')));

// 4. 解析请求体的中间件
app.use(express.urlencoded({ extended: true })); // 解析 x-www-form-urlencoded 数据
app.use(express.json());                         // 解析 application/json 数据

// 5. method-override 中间件，用于支持 PUT 和 DELETE 等HTTP方法
app.use(methodOverride('_method'));

// 6. Session 配置 (必须在需要 session 的路由和中间件之前)
if (!process.env.SESSION_SECRET) {
  console.error('错误：SESSION_SECRET 未在 .env 文件中定义！应用无法安全启动。');
  process.exit(1); // 关键安全配置缺失，退出
}
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false, // 对登录会话通常设为 false
  cookie: {
    secure: process.env.NODE_ENV === 'production', // 生产环境应为 true (HTTPS)
    httpOnly: true, // 增强安全性，防止客户端 JS 访问 cookie
    maxAge: 24 * 60 * 60 * 1000 // cookie 有效期: 24 小时
  }
}));

// 7. 自定义中间件: 将用户信息和 flash 消息传递给所有视图
// 必须在 session 初始化之后，路由处理之前
app.use(setLocals);


// --- 应用路由 ---
// 根路径重定向
app.get('/', (req, res) => {
  if (res.locals.currentUser) { // 使用 res.locals.currentUser (由 setLocals 设置)
    res.redirect('/notes');
  } else {
    res.redirect('/auth/login');
  }
});

app.use('/auth', authRoutes);
app.use('/notes', noteRoutes);
app.use('/admin', adminRoutes);


// --- 错误处理路由 (必须在所有正常路由之后) ---
// 404 错误处理
app.use((req, res, next) => {
  console.warn(`404 - 未找到路由: ${req.method} ${req.originalUrl}`);
  res.status(404).render('partials/404', { // 确保 views/partials/404.ejs 存在
    pageTitle: '404 - 页面未找到'
    // currentUser 已经通过 res.locals.currentUser 在模板中可用
  });
});

// 全局错误处理中间件 (必须有四个参数: err, req, res, next)
app.use((err, req, res, next) => {
  console.error("全局错误处理器捕获到错误:", err); // 在服务器控制台记录完整错误

  const statusCode = err.status || 500;
  const isDevelopment = process.env.NODE_ENV === 'development';
  const errMessage = err.message || '服务器发生内部错误，请稍后再试。';

  // 如果错误是由于视图查找失败，提供更明确的反馈
  if (err.view && err.message && err.message.includes('Failed to lookup view')) {
      console.error(`视图查找错误: 无法在 ${err.view.root} 中找到视图 ${err.view.name}`);
      const specificViewError = `服务器内部错误：无法加载页面模板。请求的视图 '${err.view.name}' 在目录 '${err.view.root}' 中未找到。请检查服务器日志和视图文件路径。`;
      return res.status(500).send(isDevelopment ? `${specificViewError}\n\n${err.stack}` : specificViewError);
  }

  // 尝试渲染 views/partials/error.ejs
  res.status(statusCode).render('partials/error', {
    pageTitle: `错误 ${statusCode}`,
    error: {
      message: errMessage,
      status: statusCode,
      stack: isDevelopment ? err.stack : undefined // 仅在开发模式显示堆栈
    }
    // currentUser 已经通过 res.locals.currentUser 在模板中可用
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
