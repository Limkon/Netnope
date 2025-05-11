// public/js/main.js - 客户端 JavaScript 逻辑 (简体中文, 匿名用户处理)

// --- 全局变量 ---
let currentUsernameGlobal = '访客'; // 默认访客
let currentUserRoleGlobal = 'anonymous'; // 默认匿名角色
let currentAdminIdGlobal = ''; // 用于管理员页面 (在 admin.html 中通过模板注入)

// --- 通用函数 ---
async function fetchData(url, options = {}) {
    try {
        const response = await fetch(url, options);
        // 401 Unauthorized: 通常意味着需要登录，但对于匿名用户允许的GET请求，我们不立即跳转
        if (response.status === 401 && !(options.method === 'GET' && currentUserRoleGlobal === 'anonymous')) {
            alert('您的会话已过期或未授权，请重新登录。');
            window.location.href = '/login';
            return null;
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
            
            // 对于 403 Forbidden，也提示并可能跳转（除非是匿名用户尝试非允许操作）
            if (response.status === 403 && currentUserRoleGlobal !== 'anonymous') {
                 alert('您没有权限执行此操作。');
                 // window.location.href = '/login'; // 可以选择是否跳转
                 // return null;
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
        let msgElementId = 'globalMessageArea'; // 默认使用全局消息区域
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
    currentUserRoleGlobal = role || 'anonymous'; // 如果 role 未定义，则假定为匿名

    const navContainer = document.getElementById('mainNav'); // 假设所有页面都有这个ID的nav
    if (!navContainer) { // 如果特定页面没有 mainNav，则尝试更新独立的 usernameDisplay
        const usernameDisplaySpan = document.getElementById('usernameDisplay');
        if (usernameDisplaySpan) {
            usernameDisplaySpan.textContent = escapeHtml(currentUsernameGlobal);
        }
        // 对于没有 mainNav 的页面（如登录、注册），可能不需要完整的导航栏更新
        return;
    }


    let navHtml = `<span class="welcome-user">欢迎, <strong id="usernameDisplay">${escapeHtml(currentUsernameGlobal)}</strong>!</span>`;

    if (currentUserRoleGlobal === 'anonymous') {
        navHtml += `<a href="/login" class="button-action">登录</a>`;
        navHtml += `<a href="/register" class="button-action" style="background-color: #6c757d; border-color: #6c757d;">注册</a>`;
    } else {
        // 对所有登录用户显示
        if (window.location.pathname !== '/note/new' && !window.location.pathname.startsWith('/note/edit')) {
             navHtml += `<a href="/note/new" class="button-action">新建记事</a>`;
        }
        if (window.location.pathname !== '/change-password') {
            navHtml += `<a href="/change-password" class="button-action">修改密码</a>`;
        }
        if (window.location.pathname !== '/' && window.location.pathname !== '/index.html') {
             navHtml += `<a href="/" class="button-action">返回列表</a>`;
        }


        if (currentUserRoleGlobal === 'admin') {
            // 仅对管理员显示，并且如果不在 admin/users 页面
            if (window.location.pathname !== '/admin/users') {
                navHtml += `<a href="/admin/users" id="adminUsersLink" class="button-action">管理用户</a>`;
            }
        }
        navHtml += `<button id="logoutButton" class="button-danger">登出</button>`;
    }
    navContainer.innerHTML = navHtml;

    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) {
        logoutButton.addEventListener('click', handleLogout);
    }
}


async function handleLogout() {
    if (!confirm("您确定要登出吗？")) return;
    try {
        await fetchData('/logout', { method: 'POST' });
        window.location.href = '/login?logged_out=true';
    } catch (error) {
        console.error('登出请求错误:', error);
        alert('登出时发生错误。');
        window.location.href = '/login';
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
        if (note.attachment && note.attachment.path && currentUserRoleGlobal !== 'anonymous') {
            const attachmentUrl = `/uploads/${encodeURIComponent(note.attachment.path)}`;
            attachmentHtml = `<div class="note-attachment">附件: <a href="${attachmentUrl}" target="_blank" title="下载 ${escapeHtml(note.attachment.originalName)}">${escapeHtml(note.attachment.originalName)}</a></div>`;
        }
        let actionsHtml = '';
        // 只有当用户是管理员，或者是该记事的拥有者时，才显示编辑和删除按钮
        // 匿名用户不显示任何操作按钮
        if (currentUserRoleGlobal !== 'anonymous' && (currentUserRoleGlobal === 'admin' || (note.userId === currentUserIdGlobal))) { // currentUserIdGlobal 需要被正确设置
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

async function deleteNote(noteId, noteTitle) {
    if (!confirm(`您确定要删除记事 "${noteTitle}" 吗？此操作无法复原。`)) return;
    const result = await fetchData(`/api/notes/${noteId}`, { method: 'DELETE' });
    if (result && result.message) {
        displayMessage(result.message, 'success', 'globalMessageArea');
        loadNotes();
    } else if (result) {
        displayMessage('记事已删除，但服务器未返回确认消息。正在刷新列表...', 'info', 'globalMessageArea');
        loadNotes();
    }
}

let isSubmittingNote = false;
function initializeRichTextEditor() {
    const toolbar = document.getElementById('richTextToolbar');
    const contentArea = document.getElementById('richContent');
    if (!toolbar || !contentArea) return;
    const fontNameSelector = document.getElementById('fontNameSelector');
    const fontSizeSelector = document.getElementById('fontSizeSelector');
    const foreColorPicker = document.getElementById('foreColorPicker');
    const insertLocalImageButton = document.getElementById('insertLocalImageButton');
    const imageUploadInput = document.getElementById('imageUploadInput');
    toolbar.addEventListener('click', (event) => {
        const target = event.target.closest('button');
        if (target && target.dataset.command) {
            event.preventDefault();
            const command = target.dataset.command;
            let value = null;
            if (command === 'createLink') {
                value = prompt('请输入链接网址:', 'https://');
                if (!value) return;
            }
            document.execCommand(command, false, value);
            contentArea.focus();
        }
    });
    if (fontNameSelector) fontNameSelector.addEventListener('change', (event) => { document.execCommand('fontName', false, event.target.value); contentArea.focus(); });
    if (fontSizeSelector) fontSizeSelector.addEventListener('change', (event) => { document.execCommand('fontSize', false, event.target.value); contentArea.focus(); });
    if (foreColorPicker) {
        foreColorPicker.addEventListener('input', (event) => { document.execCommand('foreColor', false, event.target.value); });
        foreColorPicker.addEventListener('change', (event) => { document.execCommand('foreColor', false, event.target.value); contentArea.focus(); });
    }
    if (insertLocalImageButton && imageUploadInput) {
        insertLocalImageButton.addEventListener('click', () => imageUploadInput.click());
        imageUploadInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file && file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (e) => { document.execCommand('insertImage', false, e.target.result); contentArea.focus(); };
                reader.readAsDataURL(file);
                imageUploadInput.value = '';
            } else if (file) alert('请选择一个有效的图片文件 (例如 JPG, PNG, GIF)。');
        });
    }
}

function setupNoteForm() {
    const noteForm = document.getElementById('noteForm');
    const richContent = document.getElementById('richContent');
    const hiddenContent = document.getElementById('hiddenContent');
    const saveButton = document.getElementById('saveNoteButton');
    if (noteForm && richContent && hiddenContent && saveButton) {
        noteForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (isSubmittingNote) return;
            isSubmittingNote = true;
            saveButton.disabled = true; saveButton.textContent = '保存中...';
            hiddenContent.value = richContent.innerHTML;
            const formData = new FormData(noteForm);
            const noteId = document.getElementById('noteId').value;
            const url = noteId ? `/api/notes/${noteId}` : '/api/notes';
            const method = noteId ? 'PUT' : 'POST';
            displayMessage('', 'info', 'formMessage');
            const result = await fetchData(url, { method: method, body: formData });
            if (result) {
                if (result.id && result.title) {
                    displayMessage(noteId ? '记事已成功更新！' : '记事已成功创建！', 'success', 'formMessage');
                    setTimeout(() => { window.location.href = '/'; }, 1500);
                } else if (result.message) displayMessage(result.message, 'error', 'formMessage');
                else if (typeof result === 'string' && result.includes("成功")) {
                     displayMessage(result, 'success', 'formMessage');
                     setTimeout(() => { window.location.href = '/'; }, 1500);
                }
            }
            isSubmittingNote = false;
            saveButton.disabled = false; saveButton.textContent = '保存记事';
        });
    }
}

