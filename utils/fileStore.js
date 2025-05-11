import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRootDir = path.resolve(__dirname, '..');
const notesDir = path.join(projectRootDir, 'data', 'notes');
const uploadsBaseDir = path.join(projectRootDir, 'public', 'uploads'); // 基础上传目录
const noteAttachmentsBaseDir = path.join(uploadsBaseDir, 'attachments'); // 记事附件的基础目录

// 通用目录确保函数
async function ensureDir(dirPath) {
  try {
    await fs.access(dirPath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      await fs.mkdir(dirPath, { recursive: true });
      console.log(`Created directory: ${dirPath}`);
    } else {
      console.error(`Error accessing/creating directory ${dirPath}:`, error);
      throw error;
    }
  }
}

// 确保 notes 数据目录存在
export async function ensureNotesDataDir() {
  await ensureDir(notesDir);
}

// 确保 public/uploads 目录存在 (包含图片和附件的父目录)
export async function ensureUploadsDir() {
  await ensureDir(uploadsBaseDir);
  await ensureDir(noteAttachmentsBaseDir); // 同时确保附件的基础目录存在
}

// 确保特定记事的附件目录存在
export async function ensureAttachmentDirForNote(noteId) {
  const noteSpecificAttachmentDir = path.join(noteAttachmentsBaseDir, noteId);
  await ensureDir(noteSpecificAttachmentDir);
  return noteSpecificAttachmentDir; // 返回创建的目录路径
}


// 在模块加载时调用一次，以确保目录存在
ensureNotesDataDir().catch(err => console.error("Failed to ensure notes data directory on startup:", err));
ensureUploadsDir().catch(err => console.error("Failed to ensure uploads directory on startup:", err));


export async function getAllNotes(userId, userRole) {
  try {
    await ensureNotesDataDir();
    const files = await fs.readdir(notesDir);
    const notes = [];
    for (const file of files) {
      if (path.extname(file) === '.json') {
        const filePath = path.join(notesDir, file);
        const data = await fs.readFile(filePath, 'utf-8');
        const note = JSON.parse(data);
        if (userRole === 'admin' || note.userId === userId) {
            notes.push(note);
        }
      }
    }
    return notes;
  } catch (error) {
    // ... (保持原有错误处理)
    if (error.code === 'ENOENT') {
        console.warn('Notes directory not found while getAllNotes, returning empty array.');
        return [];
    }
    console.error('Error reading all notes:', error);
    throw error;
  }
}

export async function getNoteById(id, userId, userRole) {
  const filePath = path.join(notesDir, `${id}.json`);
  try {
    await ensureNotesDataDir();
    const data = await fs.readFile(filePath, 'utf-8');
    const note = JSON.parse(data);
    if (userRole === 'admin' || note.userId === userId) {
        return note;
    } else {
        return null;
    }
  } catch (error) {
    // ... (保持原有错误处理)
    if (error.code === 'ENOENT') {
      return null;
    }
    console.error(`Error reading note ${id}:`, error);
    throw error;
  }
}

export async function saveNote(noteData, userId) {
  await ensureNotesDataDir();
  const id = noteData.id || uuidv4();
  const isNewNote = !noteData.id;

  let existingAttachments = [];
  if (!isNewNote) {
    try {
        const currentNote = await getNoteById(id, userId, 'any'); // 'any' role to fetch for check, auth done in route
        if (currentNote) {
            existingAttachments = currentNote.attachments || [];
        }
    } catch(e) { /* ignore if not found, it's a new note effectively */ }
  }

  const note = {
    id: id,
    userId: isNewNote ? userId : noteData.userId,
    title: noteData.title,
    content: noteData.content || '',
    attachments: noteData.attachments ? noteData.attachments : existingAttachments, // 保留或更新附件信息
    createdAt: isNewNote ? new Date().toISOString() : noteData.createdAt,
    updatedAt: new Date().toISOString()
  };

  const filePath = path.join(notesDir, `${id}.json`);
  await fs.writeFile(filePath, JSON.stringify(note, null, 2), 'utf-8');
  return note;
}

export async function deleteNoteById(id, userId, userRole) {
  await ensureNotesDataDir();
  const filePath = path.join(notesDir, `${id}.json`);
  try {
    const noteData = await fs.readFile(filePath, 'utf-8');
    const note = JSON.parse(noteData);

    if (userRole !== 'admin' && note.userId !== userId) {
        return false;
    }

    await fs.unlink(filePath);

    // 删除关联的附件目录
    const noteSpecificAttachmentDir = path.join(noteAttachmentsBaseDir, id);
    try {
        await fs.access(noteSpecificAttachmentDir); // 检查目录是否存在
        await fs.rm(noteSpecificAttachmentDir, { recursive: true, force: true }); // force: true (Node.js 14.14+)
        console.log(`Deleted attachment directory: ${noteSpecificAttachmentDir}`);
    } catch (dirError) {
        if (dirError.code !== 'ENOENT') { // 如果不是“目录不存在”的错误，则记录
            console.error(`Error deleting attachment directory ${noteSpecificAttachmentDir}:`, dirError);
        }
    }
    return true;
  } catch (error) {
    // ... (保持原有错误处理)
    if (error.code === 'ENOENT') {
      return false;
    }
    console.error(`Error deleting note ${id}:`, error);
    throw error;
  }
}

// 新增：向记事添加附件元数据
export async function addAttachmentMetadataToNote(noteId, attachmentFile, userId, userRole) {
    const note = await getNoteById(noteId, userId, userRole);
    if (!note) {
        throw new Error('记事未找到或无权修改');
    }

    if (note.userId !== userId && userRole !== 'admin') {
        throw new Error('无权向此记事添加附件');
    }

    const newAttachment = {
        filename: attachmentFile.filename, // multer 生成的文件名
        originalname: attachmentFile.originalname,
        mimetype: attachmentFile.mimetype,
        size: attachmentFile.size,
        // 路径相对于 public 目录，以便于前端访问
        path: `/uploads/attachments/${noteId}/${attachmentFile.filename}`
    };

    if (!note.attachments) {
        note.attachments = [];
    }
    note.attachments.push(newAttachment);
    return await saveNote(note, note.userId); // 用笔记的原始userId保存
}

// 新增：从记事移除附件元数据并删除文件
export async function removeAttachmentFromNote(noteId, attachmentFilename, userId, userRole) {
    const note = await getNoteById(noteId, userId, userRole);
    if (!note) {
        throw new Error('记事未找到或无权修改');
    }
    if (note.userId !== userId && userRole !== 'admin') {
        throw new Error('无权删除此记事的附件');
    }

    if (!note.attachments) {
        return note; // 没有附件可删除
    }

    const attachmentToRemove = note.attachments.find(att => att.filename === attachmentFilename);
    if (!attachmentToRemove) {
        throw new Error('附件未找到');
    }

    // 从 note.attachments 数组中移除
    note.attachments = note.attachments.filter(att => att.filename !== attachmentFilename);

    // 更新记事 (保存更改后的 attachments 数组)
    const updatedNote = await saveNote(note, note.userId);

    // 从文件系统删除附件文件
    const filePathOnServer = path.join(projectRootDir, 'public', attachmentToRemove.path);
    try {
        await fs.unlink(filePathOnServer);
        console.log(`Deleted attachment file: ${filePathOnServer}`);
    } catch (fileError) {
        console.error(`Error deleting attachment file ${filePathOnServer}:`, fileError);
        // 即使文件删除失败，元数据也已移除，这里可以根据需要决定是否抛出错误
    }
    return updatedNote;
}
