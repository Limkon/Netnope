// public/js/main.js - 客户端 JavaScript 逻辑 (简体中文)

// --- 全局变量 ---
let currentUsernameGlobal = '访客'; 
let currentUserRoleGlobal = 'anonymous'; 
let currentAdminIdGlobal = ''; 
let currentUserIdGlobal = ''; 
let savedRange = null; // 用于保存富文本编辑器的选区

// --- 通用函数 ---
async function fetchData(url, options = {}) {
    try {
        const response = await fetch(url, options);
        if (response.status === 401 && !(currentUserRoleGlobal === 'anonymous' && (options.method === 'GET' || !options.method))) {
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
            if ((response.status === 401 || response.status === 403) && currentUserRoleGlobal !== 'anonymous') {
                 // 减少打扰，特别是当403是预期行为时 (例如 member 尝试访问 admin 页面)
                 // alert('操作未授权或会话已过期，请重新登录。');
                 console.warn("操作未授权或会话已过期。");
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
        if (document.getElementById('commentMessage')) msgElementId = 'commentMessage'; 
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

function setupNavigation(username, role, userId) {
    const isValidUser = username && username !== "{{username}}" && username !== "访客";
    const isValidRole = role && role !== "{{userRole}}" && role !== "anonymous";
    const isValidUserId = userId && userId !== "{{userId}}";

    currentUsernameGlobal = isValidUser ? username : '访客';
    currentUserRoleGlobal = isValidRole ? role : 'anonymous';
    currentUserIdGlobal = isValidUserId ? userId : '';

    const navContainer = document.getElementById('mainNav');
    const usernameDisplaySpan = document.getElementById('usernameDisplay'); 

    if (usernameDisplaySpan) {
        usernameDisplaySpan.textContent = escapeHtml(currentUsernameGlobal);
    }
    
    if (!navContainer) { 
        document.querySelectorAll('#logoutButton:not([data-listener-attached])').forEach(button => {
            if (!button.closest('#mainNav')) { 
                button.addEventListener('click', handleLogout);
                button.setAttribute('data-listener-attached', 'true');
            }
        });
        return;
    }

    let navHtml = `<span class="welcome-user">欢迎, <strong id="usernameDisplayInNav">${escapeHtml(currentUsernameGlobal)}</strong>!</span>`;
    if (currentUserRoleGlobal === 'anonymous') {
        navHtml += `<a href="/login" class="button-action">登录</a>`;
        navHtml += `<a href="/register" class="button-action" style="background-color: #6c757d; border-color: #6c757d;">注册</a>`;
    } else {
        // 返回列表
        if (window.location.pathname !== '/' && window.location.pathname !== '/index.html') {
             navHtml += `<a href="/" class="button-action">返回列表</a>`;
        }
        
        // 发表文章 (仅限 consultant)
        if (currentUserRoleGlobal === 'consultant') {
            if (window.location.pathname !== '/article/new' && !window.location.pathname.startsWith('/article/edit')) {
                 navHtml += `<a href="/article/new" class="button-action">发表文章</a>`; // 修改
            }
        }

        // 修改密码 (所有登录用户)
        if (window.location.pathname !== '/change-password') {
            navHtml += `<a href="/change-password" class="button-action">修改密码</a>`;
        }

        // 管理用户 (仅限 admin)
        if (currentUserRoleGlobal === 'admin') {
            // Admin 也可以发表文章
            if (window.location.pathname !== '/article/new' && !window.location.pathname.startsWith('/article/edit')) {
                 navHtml += `<a href="/article/new" class="button-action">发表文章</a>`; // 新增
            }
            if (window.location.pathname !== '/admin/users') {
                navHtml += `<a href="/admin/users" id="adminUsersLink" class="button-action">管理用户</a>`;
            }
        }
        
        navHtml += `<button id="logoutButtonInNav" class="button-danger">登出</button>`;
    }
    navContainer.innerHTML = navHtml;
    
    const logoutButtonInNav = document.getElementById('logoutButtonInNav');
    if (logoutButtonInNav && !logoutButtonInNav.hasAttribute('data-listener-attached')) {
        logoutButtonInNav.addEventListener('click', handleLogout);
        logoutButtonInNav.setAttribute('data-listener-attached', 'true'); 
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

// --- 文章 (Article) 相关 ---

async function loadArticles(searchTerm = '') { // 重命名
    const articlesContainer = document.getElementById('articlesContainer'); // 重命名
    const globalMessageArea = document.getElementById('globalMessageArea');
    const clearSearchButton = document.getElementById('clearSearchButton');

    if (globalMessageArea) displayMessage('', 'info', 'globalMessageArea');
    if (!articlesContainer) return;
    articlesContainer.innerHTML = '<p>正在加载文章...</p>'; // 修改

    let apiUrl = '/api/articles'; // 修改
    if (searchTerm) {
        apiUrl += `?search=${encodeURIComponent(searchTerm)}`;
    }

    const articlesData = await fetchData(apiUrl);
    if (!articlesData) {
        articlesContainer.innerHTML = `<p class="error-message">无法加载文章。${searchTerm ? '请尝试其他关键字或清除搜索。' : '请检查网络连接或稍后再试。'}</p>`;
        if (searchTerm && clearSearchButton) clearSearchButton.style.display = 'inline-flex';
        return;
    }
    
    const articles = Array.isArray(articlesData) ? articlesData : [];
    if (articles.length === 0) {
        let noArticlesMessage = `<p>${searchTerm ? `没有找到与“${escapeHtml(searchTerm)}”相关的文章。` : '当前没有文章。'}`;
        // 只有 consultant 角色会看到创建提示
        if (currentUserRoleGlobal === 'consultant' && !searchTerm) { 
            noArticlesMessage += ' <a href="/article/new" class="button-action">发表您的第一篇文章！</a>'; // 修改
        }
        noArticlesMessage += '</p>';
        articlesContainer.innerHTML = noArticlesMessage;
        if (searchTerm && clearSearchButton) { 
            clearSearchButton.style.display = 'inline-flex';
        } else if (clearSearchButton) {
            clearSearchButton.style.display = 'none';
        }
        return;
    }

    const ul = document.createElement('ul');
    ul.className = 'note-list'; // CSS class 保持不变
    articles.forEach(article => {
        const li = document.createElement('li');
        li.className = 'note-item'; // CSS class 保持不变
        li.id = `article-${article.id}`;
        
        // 咨询师、会员、匿名者看列表时，都显示作者
        let ownerInfo = (article.ownerUsername) ? `<span class="note-owner">(作者: ${escapeHtml(article.ownerUsername)})</span>` : '';
        // 如果是咨询师看自己的文章列表，区分状态
        if (currentUserRoleGlobal === 'consultant' && article.userId === currentUserIdGlobal && article.status === 'draft') {
            ownerInfo += ` <span class="article-status-draft">(草稿)</span>`;
        }
        
        let titleHtml = escapeHtml(article.title);
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = article.content; 
        const textContentForPreview = tempDiv.textContent || tempDiv.innerText || ""; 
        let contentPreviewHtml = escapeHtml(textContentForPreview.substring(0, 150) + (textContentForPreview.length > 150 ? '...' : ''));

        if (searchTerm) {
            const regex = new RegExp(`(${escapeHtml(searchTerm).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
            titleHtml = titleHtml.replace(regex, '<mark>$1</mark>');
            contentPreviewHtml = contentPreviewHtml.replace(regex, '<mark>$1</mark>');
        }
        
        let attachmentHtml = '';
        if (article.attachment && article.attachment.path) { 
            const attachmentUrl = `/uploads/${encodeURIComponent(article.attachment.path)}`;
            attachmentHtml = `<div class="note-attachment">附件: <a href="${attachmentUrl}" target="_blank" title="下载 ${escapeHtml(article.attachment.originalName)}">${escapeHtml(article.attachment.originalName)}</a></div>`;
        }
        
        // 权限：Admin 或 (Consultant 且是作者) 才能操作
        let actionsHtml = '';
        if (currentUserRoleGlobal === 'admin' || (currentUserRoleGlobal === 'consultant' && article.userId === currentUserIdGlobal)) { 
            actionsHtml = `
                <div class="note-actions">
                    <a href="/article/edit?id=${article.id}" class="button-action">编辑</a>
                    <button class="button-danger" onclick="deleteArticle('${article.id}', '${escapeHtml(article.title)}')">删除</button>
                </div>`;
        }
        
        const titleLink = `<a href="/article/view?id=${article.id}" class="note-title-link">${titleHtml}</a>`;
        const categoryHtml = article.category ? `<span class="article-category">分类: ${escapeHtml(article.category)}</span>` : '';

        li.innerHTML = `
            <div>
                <h3>${titleLink} ${ownerInfo}</h3>
                <div class="note-meta">
                    ${categoryHtml}
                    最后更新: ${new Date(article.updatedAt).toLocaleString('zh-CN')}
                    (创建于: ${new Date(article.createdAt).toLocaleString('zh-CN')})
                </div>
                <div class="note-content-preview">${contentPreviewHtml}</div>
                ${attachmentHtml}
            </div>
            ${actionsHtml}
        `;
        ul.appendChild(li);
    });
    articlesContainer.innerHTML = '';
    articlesContainer.appendChild(ul);
    if (searchTerm && clearSearchButton) {
        clearSearchButton.style.display = 'inline-flex';
    } else if (clearSearchButton) {
        clearSearchButton.style.display = 'none';
    }
}

async function deleteArticle(articleId, articleTitle) { // 重命名
    if (!confirm(`您确定要删除文章 "${articleTitle}" 吗？此操作将删除文章、附件和所有评论，无法复原。`)) return;
    const result = await fetchData(`/api/articles/${articleId}`, { method: 'DELETE' }); // 修改
    if (result && result.message) {
        displayMessage(result.message, 'success', 'globalMessageArea');
        const searchInput = document.getElementById('searchInput');
        loadArticles(searchInput ? searchInput.value.trim() : ''); // 修改
    } else if (result) {
        displayMessage('文章已删除，但服务器未返回确认消息。正在刷新列表...', 'info', 'globalMessageArea');
        const searchInput = document.getElementById('searchInput');
        loadArticles(searchInput ? searchInput.value.trim() : ''); // 修改
    }
}

// (initializeRichTextEditor 函数保持不变)
let isSubmittingNote = false;
function initializeRichTextEditor() {
    const toolbar = document.getElementById('richTextToolbar');
    const contentArea = document.getElementById('richContent');
    if (!toolbar || !contentArea) return;

    function saveSelection() {
        if (window.getSelection && window.getSelection().rangeCount > 0) {
            const selection = window.getSelection();
            if (contentArea.contains(selection.anchorNode) && contentArea.contains(selection.focusNode)) {
                return selection.getRangeAt(0).cloneRange();
            }
        }
        return null;
    }

    function restoreSelection(range) {
        if (range) {
            contentArea.focus(); 
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
        } else {
            contentArea.focus(); 
        }
    }
    
    contentArea.addEventListener('focus', () => { savedRange = saveSelection(); });
    contentArea.addEventListener('blur', () => { savedRange = saveSelection(); });
    contentArea.addEventListener('click', () => { savedRange = saveSelection(); });
    contentArea.addEventListener('keyup', () => { savedRange = saveSelection(); });
    toolbar.addEventListener('mousedown', () => { savedRange = saveSelection(); });


    const fontNameSelector = document.getElementById('fontNameSelector');
    const fontSizeSelector = document.getElementById('fontSizeSelector');
    const foreColorPicker = document.getElementById('foreColorPicker');
    const insertLocalImageButton = document.getElementById('insertLocalImageButton');
    const imageUploadInput = document.getElementById('imageUploadInput');

    toolbar.addEventListener('click', (event) => {
        const targetButton = event.target.closest('button[data-command]');
        if (targetButton) {
            event.preventDefault();
            const command = targetButton.dataset.command;
            
            restoreSelection(savedRange); 

            if (command === 'createLink') {
                const selection = window.getSelection();
                let defaultUrl = 'https://';
                if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
                    let parentNode = selection.getRangeAt(0).commonAncestorContainer;
                    if (parentNode.nodeType !== Node.ELEMENT_NODE) {
                        parentNode = parentNode.parentNode;
                    }
                    if (parentNode && parentNode.tagName === 'A') {
                        defaultUrl = parentNode.getAttribute('href') || 'https://';
                    }
                }

                savedRange = saveSelection(); 
                const url = prompt('请输入链接网址:', defaultUrl);
                
                contentArea.focus(); 
                restoreSelection(savedRange);

                if (url && url.trim() !== "" && url.trim().toLowerCase() !== 'https://') {
                    document.execCommand('createLink', false, url.trim());
                } else if (url !== null) { 
                    alert("您输入的链接无效或已取消。");
                }
            } else {
                document.execCommand(command, false, null); 
            }
            
            savedRange = saveSelection(); 
        }
    });

    if (fontNameSelector) {
        fontNameSelector.addEventListener('change', (event) => {
            restoreSelection(savedRange);
            document.execCommand('fontName', false, event.target.value);
            savedRange = saveSelection();
        });
    }
    if (fontSizeSelector) {
        fontSizeSelector.addEventListener('change', (event) => {
            restoreSelection(savedRange);
            document.execCommand('fontSize', false, event.target.value);
            savedRange = saveSelection();
        });
    }
    if (foreColorPicker) {
        foreColorPicker.addEventListener('input', (event) => { 
            restoreSelection(savedRange); 
            document.execCommand('foreColor', false, event.target.value);
        });
        foreColorPicker.addEventListener('change', (event) => { 
            restoreSelection(savedRange); 
            document.execCommand('foreColor', false, event.target.value);
            savedRange = saveSelection(); 
        });
    }

    if (insertLocalImageButton && imageUploadInput) {
        insertLocalImageButton.addEventListener('click', () => {
            savedRange = saveSelection(); 
            imageUploadInput.click();
        });
        imageUploadInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file && file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    restoreSelection(savedRange); 
                    document.execCommand('insertImage', false, e.target.result);
                    savedRange = saveSelection(); 
                };
                reader.readAsDataURL(file);
                imageUploadInput.value = ''; 
            } else if (file) {
                alert('请选择一个有效的图片文件 (例如 JPG, PNG, GIF)。');
            }
        });
    }
}


function setupArticleForm() { // 重命名
    const articleForm = document.getElementById('articleForm'); // 修改 ID
    const richContent = document.getElementById('richContent');
    const hiddenContent = document.getElementById('hiddenContent');
    const saveButton = document.getElementById('saveArticleButton'); // 修改 ID
    
    if (articleForm && richContent && hiddenContent && saveButton) {
        articleForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (isSubmittingNote) return; // 复用 isSubmittingNote
            isSubmittingNote = true;
            saveButton.disabled = true; saveButton.textContent = '保存中...';
            
            hiddenContent.value = richContent.innerHTML;
            const formData = new FormData(articleForm);
            
            // 确保 content 字段被正确设置 (如果富文本为空)
            if (!formData.has('content') || formData.get('content') === '') {
                 formData.set('content', richContent.innerHTML); 
            }
            
            const articleId = document.getElementById('articleId').value;
            const url = articleId ? `/api/articles/${articleId}` : '/api/articles'; // 修改
            const method = articleId ? 'PUT' : 'POST';
            
            displayMessage('', 'info', 'formMessage');
            const result = await fetchData(url, { method: method, body: formData });
            
            if (result) {
                if (result.id && result.title) {
                    displayMessage(articleId ? '文章已成功更新！' : '文章已成功创建！', 'success', 'formMessage'); // 修改
                    setTimeout(() => { window.location.href = '/'; }, 1500);
                } else if (result.message) displayMessage(result.message, 'error', 'formMessage');
                else if (typeof result === 'string' && result.includes("成功")) {
                     displayMessage(result, 'success', 'formMessage');
                     setTimeout(() => { window.location.href = '/'; }, 1500);
                }
            }
            
            isSubmittingNote = false;
            saveButton.disabled = false; saveButton.textContent = '保存文章'; // 修改
        });
    }
}

async function loadArticleForEditing(articleId) { // 重命名
    const article = await fetchData(`/api/articles/${articleId}`); // 修改
    const saveButton = document.getElementById('saveArticleButton'); // 修改 ID
    
    if (article) {
        document.getElementById('title').value = article.title;
        document.getElementById('richContent').innerHTML = article.content;
        document.getElementById('category').value = article.category || ''; // 新增
        document.getElementById('status').value = article.status || 'draft'; // 新增
        
        const currentAttachmentDiv = document.getElementById('currentAttachment');
        const removeAttachmentContainer = document.getElementById('removeAttachmentContainer');
        if (article.attachment && article.attachment.path) {
            const attachmentUrl = `/uploads/${encodeURIComponent(article.attachment.path)}`;
            currentAttachmentDiv.innerHTML = `当前附件: <a href="${attachmentUrl}" target="_blank">${escapeHtml(article.attachment.originalName)}</a>`;
            removeAttachmentContainer.style.display = 'block';
            document.getElementById('removeAttachmentCheckbox').checked = false;
        } else {
            currentAttachmentDiv.innerHTML = '当前没有附件。';
            removeAttachmentContainer.style.display = 'none';
        }
    } else {
        displayMessage('无法加载文章进行编辑。', 'error', 'formMessage');
        if(saveButton) saveButton.disabled = true;
    }
}

// --- 评论 (Comment) 相关 (新增) ---

async function loadComments(articleId) {
    const commentsContainer = document.getElementById('commentsContainer');
    if (!commentsContainer) return;
    commentsContainer.innerHTML = '<p>正在加载评论...</p>';
    
    const commentsData = await fetchData(`/api/articles/${articleId}/comments`);
    if (!commentsData) {
        commentsContainer.innerHTML = '<p class="error-message">无法加载评论。</p>';
        return;
    }
    
    const comments = Array.isArray(commentsData) ? commentsData : [];
    const commentsList = document.getElementById('commentsList');
    if (!commentsList) return;
    
    if (comments.length === 0) {
        commentsList.innerHTML = '<li>暂无评论。</li>';
    } else {
        commentsList.innerHTML = '';
        comments.forEach(comment => {
            const li = document.createElement('li');
            li.className = 'comment-item';
            li.id = `comment-${comment.id}`;
            
            let deleteButton = '';
            // 权限：Admin 或 评论作者
            if (comment.canDelete) {
                 deleteButton = `<button class="button-danger button-small" onclick="deleteComment('${comment.id}')">删除</button>`;
            }

            li.innerHTML = `
                <div class="comment-meta">
                    <strong>${escapeHtml(comment.username)}</strong>
                    <span>(${new Date(comment.createdAt).toLocaleString('zh-CN')})</span>
                </div>
                <div class="comment-content">${escapeHtml(comment.content)}</div>
                <div class="comment-actions">${deleteButton}</div>
            `;
            commentsList.appendChild(li);
        });
    }
}

async function setupCommentForm(articleId) {
    const commentForm = document.getElementById('commentForm');
    const commentButton = document.getElementById('submitCommentButton');
    if (!commentForm || !commentButton) return;

    commentForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        commentButton.disabled = true;
        commentButton.textContent = '提交中...';
        
        const contentInput = document.getElementById('commentContent');
        const content = contentInput.value;
        
        displayMessage('', 'info', 'commentMessage');
        if (!content || content.trim() === '') {
            displayMessage('评论内容不能为空。', 'error', 'commentMessage');
            commentButton.disabled = false;
            commentButton.textContent = '提交评论';
            return;
        }

        const result = await fetchData(`/api/articles/${articleId}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: content })
        });

        if (result && result.id) {
            displayMessage('评论成功！', 'success', 'commentMessage');
            contentInput.value = ''; // 清空输入框
            // 动态添加新评论到列表
            const commentsList = document.getElementById('commentsList');
            if (commentsList) {
                if (commentsList.innerHTML.includes('暂无评论')) {
                    commentsList.innerHTML = '';
                }
                const li = document.createElement('li');
                li.className = 'comment-item';
                li.id = `comment-${result.id}`;
                li.innerHTML = `
                    <div class="comment-meta">
                        <strong>${escapeHtml(result.username)}</strong>
                        <span>(${new Date(result.createdAt).toLocaleString('zh-CN')})</span>
                    </div>
                    <div class