async function loadNoteForEditing(noteId) {
    const note = await fetchData(`/api/notes/${noteId}`);
    const saveButton = document.getElementById('saveNoteButton');
    if (note) {
        document.getElementById('title').value = note.title;
        document.getElementById('richContent').innerHTML = note.content;
        const currentAttachmentDiv = document.getElementById('currentAttachment');
        const removeAttachmentContainer = document.getElementById('removeAttachmentContainer');
        if (note.attachment && note.attachment.path) {
            const attachmentUrl = `/uploads/${encodeURIComponent(note.attachment.path)}`;
            currentAttachmentDiv.innerHTML = `当前附件: <a href="${attachmentUrl}" target="_blank">${escapeHtml(note.attachment.originalName)}</a>`;
            removeAttachmentContainer.style.display = 'block';
            document.getElementById('removeAttachmentCheckbox').checked = false;
        } else {
            currentAttachmentDiv.innerHTML = '当前没有附件。';
            removeAttachmentContainer.style.display = 'none';
        }
    } else {
        displayMessage('无法加载记事进行编辑。', 'error', 'formMessage');
        if(saveButton) saveButton.disabled = true;
    }
}

async function loadUsersForAdmin(currentAdminId) { // currentAdminId 由 admin.html 传入
    const userListUl = document.getElementById('userList');
    if (!userListUl) return;
    userListUl.innerHTML = '<li>正在加载用户列表...</li>';
    const usersData = await fetchData('/api/admin/users');
     if (!usersData) {
        if(!userListUl.querySelector('.error-message')) userListUl.innerHTML = '<li class="error-message">无法加载用户列表。</li>';
        return;
    }
    const users = Array.isArray(usersData) ? usersData : [];
    if (users.length === 0) {
        userListUl.innerHTML = '<li>当前没有其他用户。</li>';
        return;
    }
    userListUl.innerHTML = '';
    users.forEach(user => {
        const li = document.createElement('li');
        li.className = 'user-item';
        li.id = `user-admin-${user.id}`;
        const userInfoSpan = document.createElement('span');
        userInfoSpan.innerHTML = `<strong>${escapeHtml(user.username)}</strong> (ID: ${user.id}, 角色: ${escapeHtml(user.role)})`;
        li.appendChild(userInfoSpan);
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'user-item-actions';
        actionsDiv.style.display = 'flex';
        actionsDiv.style.gap = '10px';
        if (user.id !== currentAdminId) { // 管理员不能操作自己
            const resetPassButton = document.createElement('button');
            resetPassButton.className = 'button-action';
            resetPassButton.textContent = '重设密码';
            resetPassButton.style.padding = '0.3rem 0.6rem';
            resetPassButton.style.fontSize = '0.85rem';
            resetPassButton.onclick = () => showPasswordResetForm(user.id, user.username, li);
            actionsDiv.appendChild(resetPassButton);
            // 允许删除 "anyone" 用户
            const deleteButton = document.createElement('button');
            deleteButton.className = 'button-danger';
            deleteButton.textContent = '删除';
            deleteButton.onclick = () => deleteUserByAdmin(user.id, user.username);
            actionsDiv.appendChild(deleteButton);
        } else {
            const selfSpan = document.createElement('span');
            selfSpan.style.fontSize = '0.8em';
            selfSpan.style.color = '#5f6368';
            selfSpan.textContent = '(当前登录)';
            actionsDiv.appendChild(selfSpan);
        }
        li.appendChild(actionsDiv);
        userListUl.appendChild(li);
    });
}

