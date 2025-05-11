// public/js/main.js - 客户端 JavaScript 逻辑

// --- 通用函数 ---
async function fetchData(url, options = {}) {
    try {
        const response = await fetch(url, options);
        if (response.status === 401) {
            alert('您的會話已過期或未登入，請重新登入。');
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
            console.error(`API 請求失敗 (${response.status}):`, errorData);
            const errorMessage = (typeof errorData === 'object' && errorData !== null && errorData.message) ? errorData.message : (errorData || response.statusText);
            throw new Error(`伺服器回應錯誤: ${response.status} ${errorMessage}`);
        }
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            return response.json();
        }
        return response.text();
    } catch (error) {
        console.error('Fetch API 呼叫失敗:', error);
        const messageToDisplay = error.message || '與伺服器通訊時發生錯誤。';
        // 尝试确定显示消息的元素ID
        let msgElementId = 'globalMessageArea'; // 默认使用全局消息区域
        if (document.getElementById('formMessage')) msgElementId = 'formMessage'; // 笔记表单页
        if (document.getElementById('adminMessages')) msgElementId = 'adminMessages'; // 管理员页
        if (document.getElementById('registerMessage')) msgElementId = 'registerMessage'; // 注册页
        // 对于登录页，错误通常由服务器通过模板占位符处理，或通过URL参数
        if (window.location.pathname === '/login' && !document.getElementById(msgElementId)) {
             // 不在登录页主动显示fetch错误，除非有特定区域
        } else {
            displayMessage(messageToDisplay, 'error', msgElementId);
        }
        return null;
    }
}

function displayMessage(message, type = 'info', elementId = 'globalMessageArea') { // 默认使用全局消息区
    const container = document.getElementById(elementId);
    if (container) {
        container.innerHTML = message ? `<div class="${type}-message">${escapeHtml(message)}</div>` : '';
        container.style.display = message ? 'block' : 'none';
        // 对于非错误消息，可以设置一个短暂的显示时间
        if (type !== 'error' && message) {
            // setTimeout(() => {
            //     if (container.innerHTML.includes(escapeHtml(message))) { // 确保是同一个消息
            //         container.innerHTML = '';
            //         container.style.display = 'none';
            //     }
            // }, 5000); // 5秒后自动清除
        }
    } else { // 如果指定的 elementId 不存在，则使用 alert
        if (type === 'error' && message) alert(`錯誤: ${message}`);
        else if (type === 'success' && message) alert(`成功: ${message}`);
        else if (message) alert(message);
    }
}

function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return String(unsafe);
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

async function handleLogout() {
    if (!confirm("您確定要登出嗎？")) return;
    try {
        const response = await fetch('/logout', { method: 'POST' });
        if (response.ok && response.redirected) {
            window.location.href = response.url + (response.url.includes('?') ? '&' : '?') + 'logged_out=true';
        } else if (response.ok) {
             window.location.href = '/login?logged_out=true';
        } else {
            const errorText = await response.text(); alert('登出失敗: ' + errorText);
        }
    } catch (error) { alert('登出時發生錯誤。'); }
}

async function loadNotes() {
    const notesContainer = document.getElementById('notesContainer');
    const globalMessageArea = document.getElementById('globalMessageArea');

    if (globalMessageArea) { // 清除之前的全局消息
        displayMessage('', 'info', 'globalMessageArea');
    }
    if (!notesContainer) return;
    notesContainer.innerHTML = '<p>正在載入記事...</p>'; // 显示加载提示

    const notesData = await fetchData('/api/notes');
    if (!notesData) { // fetchData 内部会处理错误消息显示到 globalMessageArea
        notesContainer.innerHTML = '<p class="error-message">無法載入記事。請檢查網路連線或稍後再試。</p>';
        return;
    }
    const notes = Array.isArray(notesData) ? notesData : [];
    if (notes.length === 0) {
        notesContainer.innerHTML = '<p>目前沒有記事。 <a href="/note/new" class="button-action">建立您的第一篇記事！</a></p>';
        return;
    }
    const ul = document.createElement('ul');
    ul.className = 'note-list';
    notes.forEach(note => {
        const li = document.createElement('li');
        li.className = 'note-item';
        li.id = `note-${note.id}`;
        let ownerInfo = note.ownerUsername ? `<span class="note-owner">(擁有者: ${escapeHtml(note.ownerUsername)})</span>` : '';
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = note.content;
        const textContentPreview = tempDiv.textContent || tempDiv.innerText || "";
        const preview = textContentPreview.substring(0, 100) + (textContentPreview.length > 100 ? '...' : '');
        let attachmentHtml = '';
        if (note.attachment && note.attachment.path) {
            const attachmentUrl = `/uploads/${encodeURIComponent(note.attachment.path)}`;
            attachmentHtml = `
                <div class="note-attachment">
                    附件: <a href="${attachmentUrl}" target="_blank" title="下載 ${escapeHtml(note.attachment.originalName)} (${(note.attachment.size / 1024).toFixed(1)} KB)">
                        ${escapeHtml(note.attachment.originalName)}
                    </a>
                </div>`;
        }
        li.innerHTML = `
            <div>
                <h3>${escapeHtml(note.title)} ${ownerInfo}</h3>
                <div class="note-meta">
                    最後更新: ${new Date(note.updatedAt).toLocaleString('zh-TW')}
                    (建立於: ${new Date(note.createdAt).toLocaleString('zh-TW')})
                </div>
                <div class="note-content-preview">${escapeHtml(preview)}</div>
                ${attachmentHtml}
            </div>
            <div class="note-actions">
                <a href="/note/edit?id=${note.id}" class="button-action">編輯</a>
                <button class="button-danger" onclick="deleteNote('${note.id}', '${escapeHtml(note.title)}')">刪除</button>
            </div>
        `;
        ul.appendChild(li);
    });
    notesContainer.innerHTML = ''; // 清除 "正在載入..."
    notesContainer.appendChild(ul);
}

