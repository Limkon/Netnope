import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRootDir = path.resolve(__dirname, '..');
const usersFilePath = path.join(projectRootDir, 'data', 'users.json');

async function readUsers() {
    try {
        await fs.access(usersFilePath);
        const data = await fs.readFile(usersFilePath, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') { // 文件不存在，返回空数组
            return [];
        }
        console.error('Error reading users file:', error);
        throw error;
    }
}

async function writeUsers(users) {
    try {
        await fs.writeFile(usersFilePath, JSON.stringify(users, null, 2), 'utf-8');
    } catch (error) {
        console.error('Error writing users file:', error);
        throw error;
    }
}

export async function getAllUsers() {
    return await readUsers();
}

export async function findUserByUsername(username) {
    const users = await readUsers();
    return users.find(user => user.username === username);
}

export async function findUserById(id) {
    const users = await readUsers();
    return users.find(user => user.id === id);
}

export async function createUser(username, password) {
    const users = await readUsers();
    if (await findUserByUsername(username)) {
        throw new Error('用户名已存在');
    }

    const hashedPassword = await bcrypt.hash(password, 10); // 哈希密码
    const newUser = {
        id: uuidv4(),
        username,
        passwordHash: hashedPassword,
        role: users.length === 0 ? 'admin' : 'user', // 第一个注册的用户默认为 admin
        createdAt: new Date().toISOString()
    };
    users.push(newUser);
    await writeUsers(users);
    return newUser;
}

export async function verifyPassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
}

export async function deleteUserById(id) {
    let users = await readUsers();
    const userToDelete = users.find(user => user.id === id);
    if (!userToDelete) {
        return false; // 用户未找到
    }
    // 通常不应允许 admin 删除自己或其他 admin，除非有特定逻辑
    // 此处简化，允许 admin 删除其他非 admin 用户
    if (userToDelete.role === 'admin') {
        // 也可以改成只有特定主 admin 能删除其他 admin
        console.warn(`Attempt to delete admin user ${userToDelete.username} blocked or needs special handling.`);
        // return false; // 阻止删除管理员，或者你可以添加更复杂的逻辑
    }

    users = users.filter(user => user.id !== id);
    await writeUsers(users);
    return true;
}

// 确保 data 目录存在 (可选，如果 server.js 或 fileStore.js 已处理)
async function ensureDataDir() {
  try {
    await fs.access(path.join(projectRootDir, 'data'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      await fs.mkdir(path.join(projectRootDir, 'data'), { recursive: true });
      console.log(`Created directory: ${path.join(projectRootDir, 'data')}`);
    } else {
      console.error('Error accessing data directory:', error);
      throw error;
    }
  }
}
ensureDataDir().catch(err => console.error("Failed to ensure data directory on startup:", err));
