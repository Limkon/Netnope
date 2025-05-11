// public/js/main.js - 客户端 JavaScript 逻辑 (简体中文, 匿名用户处理)

// --- 全局变量 ---
let currentUsernameGlobal = '访客'; // 默认访客
let currentUserRoleGlobal = 'anonymous'; // 默认匿名角色
let currentAdminIdGlobal = ''; // 用于管理员页面

// --- 通用函数 ---
async function fetchData(url, options = {}) {
    try {
        const response = await fetch(url, options);
        if (response.status === 401) { // 未授权，但可能是匿名用户允许的操作
            // 对于匿名用户，某些GET请求是允许的，不应直接跳转登录
            // 交给调用者或路由逻辑判断是否需要重定向
            // 此处可以返回一个特殊标记或让 response.ok 为 false
        }
        if (!response.ok) {
            let errorData;
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
                errorData = await response.json();
            } else {
                errorData = await response.text();
            }
            console.error(`API 请求失败 (${response.status}):`, errorData);
            const errorMessage = (typeof errorData === 'object' && errorData !== null && errorData.message) ? errorData.message : (errorData || response.statusText);
            // 如果是 401 或 403，并且不是匿名用户正在尝试允许的操作，则可能需要跳转
            if ((response.status === 401 || response.status === 403) && currentUserRoleGlobal !== 'anonymous') {
                 alert('操作未授权或会话已过期，请重新登录。');
                 window.location.href = '/login';
                 return null;
            }
            throw new Error(`服务器响应错误: ${response.status} ${errorMessage}`);
        }
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            return response.json();
        }
        return response.text();
    } catch (error) {
        console.error('Fetch API 调用失败:', error);
        const messageToDisplay = error.message || '与服务器通讯时发生错误。';
        let msgElementId = 'globalMessageArea';
        if (document.getElementById('formMessage')) msgElementId = 'formMessage';
        if (document.getElementById('adminMessages')) msgElementId = 'adminMessages';
        if (document.getElementById('registerMessage')) msgElementId = 'registerMessage';
        if (document.getElementById('changePasswordMessage')) msgElementId = 'changePasswordMessage';
        displayMessage(messageToDisplay, 'error', msgElementId);
        return null;
    }
}

function displayMessage(message, type = 'info', elementId = 'globalMessageArea') {
    const container = document.getElementById(elementId);
    if (container) {
        container.innerHTML = message ? `<div class="${type}-message">${escapeHtml(message)}</div>` : '';
        container.style.display = message ? 'block' : 'none';
    } else {
        if (type === 'error' && message) alert(`错误: ${message}`);
        else if (type === 'success' && message) alert(`成功: ${message}`);
        else if (message) alert(message);
    }
}

function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return String(unsafe);
    return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// --- 导航栏设置 ---
function setupNavigation(username, role) {
    currentUsernameGlobal = username || '访客';
    currentUserRoleGlobal = role || 'anonymous';

    const navContainer = document.getElementById('mainNav');
    if (!navContainer) return;

    let navHtml = `<span class="welcome-user">欢迎, <strong id="usernameDisplay">${escapeHtml(currentUsernameGlobal)}</strong>!</span>`;

    if (currentUserRoleGlobal === 'anonymous') {
        navHtml += `<a href="/login" class="button-action">登录</a>`;
        navHtml += `<a href="/register" class="button-action" style="background-color: #6c757d; border-color: #6c757d;">注册</a>`;
    } else {
        navHtml += `<a href="/note/new" class="button-action">新建记事</a>`;
        navHtml += `<a href="/change-password" class="button-action">修改密码</a>`;
        if (currentUserRoleGlobal === 'admin') {
            navHtml += `<a href="/admin/users" id="adminUsersLink" class="button-action">管理用户</a>`;
        }
        navHtml += `<button id="logoutButton" class="button-danger">登出</button>`;
    }
    navContainer.innerHTML = navHtml;

    // 为动态添加的登出按钮绑定事件
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) {
        logoutButton.addEventListener('click', handleLogout);
    }
}


async function handleLogout() {
    if (!confirm("您确定要登出吗？")) return;
    try {
        await fetchData('/logout', { method: 'POST' }); // 不需要检查响应，直接跳转
        window.location.href = '/login?logged_out=true';
    } catch (error) {
        console.error('登出请求错误:', error);
        alert('登出时发生错误。');
        window.location.href = '/login'; // 即使出错也尝试跳转
    }
}