function showPasswordResetForm(userId, username, listItemElement) {
    const existingForms = document.querySelectorAll('.password-edit-form-container');
    existingForms.forEach(form => form.remove());
    const formContainer = document.createElement('div');
    formContainer.className = 'password-edit-form-container';
    formContainer.style.marginTop = '10px';
    formContainer.style.padding = '15px';
    formContainer.style.border = '1px solid #ccc';
    formContainer.style.borderRadius = '4px';
    formContainer.style.backgroundColor = '#f9f9f9';
    const form = document.createElement('form');
    form.id = `passwordEditForm-${userId}`;
    form.onsubmit = (event) => handleUpdatePasswordByAdmin(event, userId, username);
    const currentUserP = document.createElement('p');
    currentUserP.innerHTML = `正在为用户 <strong>${escapeHtml(username)}</strong> 重设密码。`;
    currentUserP.style.marginBottom = '10px';
    const passwordLabel = document.createElement('label');
    passwordLabel.htmlFor = `newPass-${userId}`;
    passwordLabel.textContent = `新密码:`;
    passwordLabel.style.display = 'block';
    passwordLabel.style.marginBottom = '5px';
    const passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordInput.id = `newPass-${userId}`;
    passwordInput.name = 'newPassword';
    passwordInput.placeholder = "输入新密码 (普通用户可为空)";
    passwordInput.style.marginBottom = '10px';
    passwordInput.style.width = 'calc(100% - 16px)';
    const saveButton = document.createElement('button');
    saveButton.type = 'submit';
    saveButton.className = 'button-action';
    saveButton.textContent = '保存新密码';
    saveButton.style.marginRight = '10px';
    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'button-action button-cancel';
    cancelButton.textContent = '取消';
    cancelButton.onclick = () => formContainer.remove();
    form.appendChild(currentUserP);
    form.appendChild(passwordLabel);
    form.appendChild(passwordInput);
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'form-actions';
    actionsDiv.appendChild(saveButton);
    actionsDiv.appendChild(cancelButton);
    form.appendChild(actionsDiv);
    formContainer.appendChild(form);
    listItemElement.appendChild(formContainer);
    passwordInput.focus();
}

