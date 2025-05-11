// public/js/main.js - 客戶端 JavaScript 邏輯

// --- 通用函數 ---
async function fetchData(url, options = {}) {
    try {
        const response = await fetch(url, options);
        if (response.status === 401) {
            alert('您的會話已過期或未登入，請重新登入。');
            window.location.href = '/login';
            return null;
        }
        // For non-OK responses that are not 401, try to parse error message if JSON
        if (!response.ok) {
            let errorData;
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
                errorData = await response.json();
            } else {
                errorData = await response.text();
            }
            console.error(`API 請求失敗 (${response.status}):`, errorData);
            // If errorData is an object with a message property, use that, otherwise use the text or statusText
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
        // Try to determine a relevant elementId for the message
        let msgElementId = 'formMessage'; // Default for note form
        if (document.getElementById('notesContainer')) msgElementId = 'notesContainer'; // For index page
        if (document.getElementById('adminMessages')) msgElementId = 'adminMessages'; // For admin page
        if (document.getElementById('loginForm') && !document.getElementById('adminMessages') && !document.getElementById('notesContainer')) {
             // For login page, error is typically handled by server redirect with placeholder
        }

        displayMessage(messageToDisplay, 'error', msgElementId);
        return null;
    }
}

function displayMessage(message, type = 'info', elementId = 'messages') {
    const container = document.getElementById(elementId);
    if (container) {
        // For notesContainer, we might want to prepend the message instead of replacing all notes
        if (elementId === 'notesContainer' && type === 'error') {
            const msgDiv = document.createElement('div');
            msgDiv.className = `${type}-message`;
            msgDiv.innerHTML = escapeHtml(message);
            container.prepend(msgDiv); // Prepend so list is still visible
             setTimeout(() => { if(msgDiv) msgDiv.remove(); }, 7000); // Auto-remove after a while
            return;
        }
        container.innerHTML = `<div class="${type}-message">${escapeHtml(message)}</div>`;
        container.style.display = 'block';
        if (type === 'success' && (elementId === 'formMessage' || elementId === 'adminMessages')) {
            // Don't auto-hide success on forms immediately if a redirect is planned
        } else if (elementId !== 'notesContainer') { // notesContainer error is handled above
             // setTimeout(() => { container.style.display = 'none'; container.innerHTML = ''; }, 5000);
        }
    } else {
        if (type === 'error') alert(`錯誤: ${message}`);
        else if (type === 'success') alert(`成功: ${message}`);
        else alert(message);
    }
}

function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return String(unsafe); // Ensure it's a string
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
        // No specific body needed for logout with POST if session is cookie-based
        const response = await fetch('/logout', { method: 'POST' });
        if (response.ok && response.redirected) {
            window.location.href = response.url + (response.url.includes('?') ? '&' : '?') + 'logged_out=true';
        } else if (response.ok) {
             window.location.href = '/login?logged_out=true';
        } else {
            const errorText = await response.text();
            console.error('登出失敗:', errorText);
            alert('登出失敗: ' + errorText);
        }
    } catch (error) {
        console.error('登出請求錯誤:', error);
        alert('登出時發生錯誤。');
    }
}