async function deleteNote(noteId, noteTitle) {
    if (!confirm(`您確定要刪除記事 "${noteTitle}" 嗎？此操作無法復原。`)) return;
    const result = await fetchData(`/api/notes/${noteId}`, { method: 'DELETE' });
    if (result && result.message) { // 确保 result 和 result.message 存在
        displayMessage(result.message, 'success', 'globalMessageArea'); // 显示在全局消息区域
        loadNotes(); // 重新加载整个笔记列表
    } else if (result) { // 如果 result 存在但没有 message，可能是一个非预期的成功响应
        displayMessage('記事已刪除，但伺服器未返回確認訊息。正在刷新列表...', 'info', 'globalMessageArea');
        loadNotes();
    }
    // 如果 fetchData 返回 null，它内部已经处理了错误消息的显示
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
                value = prompt('請輸入連結網址:', 'https://');
                if (!value) return;
            }
            document.execCommand(command, false, value);
            contentArea.focus();
        }
    });

    if (fontNameSelector) {
        fontNameSelector.addEventListener('change', (event) => {
            document.execCommand('fontName', false, event.target.value);
            contentArea.focus();
        });
    }
    if (fontSizeSelector) {
        fontSizeSelector.addEventListener('change', (event) => {
            document.execCommand('fontSize', false, event.target.value);
            contentArea.focus();
        });
    }
    if (foreColorPicker) {
        foreColorPicker.addEventListener('input', (event) => {
            document.execCommand('foreColor', false, event.target.value);
        });
         foreColorPicker.addEventListener('change', (event) => {
            document.execCommand('foreColor', false, event.target.value);
            contentArea.focus();
        });
    }

    if (insertLocalImageButton && imageUploadInput) {
        insertLocalImageButton.addEventListener('click', () => {
            imageUploadInput.click();
        });
        imageUploadInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file && file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    document.execCommand('insertImage', false, e.target.result);
                    contentArea.focus();
                };
                reader.readAsDataURL(file);
                imageUploadInput.value = '';
            } else if (file) {
                alert('請選擇一個有效的圖片檔案 (例如 JPG, PNG, GIF)。');
            }
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
            saveButton.disabled = true;
            saveButton.textContent = '儲存中...';
            hiddenContent.value = richContent.innerHTML;
            const formData = new FormData(noteForm);
            const noteId = document.getElementById('noteId').value;
            const url = noteId ? `/api/notes/${noteId}` : '/api/notes';
            const method = noteId ? 'PUT' : 'POST';
            displayMessage('', 'info', 'formMessage'); // 清除此表单的消息区域
            const result = await fetchData(url, { method: method, body: formData });
            if (result) {
                if (result.id && result.title) {
                    displayMessage(noteId ? '記事已成功更新！' : '記事已成功建立！', 'success', 'formMessage');
                    setTimeout(() => { window.location.href = '/'; }, 1500);
                } else if (result.message) {
                    displayMessage(result.message, 'error', 'formMessage');
                } else if (typeof result === 'string' && result.includes("成功")) {
                     displayMessage(result, 'success', 'formMessage');
                     setTimeout(() => { window.location.href = '/'; }, 1500);
                }
            }
            isSubmittingNote = false;
            saveButton.disabled = false;
            saveButton.textContent = '儲存記事';
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
            currentAttachmentDiv.innerHTML = `目前附件: <a href="${attachmentUrl}" target="_blank">${escapeHtml(note.attachment.originalName)}</a>`;
            removeAttachmentContainer.style.display = 'block';
            document.getElementById('removeAttachmentCheckbox').checked = false;
        } else {
            currentAttachmentDiv.innerHTML = '目前沒有附件。';
            removeAttachmentContainer.style.display = 'none';
        }
    } else {
        displayMessage('無法載入記事進行編輯。', 'error', 'formMessage');
        if(saveButton) saveButton.disabled = true;
    }
}