async function handleUpdatePasswordByAdmin(event, userId, username) {
    event.preventDefault();
    const form = event.target;
    const newPasswordInput = form.newPassword;
    const newPassword = newPasswordInput.value;
    const messageContainerId = 'adminMessages';
    displayMessage('正在更新密码...', 'info', messageContainerId);
    const result = await fetchData(`/api/admin/users/${userId}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: newPassword })
    });
    if (result && result.message && (result.message.includes("成功") || !result.message.toLowerCase().includes("错误"))) {
        displayMessage(result.message, 'success', messageContainerId);
        const formContainer = form.closest('.password-edit-form-container');
        if (formContainer) formContainer.remove();
    } else if (result && result.message) {
        displayMessage(result.message, 'error', messageContainerId);
    }
}

function setupAdminUserForm() {
    const addUserForm = document.getElementById('addUserForm');
    if (addUserForm) {
        addUserForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const formData = new FormData(addUserForm);
            const data = Object.fromEntries(formData.entries());
            if (!data.username || data.username.trim() === '') {
                displayMessage('用户名不能为空。', 'error', 'adminMessages'); return;
            }
            if (data.role === 'admin' && (!data.password || data.password.trim() === '')) {
                displayMessage('管理员的密码不能为空。', 'error', 'adminMessages'); return;
            }
            displayMessage('', 'info', 'adminMessages');
            const result = await fetchData('/api/admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (result && result.id) {
                displayMessage(`用户 "${escapeHtml(result.username)}" 已成功创建。`, 'success', 'adminMessages');
                addUserForm.reset();
                loadUsersForAdmin(currentAdminIdGlobal); // 确保 currentAdminIdGlobal 在此作用域可用
            } else if (result && result.message) {
                 displayMessage(result.message, 'error', 'adminMessages');
            }
        });
    }
}

async function deleteUserByAdmin(userId, username) {
    if (!confirm(`您确定要删除用户 "${username}" (ID: ${userId}) 吗？此操作将同时删除该用户的所有记事和附件，且无法复原。`)) return;
    displayMessage('', 'info', 'adminMessages');
    const result = await fetchData(`/api/admin/users/${userId}`, { method: 'DELETE' });
    if (result && result.message && (result.message.includes("成功") || !result.message.toLowerCase().includes("错误") && !result.message.toLowerCase().includes("失败"))) {
        displayMessage(result.message, 'success', 'adminMessages');
        loadUsersForAdmin(currentAdminIdGlobal); // 确保 currentAdminIdGlobal 在此作用域可用
    } else if (result && result.message) {
         displayMessage(result.message, 'error', 'adminMessages');
    }
}

let isRegistering = false;
function setupRegistrationForm() {
    const registerForm = document.getElementById('registerForm');
    const registerButton = document.getElementById('registerButton');
    if (registerForm && registerButton) {
        registerForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (isRegistering) return;
            const usernameInput = document.getElementById('regUsername');
            const passwordInput = document.getElementById('regPassword');
            const confirmPasswordInput = document.getElementById('regConfirmPassword');
            const messageContainerId = 'registerMessage';
            const username = usernameInput.value.trim();
            const password = passwordInput.value;
            const confirmPassword = confirmPasswordInput.value;
            displayMessage('', 'info', messageContainerId);
            if (!username) {
                displayMessage('用户名不能为空。', 'error', messageContainerId); return;
            }
            if (password !== confirmPassword) {
                displayMessage('两次输入的密码不相符。', 'error', messageContainerId); return;
            }
            isRegistering = true;
            registerButton.disabled = true; registerButton.textContent = '注册中...';
            const result = await fetchData('/api/users/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            if (result && result.id) {
                displayMessage('注册成功！您现在可以前往登录页面登录。', 'success', messageContainerId);
                registerForm.reset();
                setTimeout(() => { window.location.href = '/login?registered=true'; }, 2000);
            } else if (result && result.message) {
                 displayMessage(result.message, 'error', messageContainerId);
            }
            isRegistering = false;
            registerButton.disabled = false; registerButton.textContent = '注册';
        });
    }
}

let isChangingOwnPassword = false;
function setupChangeOwnPasswordForm() {
    const form = document.getElementById('changeOwnPasswordForm');
    const submitButton = document.getElementById('submitChangePassword');
    const messageContainerId = 'changePasswordMessage';

    if (form && submitButton) {
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (isChangingOwnPassword) return;
            const currentPassword = document.getElementById('currentPassword').value;
            const newPassword = document.getElementById('newPasswordUser').value;
            const confirmNewPassword = document.getElementById('confirmNewPasswordUser').value;
            displayMessage('', 'info', messageContainerId);
            if (newPassword !== confirmNewPassword) { // 新密码和确认密码必须匹配
                displayMessage('新密码和确认密码不匹配。', 'error', messageContainerId);
                return;
            }
            // 如果新密码非空，则当前密码也必须提供（除非用户当前密码本身就是空的，这种情况由后端验证）
            // 对于新密码为空的情况，也允许，表示用户可能想将密码设置为空（如果当前密码正确）
            // 后端会验证当前密码是否正确，以及管理员的新密码是否为空

            isChangingOwnPassword = true;
            submitButton.disabled = true;
            submitButton.textContent = '正在提交...';
            const result = await fetchData('/api/users/me/password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword, newPassword, confirmNewPassword })
            });
            if (result && result.message && result.message.includes("成功")) {
                displayMessage(result.message + ' 您可能需要重新登录。', 'success', messageContainerId);
                form.reset();
                setTimeout(() => {
                     handleLogout();
                }, 2500);
            } else if (result && result.message) {
                displayMessage(result.message, 'error', messageContainerId);
            }
            isChangingOwnPassword = false;
            submitButton.disabled = false;
            submitButton.textContent = '确认修改';
        });
    }
}

// 在页面加载时，根据 window.location.pathname 调用相应的初始化函数
document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;
    const usernameFromServer = typeof currentUsername !== 'undefined' ? currentUsername : (document.body.dataset.username || '访客');
    const roleFromServer = typeof currentUserRole !== 'undefined' ? currentUserRole : (document.body.dataset.userrole || 'anonymous');
    const adminIdFromServer = typeof currentAdminId !== 'undefined' ? currentAdminId : (document.body.dataset.adminid || '');

    currentAdminIdGlobal = adminIdFromServer; // 设置全局管理员ID

    // 统一调用 setupNavigation
    // 注意：login 和 register 页面可能没有 mainNav，setupNavigation 需要优雅处理
    const mainNav = document.getElementById('mainNav');
    if (mainNav) {
        setupNavigation(usernameFromServer, roleFromServer);
    } else { // 对于没有 mainNav 的页面，尝试更新独立的 usernameDisplay
        const usernameDisplaySpan = document.getElementById('usernameDisplay');
        if (usernameDisplaySpan) {
            usernameDisplaySpan.textContent = escapeHtml(usernameFromServer);
        }
    }


    if (path === '/' || path === '/index.html') {
        loadNotes();
    } else if (path.startsWith('/note/')) {
        initializeRichTextEditor();
        setupNoteForm();
        const urlParams = new URLSearchParams(window.location.search);
        const noteId = urlParams.get('id');
        if (noteId) {
            loadNoteForEditing(noteId);
        }
    } else if (path === '/admin/users') {
        loadUsersForAdmin(currentAdminIdGlobal);
        setupAdminUserForm();
    } else if (path === '/register') {
        setupRegistrationForm();
    } else if (path === '/change-password') {
        setupChangeOwnPasswordForm();
    }

    // 全局登出按钮 (如果页面上有，并且不是由 setupNavigation 动态添加的)
    // setupNavigation 已经处理了动态添加的登出按钮的事件监听
    document.querySelectorAll('#logoutButton:not([data-listener-attached])').forEach(button => {
        button.addEventListener('click', handleLogout);
        button.setAttribute('data-listener-attached', 'true');
    });
});