async function loadNotes() {
    const notesContainer = document.getElementById('notesContainer');
    if (!notesContainer) return;

    const notesData = await fetchData('/api/notes');
    if (!notesData) {
        // fetchData already displays an error in notesContainer if it's an error
        if (!notesContainer.querySelector('.error-message')) {
             notesContainer.innerHTML = '<p class="error-message">無法載入記事。請稍後再試。</p>';
        }
        return;
    }
    const notes = Array.isArray(notesData) ? notesData : [];


    if (notes.length === 0) {
        notesContainer.innerHTML = '<p>目前沒有記事。 <a href="/note/new">建立您的第一篇記事！</a></p>';
        return;
    }

    const ul = document.createElement('ul');
    ul.className = 'note-list';
    notes.forEach(note => {
        const li = document.createElement('li');
        li.className = 'note-item';
        li.id = `note-${note.id}`;

        let ownerInfo = '';
        if (note.ownerUsername) {
            ownerInfo = `<span class="note-owner">(擁有者: ${escapeHtml(note.ownerUsername)})</span>`;
        }

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
                <a href="/note/edit?id=${note.id}" class="button-like secondary">編輯</a>
                <button class="danger" onclick="deleteNote('${note.id}', '${escapeHtml(note.title)}')">刪除</button>
            </div>
        `;
        ul.appendChild(li);
    });
    const existingError = notesContainer.querySelector('.error-message');
    notesContainer.innerHTML = ''; // Clear "loading..." or previous errors
    if(existingError) notesContainer.appendChild(existingError); // Keep error if it was there
    notesContainer.appendChild(ul);
}

async function deleteNote(noteId, noteTitle) {
    if (!confirm(`您確定要刪除記事 "${noteTitle}" 嗎？此操作無法復原。`)) {
        return;
    }
    const result = await fetchData(`/api/notes/${noteId}`, { method: 'DELETE' });
    if (result) {
        displayMessage(result.message || '記事已刪除。', 'success', 'notesContainer');
        const noteElement = document.getElementById(`note-${noteId}`);
        if (noteElement) {
            noteElement.remove();
        }
        const list = document.querySelector('.note-list');
        if (list && list.children.length === 0) {
            // If displayMessage put the success message inside notesContainer,
            // this might overwrite it. Let's ensure it doesn't.
            const successMsg = document.querySelector('#notesContainer .success-message');
            document.getElementById('notesContainer').innerHTML = '';
            if (successMsg) document.getElementById('notesContainer').appendChild(successMsg);
            const p = document.createElement('p');
            p.innerHTML = '目前沒有記事。 <a href="/note/new">建立您的第一篇記事！</a>';
            document.getElementById('notesContainer').appendChild(p);
        }
    }
}

let isSubmittingNote = false;

function initializeRichTextEditor() {
    const toolbar = document.getElementById('richTextToolbar');
    const contentArea = document.getElementById('richContent');

    if (toolbar && contentArea) {
        toolbar.addEventListener('click', (event) => {
            const target = event.target.closest('button');
            if (target && target.dataset.command) {
                event.preventDefault();
                const command = target.dataset.command;
                let value = null;
                if (command === 'createLink') {
                    value = prompt('請輸入連結網址:', 'http://');
                    if (!value) return;
                }
                document.execCommand(command, false, value);
                contentArea.focus();
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

            // Clear previous messages
            displayMessage('', 'info', 'formMessage');


            const result = await fetchData(url, { method: method, body: formData });

            if (result) { // fetchData returns null on network error or 401
                 // Check if result is the expected note object or a success message object
                if (result.id && result.title) { // Assuming successful save/update returns the note object
                    displayMessage(noteId ? '記事已成功更新！' : '記事已成功建立！', 'success', 'formMessage');
                    setTimeout(() => { window.location.href = '/'; }, 1500);
                } else if (result.message) { // If server sends a JSON with a message (e.g. for errors handled by controller)
                    displayMessage(result.message, 'error', 'formMessage');
                } else if (typeof result === 'string' && result.includes("成功")) { // Fallback for text success
                     displayMessage(result, 'success', 'formMessage');
                     setTimeout(() => { window.location.href = '/'; }, 1500);
                }
                // If fetchData itself displayed an error, result might be null, and message already shown.
            }
            // If fetchData returned null, it means it already handled displaying an error.

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
            currentAttachmentDiv.innerHTML = `
                目前附件: <a href="${attachmentUrl}" target="_blank">${escapeHtml(note.attachment.originalName)}</a>
            `;
            removeAttachmentContainer.style.display = 'block';
            document.getElementById('removeAttachmentCheckbox').checked = false; // Reset checkbox
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

        let actionHtml = '';
        if (user.username !== currentAdminUsername) {
            actionHtml = `<button class="danger" onclick="deleteUserByAdmin('${user.id}', '${escapeHtml(user.username)}')">刪除</button>`;
        } else {
            actionHtml = '<span style="font-size:0.8em; color:#777;">(目前登入)</span>';
        }

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
                displayMessage('使用者名稱不能為空。', 'error', 'adminMessages');
                return;
            }
            if (data.role === 'admin' && (!data.password || data.password.trim() === '')) {
                displayMessage('管理員的密碼不能為空。', 'error', 'adminMessages');
                return;
            }
            // Clear previous messages
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
            } else if (result && result.message) { // Server might send back a JSON with a message property for handled errors
                 displayMessage(result.message, 'error', 'adminMessages');
            }
            // If fetchData returned null, an error message was already displayed by fetchData itself.
        });
    }
}

async function deleteUserByAdmin(userId, username) {
    if (!confirm(`您確定要刪除使用者 "${username}" (ID: ${userId}) 嗎？此操作將同時刪除该使用者的所有記事和附件，且無法復原。`)) {
        return;
    }
    // Clear previous messages
    displayMessage('', 'info', 'adminMessages');

    const result = await fetchData(`/api/admin/users/${userId}`, { method: 'DELETE' });
    if (result && result.message && !result.message.toLowerCase().includes("錯誤")) { // Check if message indicates success
        displayMessage(result.message, 'success', 'adminMessages');
        loadUsersForAdmin();
    } else if (result && result.message) { // Server sent back a JSON with a message (likely an error it handled)
         displayMessage(result.message, 'error', 'adminMessages');
    }
    // If fetchData returned null, an error message was already displayed by fetchData itself.
}
