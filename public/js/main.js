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
        let msgElementId = 'formMessage'; // Default for note form
        if (document.getElementById('notesContainer')) msgElementId = 'notesContainer';
        if (document.getElementById('adminMessages')) msgElementId = 'adminMessages';
        if (document.getElementById('registerMessage')) msgElementId = 'registerMessage';
        displayMessage(messageToDisplay, 'error', msgElementId);
        return null;
    }
}

function displayMessage(message, type = 'info', elementId = 'messages') {
    const container = document.getElementById(elementId);
    if (container) {
        if (elementId === 'notesContainer' && type === 'error') {
            const msgDiv = document.createElement('div');
            msgDiv.className = `${type}-message`;
            msgDiv.innerHTML = escapeHtml(message);
            container.prepend(msgDiv);
             setTimeout(() => { if(msgDiv) msgDiv.remove(); }, 7000);
            return;
        }
        container.innerHTML = message ? `<div class="${type}-message">${escapeHtml(message)}</div>` : '';
        container.style.display = message ? 'block' : 'none';
    } else {
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
    if (!notesContainer) return;
    const notesData = await fetchData('/api/notes');
    if (!notesData) {
        if (!notesContainer.querySelector('.error-message')) {
             notesContainer.innerHTML = '<p class="error-message">無法載入記事。請稍後再試。</p>';
        }
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
    const existingError = notesContainer.querySelector('.error-message');
    notesContainer.innerHTML = '';
    if(existingError) notesContainer.appendChild(existingError);
    notesContainer.appendChild(ul);
}

async function deleteNote(noteId, noteTitle) {
    if (!confirm(`您確定要刪除記事 "${noteTitle}" 嗎？此操作無法復原。`)) return;
    const result = await fetchData(`/api/notes/${noteId}`, { method: 'DELETE' });
    if (result) {
        displayMessage(result.message || '記事已刪除。', 'success', 'notesContainer');
        const noteElement = document.getElementById(`note-${noteId}`);
        if (noteElement) noteElement.remove();
        const list = document.querySelector('.note-list');
        if (list && list.children.length === 0) {
            const successMsg = document.querySelector('#notesContainer .success-message');
            document.getElementById('notesContainer').innerHTML = '';
            if (successMsg) document.getElementById('notesContainer').appendChild(successMsg);
            const p = document.createElement('p');
            p.innerHTML = '目前沒有記事。 <a href="/note/new" class="button-action">建立您的第一篇記事！</a>';
            document.getElementById('notesContainer').appendChild(p);
        }
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
                value = prompt('請輸入連結網址:', 'https://');
                if (!value) return;
            }
            // insertImageFromUrl command is removed, handled by insertLocalImageButton
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
            imageUploadInput.click(); // Trigger file input
        });

        imageUploadInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file && file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    // Insert image as base64 data URL
                    // Warning: This can make the note content very large for big images.
                    document.execCommand('insertImage', false, e.target.result);
                    contentArea.focus();
                };
                reader.readAsDataURL(file);
                imageUploadInput.value = ''; // Reset file input for next use
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
            displayMessage('', 'info', 'formMessage');
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
    const usersData = await fetchData('/api/admin/users');
     if (!usersData) {
        if(!userListUl.querySelector('.error-message')){
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

// --- 新增：註冊表單處理 ---
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
            const password = passwordInput.value; // 密碼可以為空
            const confirmPassword = confirmPasswordInput.value;

            displayMessage('', 'info', messageContainerId); // 清除舊訊息

            if (!username) {
                displayMessage('使用者名稱不能為空。', 'error', messageContainerId);
                return;
            }
            if (password !== confirmPassword) {
                displayMessage('兩次輸入的密碼不相符。', 'error', messageContainerId);
                return;
            }

            isRegistering = true;
            registerButton.disabled = true;
            registerButton.textContent = '註冊中...';

            const result = await fetchData('/api/users/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            if (result && result.id) { // 假設成功時返回包含 id 的使用者物件
                displayMessage('註冊成功！您現在可以前往登入頁面登入。', 'success', messageContainerId);
                registerForm.reset();
                // 可選：幾秒後自動跳轉到登入頁
                setTimeout(() => {
                    window.location.href = '/login?registered=true';
                }, 2000);
            } else if (result && result.message) { // 伺服器返回錯誤訊息
                 displayMessage(result.message, 'error', messageContainerId);
            }
            // 如果 fetchData 返回 null，表示它內部已經處理了錯誤訊息的顯示

            isRegistering = false;
            registerButton.disabled = false;
            registerButton.textContent = '註冊';
        });
    }
}

// 全局登出按钮 (如果页面上有)
document.querySelectorAll('#logoutButton').forEach(button => {
    button.addEventListener('click', handleLogout);
});
