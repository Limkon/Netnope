// public/js/main.js - 客戶端 JavaScript 邏輯

// --- 通用函數 ---
async function fetchData(url, options = {}) {
    try {
        const response = await fetch(url, options);
        if (response.status === 401) { // 未授權 (Session 過期或未登入)
            alert('您的會話已過期或未登入，請重新登入。');
            window.location.href = '/login';
            return null;
        }
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`API 請求失敗 (${response.status}): ${errorText}`);
            throw new Error(`伺服器回應錯誤: ${response.status} ${errorText || response.statusText}`);
        }
        // 如果 Content-Type 是 application/json，則解析 JSON，否則返回 text
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            return response.json();
        }
        return response.text(); // 例如用於登出後的成功訊息 (如果伺服器返回純文字)
    } catch (error) {
        console.error('Fetch API 呼叫失敗:', error);
        displayMessage(error.message || '與伺服器通訊時發生錯誤。', 'error', 'formMessage'); // 嘗試顯示錯誤
        return null; // 或拋出錯誤，讓呼叫者處理
    }
}

function displayMessage(message, type = 'info', elementId = 'messages') {
    const container = document.getElementById(elementId);
    if (container) {
        container.innerHTML = `<div class="${type}-message">${escapeHtml(message)}</div>`;
        container.style.display = 'block';
        // 可選：幾秒後自動隱藏訊息
        // setTimeout(() => { container.style.display = 'none'; container.innerHTML = ''; }, 5000);
    } else {
        // 如果特定訊息容器不存在，嘗試使用 alert
        if (type === 'error') alert(`錯誤: ${message}`);
        else if (type === 'success') alert(`成功: ${message}`);
        else alert(message);
    }
}

function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return '';
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

// --- 登出邏輯 ---
async function handleLogout() {
    if (!confirm("您確定要登出嗎？")) return;
    try {
        const response = await fetch('/logout', { method: 'POST' });
        if (response.ok && response.redirected) {
            window.location.href = response.url + (response.url.includes('?') ? '&' : '?') + 'logged_out=true';
        } else if (response.ok) { // 如果沒有重定向，但成功
             window.location.href = '/login?logged_out=true';
        }
        else {
            const errorText = await response.text();
            console.error('登出失敗:', errorText);
            alert('登出失敗: ' + errorText);
        }
    } catch (error) {
        console.error('登出請求錯誤:', error);
        alert('登出時發生錯誤。');
    }
}


