import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises'; // 需要 fs.promises 进行目录检查/创建
import {
  getAllNotes,
  getNoteById,
  saveNote,
  deleteNoteById,
  addAttachmentMetadataToNote, // 新增
  removeAttachmentFromNote,    // 新增
  ensureAttachmentDirForNote   // 新增
} from '../utils/fileStore.js';
import { isAuthenticated } from '../middleware/authMiddleware.js';

const router = express.Router();

// --- Multer 配置 ---
// 1. Quill 图片上传 (已存在)
const imageStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    // 确保 public/uploads 存在 (fileStore.js 已处理，此处可省略)
    cb(null, 'public/uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, `image-${Date.now()}${path.extname(file.originalname)}`);
  }
});
const uploadImage = multer({
  storage: imageStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: function (req, file, cb) {
    const filetypes = /jpeg|jpg|png|gif|webp/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('错误: 只允许上传图片! (jpeg, jpg, png, gif, webp)'));
    }
  }
});

// 2. 记事附件上传 (新增)
const attachmentStorage = multer.diskStorage({
  destination: async function (req, file, cb) {
    const noteId = req.params.noteId;
    if (!noteId) {
        return cb(new Error("缺少记事ID，无法上传附件。"));
    }
    try {
      // 此处调用 ensureAttachmentDirForNote 来确保目录存在并获取路径
      const destinationPath = await ensureAttachmentDirForNote(noteId);
      cb(null, destinationPath);
    } catch (error) {
      console.error(`创建附件目录失败 for note ${noteId}:`, error);
      cb(error);
    }
  },
  filename: function (req, file, cb) {
    // 保留原始文件名，但进行清理或加上时间戳避免冲突
    // 为简单起见，这里使用原始文件名，但实际应用中可能需要更复杂的处理
    // cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`);
    cb(null, file.originalname); // 注意：如果文件名包含特殊字符或已存在，可能会有问题
  }
});
const uploadAttachments = multer({
  storage: attachmentStorage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 附件大小限制，例如25MB
  // 可以添加 fileFilter 验证允许的附件类型
  fileFilter: function(req, file, cb) {
    // 示例：允许所有文件，或特定类型
    // if (file.mimetype === 'application/pdf' || file.mimetype === 'application/msword') {
    //   return cb(null, true);
    // }
    // cb(new Error('不支持的文件类型'));
    return cb(null, true); // 当前允许所有类型
  }
});


// 应用认证中间件于所有 /notes 路由
router.use(isAuthenticated);

// --- 原有记事路由 (保持不变或稍作调整以适应附件信息) ---
// GET /notes - 显示所有记事 (主页)
router.get('/', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const userRole = req.session.user.role;
    let notes = await getAllNotes(userId, userRole);
    const { sortBy = 'updatedAt', order = 'desc', title = '' } = req.query;

    if (title) {
        notes = notes.filter(note => note.title && note.title.toLowerCase().includes(title.toLowerCase()));
    }
    // ... 排序逻辑 (保持不变) ...
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
    res.render('index', { notes, currentSort: { sortBy, order }, currentTitle: title, pageTitle: '我的记事' });
  } catch (err) {
    next(err);
  }
});

// GET /notes/new - 显示新建记事的表单
router.get('/new', (req, res) => {
  // 对于新记事，通常先保存记事本身，获得ID后才能上传附件。
  // 或者，UI可以设计为先上传附件到临时区，然后在保存记事时关联。
  // 这里我们简化，附件只能在编辑现有记事时添加。
  res.render('new', { note: { title: '', content: '', attachments: [] }, error: null, pageTitle: '创建新记事' });
});


// POST /notes - 创建新记事
router.post('/', async (req, res, next) => {
  const { title, content } = req.body;
  const userId = req.session.user.id;

  if (!title || title.trim() === '') {
    return res.render('new', {
        note: { title, content, attachments: [] }, // 确保 attachments 存在
        error: '标题是必填项。',
        pageTitle: '创建新记事'
    });
  }
  try {
    // 新记事还没有附件，所以传递一个空的 attachments 数组或让 saveNote 处理
    const newNote = await saveNote({ title, content, attachments: [] }, userId);
    req.session.message = '记事创建成功！现在您可以添加附件了。';
    // 重定向到编辑页面，以便用户可以添加附件
    res.redirect(`/notes/${newNote.id}/edit`);
  } catch (err) {
     res.render('new', { note: { title, content, attachments: [] }, error: '创建记事失败，请稍后再试。', pageTitle: '创建新记事' });
  }
});

// GET /notes/:id/edit - 显示编辑记事的表单 (需要显示附件)
router.get('/:id/edit', async (req, res, next) => {
  try {
    const noteId = req.params.id;
    const userId = req.session.user.id;
    const userRole = req.session.user.role;
    const note = await getNoteById(noteId, userId, userRole);

    if (!note) {
      req.session.error = '记事未找到或您无权访问。';
      return res.status(404).redirect('/notes');
    }
    if (note.userId !== userId && userRole !== 'admin') {
        req.session.error = '您无权编辑此记事。';
        return res.status(403).redirect('/notes');
    }
    res.render('edit', { note, error: null, pageTitle: `编辑: ${note.title}` });
  } catch (err) {
    next(err);
  }
});

