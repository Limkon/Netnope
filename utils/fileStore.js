import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRootDir = path.resolve(__dirname, '..');
const notesDir = path.join(projectRootDir, 'data', 'notes');
const uploadsDir = path.join(projectRootDir, 'public', 'uploads');

// 确保 notes 目录存在
export async function ensureNotesDataDir() { // 改名以更清晰
  try {
    await fs.access(notesDir);
  } catch (error) {
    if (error.code === 'ENOENT') {
      await fs.mkdir(notesDir, { recursive: true });
      console.log(`Created directory: ${notesDir}`);
    } else {
      console.error('Error accessing notes directory:', error);
      throw error;
    }
  }
}

export async function ensureUploadsDir() {
  try {
    await fs.access(uploadsDir);
  } catch (error) {
    if (error.code === 'ENOENT') {
      await fs.mkdir(uploadsDir, { recursive: true });
      console.log(`Created directory: ${uploadsDir}`);
    } else {
      console.error('Error accessing uploads directory:', error);
      throw error;
    }
  }
}

ensureNotesDataDir().catch(err => console.error("Failed to ensure notes directory on startup:", err));

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
        // 如果是管理员，返回所有笔记
        // 如果是普通用户，只返回他们自己的笔记
        if (userRole === 'admin' || note.userId === userId) {
            notes.push(note);
        }
      }
    }
    return notes;
  } catch (error) {
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

    // 权限检查
    if (userRole === 'admin' || note.userId === userId) {
        return note;
    } else {
        return null; // 用户无权访问此笔记
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    console.error(`Error reading note ${id}:`, error);
    throw error;
  }
}

// 保存笔记时需要传入 userId
export async function saveNote(noteData, userId) {
  await ensureNotesDataDir();
  const id = noteData.id || uuidv4();
  const isNewNote = !noteData.id;

  const note = {
    id: id,
    userId: noteData.id ? noteData.userId : userId, // 如果是更新，保留原userId；如果是新建，使用当前用户ID
    title: noteData.title,
    content: noteData.content || '',
    createdAt: isNewNote ? new Date().toISOString() : noteData.createdAt,
    updatedAt: new Date().toISOString()
  };

  // 安全检查：确保用户在编辑笔记时，该笔记确实属于他们 (除非是管理员)
  // 这一层检查也可以放在路由处理器中
  if (!isNewNote && noteData.userId !== userId && (typeof req !== 'undefined' && req.session.user.role !== 'admin') ) { // 假设可以访问到 req
      // throw new Error('Unauthorized attempt to save note for another user.');
      // 或者直接返回 null/false，让路由处理器处理
      console.warn(`User ${userId} attempted to save note ${id} belonging to ${noteData.userId}`);
      // return null; // 应该由路由处理权限
  }


  const filePath = path.join(notesDir, `${id}.json`);
  await fs.writeFile(filePath, JSON.stringify(note, null, 2), 'utf-8');
  return note;
}

// 删除笔记时也需要权限检查
export async function deleteNoteById(id, userId, userRole) {
  await ensureNotesDataDir();
  const filePath = path.join(notesDir, `${id}.json`);
  try {
    // 在删除前先读取笔记，检查所有权
    const noteData = await fs.readFile(filePath, 'utf-8');
    const note = JSON.parse(noteData);

    if (userRole !== 'admin' && note.userId !== userId) {
        return false; // 无权删除
    }

    await fs.unlink(filePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }
    console.error(`Error deleting note ${id}:`, error);
    throw error;
  }
}