// --- 記事列表頁 (index.html) ---
async function loadNotes() {
    const notesContainer = document.getElementById('notesContainer');
    if (!notesContainer) return;

    const notes = await fetchData('/api/notes');
    if (!notes) {
        notesContainer.innerHTML = '<p class="error-message">無法載入記事。請稍後再試。</p>';
        return;
    }

    if (notes.length === 0) {
        notesContainer.innerHTML = '<p>目前沒有記事。 <a href="/note/new">建立您的第一篇記事！</a></p>';
        return;
    }

    // 取得目前登入使用者的角色和ID (假設已透過某種方式注入到頁面或可從 session 取得)
    // 這裡我們依賴伺服器端 API 回傳的 notes 已經根據權限過濾
    // const currentUserRole = document.body.dataset.userRole; // 假設在 body data-* 屬性中
    // const currentUserId = document.body.dataset.userId;

    const ul = document.createElement('ul');
    ul.className = 'note-list';
    notes.forEach(note => {
        const li = document.createElement('li');
        li.className = 'note-item';
        li.id = `note-${note.id}`;

        let ownerInfo = '';
        if (note.ownerUsername) { // 如果是管理員視角，顯示擁有者
            ownerInfo = `<span class="note-owner">(擁有者: ${escapeHtml(note.ownerUsername)})</span>`;
        }

        // 內容預覽 (移除 HTML 標籤並截斷)
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = note.content; // XSS 風險在這裡，但只是為了預覽長度
        const textContentPreview = tempDiv.textContent || tempDiv.innerText || "";
        const preview = textContentPreview.substring(0, 100) + (textContentPreview.length > 100 ? '...' : '');


        let attachmentHtml = '';
        if (note.attachment && note.attachment.path) {
            // 附件路徑應相對於 /uploads/
            const attachmentUrl = `/uploads/${note.attachment.path}`;
            attachmentHtml = `
                <div class="note-attachment">
                    附件: <a href="${encodeURI(attachmentUrl)}" target="_blank" title="下載 ${escapeHtml(note.attachment.originalName)} (${(note.attachment.size / 1024).toFixed(1)} KB)">
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
    notesContainer.innerHTML = ''; // 清空 "正在載入..."
    notesContainer.appendChild(ul);
}

async function deleteNote(noteId, noteTitle) {
    if (!confirm(`您確定要刪除記事 "${noteTitle}" 嗎？此操作無法復原。`)) {
        return;
    }
    const result = await fetchData(`/api/notes/${noteId}`, { method: 'DELETE' });
    if (result) {
        // alert(result.message || '記事已刪除。');
        displayMessage(result.message || '記事已刪除。', 'success', 'notesContainer'); // 顯示在列表上方
        // 從列表中移除該記事的 DOM 元素
        const noteElement = document.getElementById(`note-${noteId}`);
        if (noteElement) {
            noteElement.remove();
        }
        // 可選：如果列表為空，顯示提示
        const list = document.querySelector('.note-list');
        if (list && list.children.length === 0) {
            document.getElementById('notesContainer').innerHTML = '<p>目前沒有記事。 <a href="/note/new">建立您的第一篇記事！</a></p>';
        }
    } else {
        // fetchData 內部已處理錯誤訊息顯示，或這裡可以再顯示一次
        // displayMessage('刪除記事失敗。', 'error', 'notesContainer');
    }
}

// --- 記事表單頁 (note.html) ---
let isSubmittingNote = false; // 防止重複提交

function initializeRichTextEditor() {
    const toolbar = document.getElementById('richTextToolbar');
    const contentArea = document.getElementById('richContent');

    if (toolbar && contentArea) {
        toolbar.addEventListener('click', (event) => {
            const target = event.target.closest('button');
            if (target && target.dataset.command) {
                event.preventDefault(); // 防止按鈕觸發提交（如果按鈕在 form 內）
                const command = target.dataset.command;
                let value = null;
                if (command === 'createLink') {
                    value = prompt('請輸入連結網址:', 'http://');
                    if (!value) return; // 使用者取消
                }
                document.execCommand(command, false, value);
                contentArea.focus(); // 保持焦點在編輯區
            }
        });
    }
}

function setupNoteForm() {
    const noteForm = document.getElementById('noteForm');
    const richContent = document.getElementById('richContent');
    const hiddenContent = document.getElementById('hiddenContent');

    if (noteForm && richContent && hiddenContent) {
        noteForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (isSubmittingNote) return; // 防止重複提交
            isSubmittingNote = true;
            document.getElementById('saveNoteButton').disabled = true;
            document.getElementById('saveNoteButton').textContent = '儲存中...';


            // 將 contenteditable 的內容複製到隱藏的 textarea
            hiddenContent.value = richContent.innerHTML;

            const formData = new FormData(noteForm);
            const noteId = document.getElementById('noteId').value;
            const url = noteId ? `/api/notes/${noteId}` : '/api/notes';
            const method = noteId ? 'PUT' : 'POST';

            try {
                const response = await fetch(url, {
                    method: method,
                    body: formData // FormData 會自動設定 Content-Type 為 multipart/form-data
                });

                if (response.status === 401) {
                     alert('您的會話已過期或未登入，請重新登入。');
                     window.location.href = '/login';
                     return;
                }

                const result = await response.json(); // 假設伺服器總是返回 JSON

                if (response.ok) {
                    displayMessage(noteId ? '記事已成功更新！' : '記事已成功建立！', 'success', 'formMessage');
                    // 可選：延遲後跳轉回列表頁
                    setTimeout(() => { window.location.href = '/'; }, 1500);
                } else {
                    displayMessage(result.message || `操作失敗 (${response.status})`, 'error', 'formMessage');
                }
            } catch (error) {
                console.error('提交記事表單錯誤:', error);
                displayMessage('提交表單時發生網路或伺服器錯誤。', 'error', 'formMessage');
            } finally {
                isSubmittingNote = false;
                document.getElementById('saveNoteButton').disabled = false;
                document.getElementById('saveNoteButton').textContent = '儲存記事';
            }
        });
    }
}

async function loadNoteForEditing(noteId) {
    const note = await fetchData(`/api/notes/${noteId}`);
    if (note) {
        document.getElementById('title').value = note.title;
        document.getElementById('richContent').innerHTML = note.content; // XSS 風險! 應由伺服器端清理或使用更安全的渲染方式
        // document.getElementById('noteId').value = note.id; // 已由模板設定

        const currentAttachmentDiv = document.getElementById('currentAttachment');
        const removeAttachmentContainer = document.getElementById('removeAttachmentContainer');
        if (note.attachment && note.attachment.path) {
            const attachmentUrl = `/uploads/${note.attachment.path}`;
            currentAttachmentDiv.innerHTML = `
                目前附件: <a href="${encodeURI(attachmentUrl)}" target="_blank">${escapeHtml(note.attachment.originalName)}</a>
            `;
            removeAttachmentContainer.style.display = 'block';
        } else {
            currentAttachmentDiv.innerHTML = '目前沒有附件。';
            removeAttachmentContainer.style.display = 'none';
        }
    } else {
        displayMessage('無法載入記事進行編輯。', 'error', 'formMessage');
        // 可能需要禁用表單或重定向
        document.getElementById('saveNoteButton').disabled = true;
    }
}


// --- 管理員使用者管理頁 (admin.html) ---
async function loadUsersForAdmin() {
    const userListUl = document.getElementById('userList');
    if (!userListUl) return;

    const users = await fetchData('/api/admin/users');
    if (!users) {
        userListUl.innerHTML = '<li class="error-message">無法載入使用者列表。</li>';
        return;
    }

    if (users.length === 0) {
        userListUl.innerHTML = '<li>目前沒有其他使用者。</li>';
        return;
    }

    userListUl.innerHTML = ''; // 清空 "正在載入..."
    users.forEach(user => {
        const li = document.createElement('li');
        li.className = 'user-item';
        li.id = `user-admin-${user.id}`;
        li.innerHTML = `
            <span><strong>${escapeHtml(user.username)}</strong> (ID: ${user.id}, 角色: ${escapeHtml(user.role)})</span>
            ${user.username !== 'admin' ? // 不允許刪除主要的 'admin' 帳號 (或當前登入的管理員)
                `<button class="danger" onclick="deleteUserByAdmin('${user.id}', '${escapeHtml(user.username)}')">刪除</button>`
                : '<span style="font-size:0.8em; color:#777;">(預設管理員)</span>'
            }
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

            // 簡單的前端驗證
            if (!data.username || data.username.trim() === '') {
                displayMessage('使用者名稱不能為空。', 'error', 'adminMessages');
                return;
            }
            if (data.role === 'admin' && (!data.password || data.password.trim() === '')) {
                displayMessage('管理員的密碼不能為空。', 'error', 'adminMessages');
                return;
            }


            const result = await fetchData('/api/admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (result && result.id) { // 假設成功時伺服器返回包含 id 的使用者物件
                displayMessage(`使用者 "${escapeHtml(result.username)}" 已成功建立。`, 'success', 'adminMessages');
                addUserForm.reset();
                loadUsersForAdmin(); // 重新載入列表
            } else if (result && result.message) { // 伺服器返回錯誤訊息
                 displayMessage(result.message, 'error', 'adminMessages');
            } else {
                // fetchData 內部可能已處理，或這裡再顯示通用錯誤
                // displayMessage('建立使用者失敗。請檢查伺服器日誌。', 'error', 'adminMessages');
            }
        });
    }
}

