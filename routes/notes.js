import express from 'express';
import multer from 'multer';
import path from 'path';
import {
  getAllNotes,
  getNoteById,
  saveNote,
  deleteNoteById
} from '../utils/fileStore.js';
import { isAuthenticated } from '../middleware/authMiddleware.js'; // 引入认证中间件

const router = express.Router();

// Multer 配置 (保持不变)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    checkFileType(file, cb);
  }
});
function checkFileType(file, cb) {
  const filetypes = /jpeg|jpg|png|gif|webp/;
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = filetypes.test(file.mimetype);
  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('错误: 只允许上传图片! (jpeg, jpg, png, gif, webp)'));
  }
}

// --- HTML 渲染路由 ---
// 所有 /notes 路由都需要认证
router.use(isAuthenticated); // 应用于此路由器下的所有路由

// GET /notes - 显示所有记事 (主页)
router.get('/', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const userRole = req.session.user.role;
    let notes = await getAllNotes(userId, userRole); // 传递 userId 和 role
    const { sortBy = 'updatedAt', order = 'desc', title = '' } = req.query;

    if (title) {
        notes = notes.filter(note => note.title && note.title.toLowerCase().includes(title.toLowerCase()));
    }

    notes.sort((a, b) => {
      let valA = a[sortBy];
      let valB = b[sortBy];
      if (sortBy === 'createdAt' || sortBy === 'updatedAt') {
        valA = new Date(valA);
        valB = new Date(valB);
      } else if (typeof valA === 'string' && typeof valB === 'string') {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      } else if (valA === undefined || valA === null) valA = '';
      else if (valB === undefined || valB === null) valB = '';

      if (valA < valB) return order === 'asc' ? -1 : 1;
      if (valA > valB) return order === 'asc' ? 1 : -1;
      return 0;
    });
    // 确保你的 index.ejs 文件能正确处理 pageTitle 和 currentUser (已通过 setLocals 中间件提供)
    res.render('index', { notes, currentSort: { sortBy, order }, currentTitle: title, pageTitle: '我的记事' });
  } catch (err) {
    next(err);
  }
});

// GET /notes/new - 显示新建记事的表单
router.get('/new', (req, res) => {
  res.render('new', { note: { title: '', content: '' }, error: null, pageTitle: '创建新记事' });
});

// GET /notes/:id/edit - 显示编辑记事的表单
router.get('/:id/edit', async (req, res, next) => {
  try {
    const noteId = req.params.id;
    const userId = req.session.user.id;
    const userRole = req.session.user.role;
    const note = await getNoteById(noteId, userId, userRole);

    if (!note) {
      req.session.error = '记事未找到或您无权访问。';
      return res.status(404).redirect('/notes');
      // return res.status(404).render('partials/404', { pageTitle: '404 Not Found' });
    }
    // 确保只有笔记所有者或管理员可以编辑
    if (note.userId !== userId && userRole !== 'admin') {
        req.session.error = '您无权编辑此记事。';
        return res.status(403).redirect('/notes');
    }
    res.render('edit', { note, error: null, pageTitle: `编辑: ${note.title}` });
  } catch (err) {
    next(err);
  }
});

// GET /notes/:id - 显示单个记事
router.get('/:id', async (req, res, next) => {
  try {
    const noteId = req.params.id;
    const userId = req.session.user.id;
    const userRole = req.session.user.role;
    const note = await getNoteById(noteId, userId, userRole);

    if (!note) {
      req.session.error = '记事未找到或您无权访问。';
      return res.status(404).redirect('/notes');
    }
    res.render('show', { note, pageTitle: note.title });
  } catch (err) {
    next(err);
  }
});

// --- API 操作路由 ---

// POST /notes - 创建新记事
router.post('/', async (req, res, next) => {
  const { title, content } = req.body;
  const userId = req.session.user.id; // 获取当前登录用户的ID

  if (!title || title.trim() === '') {
    return res.render('new', {
        note: { title, content },
        error: '标题是必填项。',
        pageTitle: '创建新记事'
    });
  }
  try {
    await saveNote({ title, content }, userId); // 传递 userId
    req.session.message = '记事创建成功！';
    res.redirect('/notes');
  } catch (err) {
     res.render('new', { note: { title, content }, error: '创建记事失败，请稍后再试。', pageTitle: '创建新记事' });
  }
});

// PUT /notes/:id - 更新记事
router.put('/:id', async (req, res, next) => {
  const { title, content } = req.body;
  const noteId = req.params.id;
  const userId = req.session.user.id;
  const userRole = req.session.user.role;

  if (!title || title.trim() === '') {
    const originalNote = await getNoteById(noteId, userId, userRole);
    return res.render('edit', {
        note: { ...originalNote, title, content }, // 使用用户提交的 title 和 content 预填充
        error: '标题是必填项。',
        pageTitle: `编辑: ${originalNote ? originalNote.title : '记事'}`
    });
  }
  try {
    const existingNote = await getNoteById(noteId, userId, userRole);
    if (!existingNote) {
      req.session.error = '记事未找到或您无权编辑。';
      return res.status(404).redirect('/notes');
    }
    // 确保是笔记所有者或管理员
    if (existingNote.userId !== userId && userRole !== 'admin') {
        req.session.error = '您无权编辑此记事。';
        return res.status(403).redirect('/notes');
    }
    // 传递 existingNote.userId 以保留原始创建者，或者如果允许转移所有权则另行处理
    await saveNote({ id: noteId, title, content, createdAt: existingNote.createdAt, userId: existingNote.userId }, userId); // 最后一个 userId 是执行操作的用户
    req.session.message = '记事更新成功！';
    res.redirect('/notes');
  } catch (err) {
    const noteForEdit = await getNoteById(noteId, userId, userRole) || {id: noteId, title:'', content:''};
    res.render('edit', { note: {...noteForEdit, title, content }, error: '更新记事失败，请稍后再试。', pageTitle: `编辑: ${noteForEdit.title}` });
  }
});

// DELETE /notes/:id - 删除记事
router.delete('/:id', async (req, res, next) => {
  try {
    const noteId = req.params.id;
    const userId = req.session.user.id;
    const userRole = req.session.user.role;

    const noteToDelete = await getNoteById(noteId, userId, userRole);
    if (!noteToDelete) {
        req.session.error = '记事未找到或您无权删除。';
        return res.status(404).redirect('/notes');
    }
    if (noteToDelete.userId !== userId && userRole !== 'admin') {
        req.session.error = '您无权删除此记事。';
        return res.status(403).redirect('/notes');
    }

    const success = await deleteNoteById(noteId, userId, userRole); // 传递 userId 和 role
    if (!success) {
      req.session.error = '删除记事失败或您无权操作。';
      return res.status(404).redirect('/notes');
    }
    req.session.message = '记事删除成功！';
    res.redirect('/notes');
  } catch (err) {
    next(err);
  }
});

// POST /notes/upload/image - 图片上传 API (保持认证)
router.post('/upload/image', (req, res) => { // isAuthenticated 已经在此路由器的顶层应用
    upload.single('imageFile')(req, res, function (err) {
        if (err instanceof multer.MulterError) {
            console.error('Multer error:', err.message);
            return res.status(400).json({ error: `文件上传错误: ${err.message}` });
        } else if (err) {
            console.error('File filter error or other:', err.message);
            return res.status(400).json({ error: err.message });
        }
        if (!req.file) {
            return res.status(400).json({ error: '未选择任何文件或文件类型不受支持。' });
        }
        const imageUrl = `/uploads/${req.file.filename}`;
        res.status(200).json({ imageUrl: imageUrl });
    });
});

export default router;