async function loadNotes() {
    const notesContainer = document.getElementById('notesContainer');
    const globalMessageArea = document.getElementById('globalMessageArea');
    if (globalMessageArea) displayMessage('', 'info', 'globalMessageArea');
    if (!notesContainer) return;
    notesContainer.innerHTML = '<p>正在加载记事...</p>';
    const notesData = await fetchData('/api/notes');
    if (!notesData) {
        notesContainer.innerHTML = '<p class="error-message">无法加载记事。请检查网络连接或稍后再试。</p>';
        return;
    }
    const notes = Array.isArray(notesData) ? notesData : [];
    if (notes.length === 0) {
        let noNotesMessage = '<p>当前没有记事。';
        if (currentUserRoleGlobal !== 'anonymous') {
            noNotesMessage += ' <a href="/note/new" class="button-action">创建您的第一篇记事！</a>';
        }
        noNotesMessage += '</p>';
        notesContainer.innerHTML = noNotesMessage;
        return;
    }
    const ul = document.createElement('ul');
    ul.className = 'note-list';
    notes.forEach(note => {
        const li = document.createElement('li');
        li.className = 'note-item';
        li.id = `note-${note.id}`;
        let ownerInfo = (currentUserRoleGlobal === 'admin' || currentUserRoleGlobal === 'anonymous') && note.ownerUsername ? `<span class="note-owner">(所有者: ${escapeHtml(note.ownerUsername)})</span>` : '';
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = note.content;
        const textContentPreview = tempDiv.textContent || tempDiv.innerText || "";
        const preview = textContentPreview.substring(0, 100) + (textContentPreview.length > 100 ? '...' : '');
        let attachmentHtml = '';
        if (note.attachment && note.attachment.path && currentUserRoleGlobal !== 'anonymous') { // 匿名用户不显示附件下载
            const attachmentUrl = `/uploads/${encodeURIComponent(note.attachment.path)}`;
            attachmentHtml = `<div class="note-attachment">附件: <a href="${attachmentUrl}" target="_blank" title="下载 ${escapeHtml(note.attachment.originalName)}">${escapeHtml(note.attachment.originalName)}</a></div>`;
        }
        let actionsHtml = '';
        if (currentUserRoleGlobal !== 'anonymous') { // 匿名用户没有操作按钮
            actionsHtml = `
                <div class="note-actions">
                    <a href="/note/edit?id=${note.id}" class="button-action">编辑</a>
                    <button class="button-danger" onclick="deleteNote('${note.id}', '${escapeHtml(note.title)}')">删除</button>
                </div>`;
        }

        li.innerHTML = `
            <div>
                <h3>${escapeHtml(note.title)} ${ownerInfo}</h3>
                <div class="note-meta">
                    最后更新: ${new Date(note.updatedAt).toLocaleString('zh-CN')}
                    (创建于: ${new Date(note.createdAt).toLocaleString('zh-CN')})
                </div>
                <div class="note-content-preview">${escapeHtml(preview)}</div>
                ${attachmentHtml}
            </div>
            ${actionsHtml}
        `;
        ul.appendChild(li);
    });
    notesContainer.innerHTML = '';
    notesContainer.appendChild(ul);
}

// ... (deleteNote, initializeRichTextEditor, setupNoteForm, loadNoteForEditing 保持不变，但确保文本为简体中文)
// ... (loadUsersForAdmin, showPasswordResetForm, handleUpdatePasswordByAdmin, setupAdminUserForm, deleteUserByAdmin 保持不变，但确保文本为简体中文)
// ... (setupRegistrationForm, setupChangeOwnPasswordForm 保持不变，但确保文本为简体中文)

// (确保所有 alert, confirm, prompt 中的文本都是简体中文)
// 例如，在 deleteNote 中:
// if (!confirm(`您确定要删除记事 "${noteTitle}" 吗？此操作无法复原。`)) return;
// 在 initializeRichTextEditor 中:
// value = prompt('请输入链接网址:', 'https://');
// if (file) alert('请选择一个有效的图片文件 (例如 JPG, PNG, GIF)。');
// 在 setupRegistrationForm 中:
// displayMessage('用户名不能为空。', 'error', messageContainerId);
// displayMessage('两次输入的密码不相符。', 'error', messageContainerId);
// displayMessage('注册成功！您现在可以前往登录页面登录。', 'success', messageContainerId);
// ... 等等

// 全局登出按钮的事件监听器现在由 setupNavigation 动态添加
// 如果有其他页面也直接写了登出按钮，需要确保它们也被正确处理或改为使用 setupNavigation

// 确保在 admin.html 的内联脚本中，currentAdminIdGlobal 被正确赋值
// 例如: currentAdminIdGlobal = "{{adminUserId}}";
// 并在调用 loadUsersForAdmin 时使用它。

// 确保所有页面的内联脚本都调用 setupNavigation
// 例如，在 login.html, register.html, change-password.html, note.html, admin.html
// document.addEventListener('DOMContentLoaded', () => {
//     setupNavigation("{{username}}", "{{userRole}}"); // 从服务器模板获取
//     // ... 其他页面特定的初始化 ...
// });
// 对于 login 和 register 页面，由于用户未登录，username 和 userRole 可能是空或表示匿名
// setupNavigation 需要能处理这种情况。