async function deleteUserByAdmin(userId, username) {
    if (!confirm(`您確定要刪除使用者 "${username}" (ID: ${userId}) 嗎？此操作將同時刪除該使用者的所有記事和附件，且無法復原。`)) {
        return;
    }

    // 防止管理員刪除自己 (雖然伺服器端也有檢查)
    // const currentAdminId = document.body.dataset.adminId; // 假設有此屬性
    // if (userId === currentAdminId) {
    //     displayMessage('管理員不能刪除自己的帳號。', 'error', 'adminMessages');
    //     return;
    // }

    const result = await fetchData(`/api/admin/users/${userId}`, { method: 'DELETE' });
    if (result && result.message) {
        displayMessage(result.message, 'success', 'adminMessages');
        loadUsersForAdmin(); // 重新載入列表
    } else if (result && result.error) { // 假設錯誤時返回 { error: "message" }
        displayMessage(result.error, 'error', 'adminMessages');
    } else {
        // fetchData 內部可能已處理
    }
}

// --- 初始化邏輯 (如果頁面載入時就需要執行) ---
// (已移至各 HTML 檔案的 script 標籤中，以便傳遞伺服器端渲染的變數)
// document.addEventListener('DOMContentLoaded', () => {
//     const path = window.location.pathname;
//     if (path === '/' || path === '/index.html') {
//         // loadNotes(); // 已在 index.html 中呼叫
//     } else if (path.startsWith('/note/')) {
//         // initializeRichTextEditor(); // 已在 note.html 中呼叫
//         // setupNoteForm(); // 已在 note.html 中呼叫
//         // const urlParams = new URLSearchParams(window.location.search);
//         // const noteId = urlParams.get('id');
//         // if (noteId) {
//         //     loadNoteForEditing(noteId); // 已在 note.html 中呼叫
//         // }
//     } else if (path === '/admin/users') {
//         // loadUsersForAdmin(); // 已在 admin.html 中呼叫
//         // setupAdminUserForm(); // 已在 admin.html 中呼叫
//     }

//     // 通用登出按鈕 (如果頁面上有)
//     const logoutButton = document.getElementById('logoutButton');
//     if (logoutButton) {
//         logoutButton.addEventListener('click', handleLogout);
//     }
// });