async function loadUsersForAdmin() {
    const userListUl = document.getElementById('userList');
    if (!userListUl) return;
    userListUl.innerHTML = '<li>正在載入使用者列表...</li>';
    const usersData = await fetchData('/api/admin/users');
     if (!usersData) {
        if(!userListUl.querySelector('.error-message')){ // 避免重复显示错误
            userListUl.innerHTML = '<li class="error-message">無法載入使用者列表。</li>';
        }
        return;
    }
    const users = Array.isArray(usersData) ? usersData : [];
    if (users.length === 0) {
        userListUl.innerHTML = '<li>目前沒有其他使用者。</li>';
        return;
    }
    const currentAdminUsernameElement = document.getElementById('adminUsernameDisplay');
    const currentAdminUsername = currentAdminUsernameElement ? currentAdminUsernameElement.textContent : '';
    userListUl.innerHTML = '';
    users.forEach(user => {
        const li = document.createElement('li');
        li.className = 'user-item';
        li.id = `user-admin-${user.id}`;
        let actionHtml = (user.username !== currentAdminUsername) ?
            `<button class="button-danger" onclick="deleteUserByAdmin('${user.id}', '${escapeHtml(user.username)}')">刪除</button>` :
            '<span style="font-size:0.8em; color:#5f6368;">(目前登入)</span>';
        li.innerHTML = `
            <span><strong>${escapeHtml(user.username)}</strong> (ID: ${user.id}, 角色: ${escapeHtml(user.role)})</span>
            ${actionHtml}
        `;
        userListUl.appendChild(li);
    });
}

function setupAdminUserForm() {
    const addUserForm = document.getElementById('addUserForm');
    if (addUserForm) {
        addUserForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const formData = new FormData(addUserForm);
            const data = Object.fromEntries(formData.entries());
            if (!data.username || data.username.trim() === '') {
                displayMessage('使用者名稱不能為空。', 'error', 'adminMessages'); return;
            }
            if (data.role === 'admin' && (!data.password || data.password.trim() === '')) {
                displayMessage('管理員的密碼不能為空。', 'error', 'adminMessages'); return;
            }
            displayMessage('', 'info', 'adminMessages');
            const result = await fetchData('/api/admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (result && result.id) {
                displayMessage(`使用者 "${escapeHtml(result.username)}" 已成功建立。`, 'success', 'adminMessages');
                addUserForm.reset();
                loadUsersForAdmin();
            } else if (result && result.message) {
                 displayMessage(result.message, 'error', 'adminMessages');
            }
        });
    }
}

async function deleteUserByAdmin(userId, username) {
    if (!confirm(`您確定要刪除使用者 "${username}" (ID: ${userId}) 嗎？此操作將同時刪除该使用者的所有記事和附件，且無法復原。`)) return;
    displayMessage('', 'info', 'adminMessages');
    const result = await fetchData(`/api/admin/users/${userId}`, { method: 'DELETE' });
    if (result && result.message && (result.message.includes("成功") || !result.message.toLowerCase().includes("錯誤") && !result.message.toLowerCase().includes("失敗"))) {
        displayMessage(result.message, 'success', 'adminMessages');
        loadUsersForAdmin();
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
                displayMessage('使用者名稱不能為空。', 'error', messageContainerId); return;
            }
            if (password !== confirmPassword) {
                displayMessage('兩次輸入的密碼不相符。', 'error', messageContainerId); return;
            }
            isRegistering = true;
            registerButton.disabled = true;
            registerButton.textContent = '註冊中...';
            const result = await fetchData('/api/users/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            if (result && result.id) {
                displayMessage('註冊成功！您現在可以前往登入頁面登入。', 'success', messageContainerId);
                registerForm.reset();
                setTimeout(() => { window.location.href = '/login?registered=true'; }, 2000);
            } else if (result && result.message) {
                 displayMessage(result.message, 'error', messageContainerId);
            }
            isRegistering = false;
            registerButton.disabled = false;
            registerButton.textContent = '註冊';
        });
    }
}

document.querySelectorAll('#logoutButton').forEach(button => {
    button.addEventListener('click', handleLogout);
});