// PUT /notes/:id - 更新记事 (可能包含附件信息，但不处理文件上传)
router.put('/:id', async (req, res, next) => {
  const { title, content } = req.body; // 附件通常通过单独的路由处理
  const noteId = req.params.id;
  const userId = req.session.user.id;
  const userRole = req.session.user.role;

  // ... (标题验证等保持不变) ...
  if (!title || title.trim() === '') {
    const originalNote = await getNoteById(noteId, userId, userRole);
    return res.render('edit', {
        note: { ...originalNote, title, content },
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
    if (existingNote.userId !== userId && userRole !== 'admin') {
        req.session.error = '您无权编辑此记事。';
        return res.status(403).redirect('/notes');
    }
    // 更新时，附件信息由专门的附件路由管理，这里只更新 title 和 content
    // existingNote.attachments 会被 saveNote 保留
    await saveNote({
        id: noteId,
        title,
        content,
        userId: existingNote.userId, // 保持原userId
        createdAt: existingNote.createdAt,
        attachments: existingNote.attachments // 确保附件信息被传递并保留
    }, userId); // 执行操作的用户

    req.session.message = '记事更新成功！';
    res.redirect(`/notes/${noteId}`); // 或者 res.redirect('/notes');
  } catch (err) {
    // ... (错误处理保持不变) ...
    const noteForEdit = await getNoteById(noteId, userId, userRole) || {id: noteId, title:'', content:'', attachments: []};
    res.render('edit', { note: {...noteForEdit, title, content }, error: '更新记事失败，请稍后再试。', pageTitle: `编辑: ${noteForEdit.title}` });
  }
});


// GET /notes/:id - 显示单个记事 (需要显示附件)
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

// DELETE /notes/:id - 删除记事 (fileStore 已处理附件目录删除)
router.delete('/:id', async (req, res, next) => {
  try {
    const noteId = req.params.id;
    const userId = req.session.user.id;
    const userRole = req.session.user.role;

    const noteToDelete = await getNoteById(noteId, userId, userRole); // 先获取检查权限
    if (!noteToDelete) {
        req.session.error = '记事未找到或您无权删除。';
        return res.status(404).redirect('/notes');
    }
    if (noteToDelete.userId !== userId && userRole !== 'admin') {
        req.session.error = '您无权删除此记事。';
        return res.status(403).redirect('/notes');
    }
    const success = await deleteNoteById(noteId, userId, userRole);
    if (!success) {
      req.session.error = '删除记事失败。'; // 更具体的错误信息已在 fileStore 中处理
      return res.status(404).redirect('/notes');
    }
    req.session.message = '记事删除成功！';
    res.redirect('/notes');
  } catch (err) {
    next(err);
  }
});


// --- 附件管理路由 ---
// POST /notes/:noteId/attachments - 上传附件
router.post('/:noteId/attachments', uploadAttachments.array('noteAttachments', 5), async (req, res, next) => {
    // uploadAttachments.array('noteAttachments', 5) 表示字段名为 noteAttachments，最多上传5个文件
    const noteId = req.params.noteId;
    const userId = req.session.user.id;
    const userRole = req.session.user.role;

    try {
        const note = await getNoteById(noteId, userId, userRole);
        if (!note) {
            req.session.error = '记事未找到或无权操作。';
            return res.status(404).redirect(`/notes/${noteId}/edit`); // 或 notes 列表
        }
        if (note.userId !== userId && userRole !== 'admin') {
            req.session.error = '您无权向此记事添加附件。';
            return res.status(403).redirect(`/notes/${noteId}/edit`);
        }

        if (!req.files || req.files.length === 0) {
            req.session.error = '未选择任何附件文件。';
            return res.redirect(`/notes/${noteId}/edit`);
        }

        for (const file of req.files) {
            await addAttachmentMetadataToNote(noteId, file, userId, userRole);
        }
        req.session.message = '附件上传成功！';
        res.redirect(`/notes/${noteId}/edit`);
    } catch (error) {
        console.error("附件上传错误:", error);
        req.session.error = `附件上传失败: ${error.message}`;
        res.redirect(`/notes/${noteId}/edit`);
    }
});

// DELETE /notes/:noteId/attachments/:attachmentFilename - 删除特定附件
router.delete('/:noteId/attachments/:attachmentFilename', async (req, res, next) => {
    const { noteId, attachmentFilename } = req.params;
    const userId = req.session.user.id;
    const userRole = req.session.user.role;

    try {
        // 权限检查在 removeAttachmentFromNote 内部进行
        await removeAttachmentFromNote(noteId, attachmentFilename, userId, userRole);
        req.session.message = '附件删除成功！';
        res.redirect(`/notes/${noteId}/edit`);
    } catch (error) {
        console.error("删除附件错误:", error);
        req.session.error = `删除附件失败: ${error.message}`;
        res.redirect(`/notes/${noteId}/edit`);
    }
});


// --- Quill 图片上传 API (保持认证) ---
router.post('/upload/image', uploadImage.single('imageFile'), (req, res) => {
    // isAuthenticated 已经在此路由器的顶层应用
    // uploadImage.single('imageFile') 中间件处理后，如果成功 req.file 会被设置
    if (!req.file) {
        return res.status(400).json({ error: '图片上传失败，未找到文件或文件类型不支持。' });
    }
    const imageUrl = `/uploads/${req.file.filename}`; // 相对于 public
    res.status(200).json({ imageUrl: imageUrl });
});

export default router;
