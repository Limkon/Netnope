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
// fileStore.js 中的目录确保函数建议在其模块内部初始化时处理
// 例如: import './utils/fileStore.js'; // 如果它在加载时执行目录检查
// 或者在需要时由具体函数调用

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 5. method-override 中间件
app.use(methodOverride('_method'));

// 6. Session 配置
if (!process.env.SESSION_SECRET) {
  console.error('错误：SESSION_SECRET 未在 .env 文件中定义！应用无法安全启动。');
  process.exit(1);
}
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// 7. 自定义中间件: 将用户信息和 flash 消息传递给所有视图
app.use(setLocals);


// --- 应用路由 ---
app.get('/', (req, res) => {
  if (res.locals.currentUser) {
    res.redirect('/notes');
  } else {
    res.redirect('/auth/login');
  }
});

app.use('/auth', authRoutes);
app.use('/notes', noteRoutes); // 确保 noteRoutes 内部的 res.render() 使用正确的视图名称
app.use('/admin', adminRoutes);


// --- 错误处理路由 ---
app.use((req, res, next) => {
  console.warn(`404 - 未找到路由: ${req.method} ${req.originalUrl}`);
  res.status(404).render('partials/404', { // 确保 views/partials/404.ejs 存在
    pageTitle: '404 - 页面未找到'
  });
});

app.use((err, req, res, next) => {
  console.error("全局错误处理器:", err);
  const statusCode = err.status || 500;
  const isDevelopment = process.env.NODE_ENV === 'development';
  const errMessage = err.message || '服务器发生内部错误。';

  if (err.view && err.message && err.message.includes('Failed to lookup view')) {
      const specificViewError = `服务器错误：无法加载页面模板。请求的视图 '${err.view.name}' 在目录 '${err.view.root}' 中未找到。请检查服务器日志和视图文件路径。`;
      console.error(specificViewError); // 明确记录是哪个视图找不到了
      return res.status(500).send(isDevelopment ? `${specificViewError}\n\n${err.stack}` : specificViewError);
  }

  res.status(statusCode).render('partials/error', { // 确保 views/partials/error.ejs 存在
    pageTitle: `错误 ${statusCode}`,
    error: {
      message: errMessage,
      status: statusCode,
      stack: isDevelopment ? err.stack : undefined
    }
  });
});

app.listen(PORT, () => {
  console.log(`服务器运行于 http://localhost:${PORT}`);
});
