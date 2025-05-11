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
// 确保这些函数在 fileStore.js 中已正确导出并且能够处理目录创建
import { ensureUploadsDir, ensureNotesDataDir } from './utils/fileStore.js';
// 从 authMiddleware.js 导入 setLocals 中间件
import { setLocals } from './middleware/authMiddleware.js';

// 配置 dotenv，加载 .env 文件中的环境变量
dotenv.config();

// ES Modules 中获取 __filename 和 __dirname 的方法
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 初始化 Express 应用
const app = express();
const PORT = process.env.PORT || 8100;

// 启动时确保必要的目录存在
// fileStore.js 和 userStore.js 内部也可能有自己的目录检查逻辑，确保它们不会冲突并能正确执行
// 这些函数应该是异步的，如果它们在模块加载时执行，请确保应用在它们完成后再处理请求
// 或者，如果它们是同步的，或者只在需要时创建目录，则此处的调用可能不是必须的，
// 取决于您在 fileStore.js 中的实现。
// 为了安全起见，确保这些目录创建逻辑在服务器启动时或者首次需要时被触发。
// 我们假设 fileStore.js 已经处理了这些。
// ensureUploadsDir().catch(err => console.error("启动时确保上传目录失败:", err));
// ensureNotesDataDir().catch(err => console.error("启动时确保笔记数据目录失败:", err));


// --- 中间件设置 ---

// EJS 视图引擎设置
app.set('view engine', 'ejs');
// 设置视图文件的查找目录为项目根目录下的 "views" 文件夹
app.set('views', path.join(__dirname, 'views'));

// Express 内置中间件
app.use(express.urlencoded({ extended: true })); // 解析 URL-encoded 请求体 (例如来自HTML表单)
app.use(express.json());                         // 解析 JSON 请求体

// method-override 中间件，用于支持 PUT 和 DELETE 等HTTP方法 (通过 _method 查询参数)
app.use(methodOverride('_method'));

// 静态文件服务中间件 (用于 public 目录下的 CSS, JS, 图片等)
// 确保此路径正确，它使得 public 目录成为静态资源的根目录
app.use(express.static(path.join(__dirname, 'public')));

// Session 配置 (应该在访问 session 的路由和中间件之前)
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

// 自定义中间件: 将用户信息和 flash 消息传递给所有视图
// 此中间件应在 session 初始化之后，路由处理之前
app.use(setLocals);


// --- 路由挂载 ---
// 根路径重定向逻辑
app.get('/', (req, res) => {
  if (req.session.user) {
    res.redirect('/notes');
  } else {
    res.redirect('/auth/login');
  }
});

app.use('/auth', authRoutes);
app.use('/notes', noteRoutes);
app.use('/admin', adminRoutes);


// --- 错误处理中间件 ---
// 404 错误处理 (应在所有正常路由之后)
app.use((req, res, next) => {
  // 从 res.locals 获取 currentUser，而不是 req.session.user，因为 setLocals 可能已经处理
  res.status(404).render('partials/404', {
    pageTitle: '404 - 页面未找到',
    // currentUser: res.locals.currentUser // 如果 setLocals 已正确设置，模板中可直接用 currentUser
  });
});

// 全局错误处理中间件 (必须有四个参数: err, req, res, next)
app.use((err, req, res, next) => {
  console.error("全局错误处理器捕获到错误:", err);
  
  const statusCode = err.status || 500;
  const isDevelopment = process.env.NODE_ENV === 'development';

  // 尝试渲染错误页面
  // 如果错误本身就是视图查找错误，渲染另一个简单的错误页面可能会失败
  // 在这种情况下，可能需要一个非常基础的HTML错误响应
  if (err.view && err.message.includes('Failed to lookup view')) {
      // 如果是视图查找错误，返回一个纯文本或简单HTML错误，避免再次尝试渲染不存在的视图
      console.error("渲染错误页面时发生视图查找错误:", err.message);
      return res.status(500).send(`服务器内部错误：无法加载错误页面模板。详情: ${err.message}`);
  }

  res.status(statusCode).render('partials/error', {
    pageTitle: `错误 ${statusCode}`,
    error: {
      message: err.message || '服务器发生内部错误，请稍后再试。',
      status: statusCode,
      stack: isDevelopment ? err.stack : undefined
    },
    // currentUser: res.locals.currentUser // 如果 setLocals 已正确设置，模板中可直接用 currentUser
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
