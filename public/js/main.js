// public/js/main.js - 客户端 JavaScript 逻辑 (简体中文)

// --- 全局变量 ---
let currentUsernameGlobal = '访客'; 
let currentUserRoleGlobal = 'anonymous'; 
let currentAdminIdGlobal = ''; 
let currentUserIdGlobal = ''; 
let savedRange = null; // 用于保存富文本编辑器的选区
// (新增) 用于首页文章列表的状态
let currentArticleListPage = 1;
let currentArticleListSearch = '';
let currentArticleListCategory = 'all';

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
    // (*** 重大修改：简化导航栏 ***)
    const isValidUser = username && username !== "{{username}}" && username !== "访客";
    const isValidRole = role && role !== "{{userRole}}" && role !== "anonymous";
    const isValidUserId = userId && userId !== "{{userId}}";

    currentUsernameGlobal = isValidUser ? username : '访客';
    currentUserRoleGlobal = isValidRole ? role : 'anonymous';
    currentUserIdGlobal = isValidUserId ? userId : '';

    const navContainer = document.getElementById('mainNav');
    const usernameDisplaySpan = document.getElementById('usernameDisplay'); 

    if (usernameDisplaySpan) {
        // 适用于 admin.html 和 change-password.html 顶部的独立显示
        usernameDisplaySpan.textContent = escapeHtml(currentUsernameGlobal);
    }
    
    // (修改) 登出按钮现在在 management.html, admin.html, change-password.html 中
    // 我们需要一个通用的选择器来处理它们 (不在 mainNav 内部的)
    document.querySelectorAll('#logoutButton:not([data-listener-attached])').forEach(button => {
        if (!button.closest('#mainNav')) { 
            button.addEventListener('click', handleLogout);
            button.setAttribute('data-listener-attached', 'true');
        }
    });

    if (!navContainer) { 
        // 如果页面没有 mainNav (例如 login.html), 则退出
        return;
    }

    let navHtml = `<span class="welcome-user">欢迎, <strong id="usernameDisplayInNav">${escapeHtml(currentUsernameGlobal)}</strong>!</span>`;
    
    if (currentUserRoleGlobal === 'anonymous') {
        // 匿名用户：显示登录和注册
        navHtml += `<a href="/login" class="button-action">登录</a>`;
        navHtml += `<a href="/register" class="button-action" style="background-color: #6c757d; border-color: #6c757d;">注册</a>`;
    } else {
        // 登录用户：只显示 "返回列表" (如果不在列表页)
        if (window.location.pathname !== '/' && window.location.pathname !== '/index.html') {
             navHtml += `<a href="/" class="button-action">返回文章列表</a>`;
        }
        // (已移除) 发表文章、修改密码、管理用户、登出按钮
        // 这些现在都在 /management 页面
    }
    
    navContainer.innerHTML = navHtml;
    
    // (已移除) mainNav 内部的登出按钮逻辑
}


async function handleLogout() {
    // (无修改)
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

// --- 文章 (Article) 相关 (*** 重大修改 ***) ---

// (新增) 渲染分类过滤器
function renderCategoryFilter(categories, selectedCategory) {
    const categorySelect = document.getElementById('categoryFilterSelect');
    if (!categorySelect) return;
    
    // 保存当前值（如果存在）
    // const currentVal = selectedCategory || categorySelect.value || 'all';
    
    categorySelect.innerHTML = '<option value="all">所有分类</option>'; // 重置
    
    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = escapeHtml(category);
        if (category === selectedCategory) {
            option.selected = true;
        }
        categorySelect.appendChild(option);
    });
    // categorySelect.value = currentVal;
}

// (新增) 渲染分页控件
function renderPagination(totalPages, currentPage, searchTerm, category) {
    const paginationContainer = document.getElementById('paginationContainer');
    if (!paginationContainer) return;
    
    paginationContainer.innerHTML = '';
    if (totalPages <= 1) return;

    const ul = document.createElement('ul');
    ul.className = 'pagination';

    const createPageItem = (pageText, pageNumber, isDisabled = false, isActive = false) => {
        const li = document.createElement('li');
        li.className = 'pagination-item';
        if (isDisabled) li.classList.add('disabled');
        if (isActive) li.classList.add('active');
        
        const a = document.createElement('a');
        a.className = 'pagination-link';
        a.textContent = pageText;
        
        if (!isDisabled && !isActive && pageNumber) {
            a.href = '#'; // 使其可点击
            a.dataset.page = pageNumber;
            a.addEventListener('click', (e) => {
                e.preventDefault();
                currentArticleListPage = pageNumber; // 更新全局状态
                loadArticles(searchTerm, pageNumber, category);
            });
        } else if (isDisabled || isActive) {
            a.href = '#';
            a.onclick = (e) => e.preventDefault(); // 阻止默认行为
        }
        
        li.appendChild(a);
        return li;
    };

    // 上一页
    ul.appendChild(createPageItem('«', currentPage - 1, currentPage === 1));

    // 页码
    // (简化逻辑：最多显示 7 个页码按钮)
    let startPage = Math.max(1, currentPage - 3);
    let endPage = Math.min(totalPages, currentPage + 3);
    
    if (currentPage - 3 < 1) {
        endPage = Math.min(totalPages, 1 + 6);
    }
    if (currentPage + 3 > totalPages) {
        startPage = Math.max(1, totalPages - 6);
    }

    if (startPage > 1) {
        ul.appendChild(createPageItem('1', 1));
        if (startPage > 2) {
             ul.appendChild(createPageItem('...', null, true));
        }
    }

    for (let i = startPage; i <= endPage; i++) {
        ul.appendChild(createPageItem(i, i, false, i === currentPage));
    }

    if (endPage < totalPages) {
         if (endPage < totalPages - 1) {
             ul.appendChild(createPageItem('...', null, true));
        }
        ul.appendChild(createPageItem(totalPages, totalPages));
    }

    // 下一页
    ul.appendChild(createPageItem('»', currentPage + 1, currentPage === totalPages));

    paginationContainer.appendChild(ul);
}


// (修改) loadArticles 函数
async function loadArticles(searchTerm = '', page = 1, category = 'all') { 
    const articlesContainer = document.getElementById('articlesContainer'); 
    const globalMessageArea = document.getElementById('globalMessageArea');
    const clearSearchButton = document.getElementById('clearSearchButton');
    const categorySelect = document.getElementById('categoryFilterSelect');

    // (新增) 更新全局状态
    currentArticleListPage = page;
    currentArticleListSearch = searchTerm;
    currentArticleListCategory = category;

    if (globalMessageArea) displayMessage('', 'info', 'globalMessageArea');
    if (!articlesContainer) return;
    articlesContainer.innerHTML = '<p>正在加载文章...</p>'; 

    // (修改) 构建 API URL
    const params = new URLSearchParams();
    if (searchTerm) params.set('search', searchTerm);
    if (page > 1) params.set('page', page);
    if (category && category !== 'all') params.set('category', category);
    
    let apiUrl = `/api/articles?${params.toString()}`; 

    const data = await fetchData(apiUrl);
    
    // (修改) 清空分页
    const paginationContainer = document.getElementById('paginationContainer');
    if(paginationContainer) paginationContainer.innerHTML = '';

    if (!data || !data.articles) {
        articlesContainer.innerHTML = `<p class="error-message">无法加载文章。${searchTerm ? '请尝试其他关键字或清除搜索。' : '请检查网络连接或稍后再试。'}</p>`;
        if (searchTerm && clearSearchButton) clearSearchButton.style.display = 'inline-flex';
        return;
    }
    
    // (新增) 渲染分类过滤器 (在渲染文章之前)
    if (data.categories) {
        renderCategoryFilter(data.categories, category);
    }
    
    const articles = Array.isArray(data.articles) ? data.articles : [];
    if (articles.length === 0) {
        let noArticlesMessage = `<p>没有找到文章。`;
        if (searchTerm) noArticlesMessage = `<p>没有找到与“${escapeHtml(searchTerm)}”相关的文章。`;
        if (category && category !== 'all') noArticlesMessage += ` (在分类 "${escapeHtml(category)}" 下)`;
        
        // (修改) 提示创建文章的链接现在只在 management.html 中
        if (currentUserRoleGlobal === 'consultant' && !searchTerm && (!category || category === 'all')) { 
            // noArticlesMessage += ' <a href="/article/new" class="button-action">发表您的第一篇文章！</a>'; // (移除)
        }
        noArticlesMessage += '</p>';
        articlesContainer.innerHTML = noArticlesMessage;
        
        // (修改) 控制清除按钮的显示
        if ((searchTerm || (category && category !== 'all')) && clearSearchButton) {
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
        
        // (新增) 如果置顶，添加 .pinned class
        if (article.isPinned) {
            li.classList.add('pinned');
        }

        // (无修改) 咨询师、会员、匿名者看列表时，都显示作者
        let ownerInfo = (article.ownerUsername) ? `<span class="note-owner">(作者: ${escapeHtml(article.ownerUsername)})</span>` : '';
        // (无修改) 如果是咨询师看自己的文章列表，区分状态
        if (currentUserRoleGlobal === 'consultant' && article.userId === currentUserIdGlobal && article.status === 'draft') {
            ownerInfo += ` <span class="article-status-draft">(草稿)</span>`;
        }
        
        let titleHtml = escapeHtml(article.title);
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = article.content; 
        const textContentForPreview = tempDiv.textContent || tempDiv.innerText || ""; 
        let contentPreviewHtml = escapeHtml(textContentForPreview.substring(0, 150) + (textContentForPreview.length > 150 ? '...' : ''));

        if (searchTerm) {
            try {
                const regex = new RegExp(`(${escapeHtml(searchTerm).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                titleHtml = titleHtml.replace(regex, '<mark>$1</mark>');
                contentPreviewHtml = contentPreviewHtml.replace(regex, '<mark>$1</mark>');
            } catch (e) {
                console.warn("搜索词高亮失败:", e);
                // 失败则不进行高亮
            }
        }
        
        let attachmentHtml = '';
        if (article.attachment && article.attachment.path) { 
            const attachmentUrl = `/uploads/${encodeURIComponent(article.attachment.path)}`;
            attachmentHtml = `<div class="note-attachment">附件: <a href="${attachmentUrl}" target="_blank" title="下载 ${escapeHtml(article.attachment.originalName)}">${escapeHtml(article.attachment.originalName)}</a></div>`;
        }
        
        // (修改) 权限：Admin 或 (Consultant 且是作者) 才能操作
        let actionsHtml = '';
        if (currentUserRoleGlobal === 'admin' || (currentUserRoleGlobal === 'consultant' && article.userId === currentUserIdGlobal)) { 
            actionsHtml = `
                <div class="note-actions">
                    <a href="/article/edit?id=${article.id}" class="button-action">编辑</a>
                    <button class="button-danger" onclick="deleteArticle('${article.id}', '${escapeHtml(article.title)}')">删除</button>
                    ${currentUserRoleGlobal === 'admin' 
                        ? `<button 
                                class="button-action" 
                                style="background-color: ${article.isPinned ? '#ffc107' : '#6c757d'}; border-color: ${article.isPinned ? '#ffc107' : '#6c757d'}; color: ${article.isPinned ? '#333' : '#fff'};"
                                onclick="togglePinStatus('${article.id}', ${article.isPinned})">
                                ${article.isPinned ? '取消置顶' : '置顶'}
                           </button>` 
                        : ''}
                </div>`;
        }
        
        const titleLink = `<a href="/article/view?id=${article.id}" class="note-title-link">${titleHtml}</a>`;
        const categoryHtml = article.category ? `<span class="article-category">分类: ${escapeHtml(article.category)}</span>` : '';
        // (新增) 置顶徽章
        const pinHtml = article.isPinned ? ' <span class="article-pinned-badge">[置顶]</span>' : '';

        li.innerHTML = `
            <div>
                <h3>${titleLink} ${ownerInfo} ${pinHtml}</h3>
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
    
    // (新增) 渲染分页
    renderPagination(data.totalPages, data.currentPage, searchTerm, category);
    
    // (修改) 控制清除按钮的显示
    if ((searchTerm || (category && category !== 'all')) && clearSearchButton) {
        clearSearchButton.style.display = 'inline-flex';
    } else if (clearSearchButton) {
        clearSearchButton.style.display = 'none';
    }
}

// (新增) 切换置顶状态的函数
async function togglePinStatus(articleId, isCurrentlyPinned) {
    const actionText = isCurrentlyPinned ? '取消置顶' : '置顶';
    if (!confirm(`您确定要 ${actionText} 这篇文章吗？`)) return;

    displayMessage('正在更新置顶状态...', 'info', 'globalMessageArea');
    
    // (新增) 调用新的 API 端点
    const result = await fetchData(`/api/admin/articles/${articleId}/pin`, { 
        method: 'PUT'
    });

    if (result && result.message) {
        displayMessage(result.message, 'success', 'globalMessageArea');
        // (修改) 成功后重新加载当前列表
        loadArticles(currentArticleListSearch, currentArticleListPage, currentArticleListCategory);
    } else {
        // fetchData 内部已经处理了错误消息
    }
}


async function deleteArticle(articleId, articleTitle) { // 重命名
    if (!confirm(`您确定要删除文章 "${articleTitle}" 吗？此操作将删除文章、附件和所有评论，无法复原。`)) return;
    const result = await fetchData(`/api/articles/${articleId}`, { method: 'DELETE' }); // 修改
    if (result && result.message) {
        displayMessage(result.message, 'success', 'globalMessageArea');
        // (修改) 删除后重新加载当前页
        loadArticles(currentArticleListSearch, currentArticleListPage, currentArticleListCategory); // 修改
    } else if (result) {
        displayMessage('文章已删除，但服务器未返回确认消息。正在刷新列表...', 'info', 'globalMessageArea');
        loadArticles(currentArticleListSearch, currentArticleListPage, currentArticleListCategory); // 修改
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


function setupArticleForm() { 
    // (无修改)
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

            // (新增) FormData 不会包含未勾选的复选框，所以我们手动检查
            // (修改) 仅当 isAdminUser 为 true 时才检查
            if (typeof isAdminUser !== 'undefined' && isAdminUser) {
                const isPinnedCheckbox = document.getElementById('isPinned');
                if (isPinnedCheckbox && !isPinnedCheckbox.checked) {
                    formData.set('isPinned', 'false'); // 明确发送 false
                }
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

async function loadArticleForEditing(articleId) { 
    // (无修改)
    const article = await fetchData(`/api/articles/${articleId}`); // 修改
    const saveButton = document.getElementById('saveArticleButton'); // 修改 ID
    
    if (article) {
        document.getElementById('title').value = article.title;
        document.getElementById('richContent').innerHTML = article.content;
        document.getElementById('category').value = article.category || ''; // 新增
        document.getElementById('status').value = article.status || 'draft'; // 新增
        
        // (新增) 填充置顶复选框
        const isPinnedCheckbox = document.getElementById('isPinned');
        if (isPinnedCheckbox) {
            isPinnedCheckbox.checked = article.isPinned || false;
        }

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

// --- 评论 (Comment) 相关 (无修改) ---
async function loadComments(articleId) {
    // (无修改)
    const commentsContainer = document.getElementById('commentsContainer');
    if (!commentsContainer) return;
    // commentsContainer.innerHTML = '<p>正在加载评论...</p>'; // 由 <ul> 中的 <li> 处理
    
    const commentsData = await fetchData(`/api/articles/${articleId}/comments`);
    const commentsList = document.getElementById('commentsList');
    if (!commentsList) return;

    if (!commentsData) {
        commentsList.innerHTML = '<li class="error-message">无法加载评论。</li>';
        return;
    }
    
    const comments = Array.isArray(commentsData) ? commentsData : [];
    
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
                    <div>
                        <strong>${escapeHtml(comment.username)}</strong>
                        <span>(${new Date(comment.createdAt).toLocaleString('zh-CN')})</span>
                    </div>
                    <div class="comment-actions">${deleteButton}</div>
                </div>
                <div class="comment-content">${escapeHtml(comment.content)}</div>
            `;
            commentsList.appendChild(li);
        });
    }
}

async function setupCommentForm(articleId) {
    // (无修改)
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
                        <div>
                            <strong>${escapeHtml(result.username)}</strong>
                            <span>(${new Date(result.createdAt).toLocaleString('zh-CN')})</span>
                        </div>
                        <div class="comment-actions">
                            <button class="button-danger button-small" onclick="deleteComment('${result.id}')">删除</button>
                        </div>
                    </div>
                    <div class="comment-content">${escapeHtml(result.content)}</div>
                `;
                commentsList.appendChild(li);
            }
        } else if (result && result.message) {
            displayMessage(result.message, 'error', 'commentMessage');
        }

        commentButton.disabled = false;
        commentButton.textContent = '提交评论';
    });
}

async function deleteComment(commentId) {
    // (无修改)
    if (!confirm('您确定要删除这条评论吗？')) return;
    
    const result = await fetchData(`/api/comments/${commentId}`, { method: 'DELETE' });
    if (result && result.message) {
        displayMessage(result.message, 'success', 'commentMessage');
        const commentElement = document.getElementById(`comment-${commentId}`);
        if (commentElement) {
            commentElement.remove();
        }
        // 检查列表是否为空
        const commentsList = document.getElementById('commentsList');
        if (commentsList && commentsList.children.length === 0) { // 修复：检查子元素数量
            commentsList.innerHTML = '<li>暂无评论。</li>';
        }
    }
}


// --- Admin 相关 (loadUsersForAdmin, showPasswordResetForm, handleUpdatePasswordByAdmin, setupAdminUserForm, deleteUserByAdmin) ---

async function loadUsersForAdmin(currentAdminId) { 
    // (无修改)
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
        // 翻译角色
        let roleDisplay = escapeHtml(user.role);
        if (user.role === 'admin') roleDisplay = '管理员 (admin)';
        else if (user.role === 'consultant') roleDisplay = '咨询师 (consultant)';
        else if (user.role === 'member') roleDisplay = '会员 (member)';
        else if (user.role === 'anonymous') roleDisplay = '匿名 (anyone)';

        userInfoSpan.innerHTML = `<strong>${escapeHtml(user.username)}</strong> (ID: ${user.id}, 角色: ${roleDisplay})`;
        li.appendChild(userInfoSpan);
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'user-item-actions';
        actionsDiv.style.display = 'flex';
        actionsDiv.style.gap = '10px';
        
        // 不能操作自己
        if (user.id !== currentAdminId) { 
            // 不能删除 'anyone' 用户 (只能通过重设密码为空来模拟“禁用”)
            // 允许重设密码
            const resetPassButton = document.createElement('button');
            resetPassButton.className = 'button-action';
            resetPassButton.textContent = '重设密码';
            resetPassButton.style.padding = '0.3rem 0.6rem';
            resetPassButton.style.fontSize = '0.85rem';
            resetPassButton.onclick = () => showPasswordResetForm(user.id, user.username, li, user.role); // 传入角色
            actionsDiv.appendChild(resetPassButton);

            // 'anyone' 用户不能被删除
            if (user.username !== 'anyone') {
                const deleteButton = document.createElement('button');
                deleteButton.className = 'button-danger';
                deleteButton.textContent = '删除';
                deleteButton.onclick = () => deleteUserByAdmin(user.id, user.username);
                actionsDiv.appendChild(deleteButton);
            }
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

let isUpdatingPasswordByAdmin = false; 
function showPasswordResetForm(userId, username, listItemElement, userRole) { 
    // (无修改)
    const existingForms = document.querySelectorAll('.password-edit-form-container');
    existingForms.forEach(form => form.remove());
    const formContainer = document.createElement('div');
    formContainer.className = 'password-edit-form-container';
    // ... (样式设置保持不变)
    formContainer.style.marginTop = '10px';
    formContainer.style.padding = '15px';
    formContainer.style.border = '1px solid #ccc';
    formContainer.style.borderRadius = '4px';
    formContainer.style.backgroundColor = '#f9f9f9';
    
    const form = document.createElement('form');
    form.id = `passwordEditForm-${userId}`;
    
    const saveButton = document.createElement('button');
    saveButton.type = 'submit';
    saveButton.className = 'button-action';
    saveButton.textContent = '保存新密码';
    saveButton.style.marginRight = '10px';

    form.onsubmit = (event) => handleUpdatePasswordByAdmin(event, userId, username, saveButton); 

    const currentUserP = document.createElement('p');
    currentUserP.innerHTML = `正在为用户 <strong>${escapeHtml(username)}</strong> (角色: ${userRole}) 重设密码。`;
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
    
    // 根据角色设置 placeholder
    if (userRole === 'admin' || userRole === 'consultant') {
        passwordInput.placeholder = "管理员/咨询师密码不能为空";
    } else if (userRole === 'anonymous') {
        passwordInput.placeholder = "匿名用户无需密码";
        passwordInput.disabled = true;
    } else {
        passwordInput.placeholder = "会员密码 (可为空)";
    }
    
    passwordInput.style.marginBottom = '10px';
    passwordInput.style.width = 'calc(100% - 16px)';
    
    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'button-action button-cancel';
    cancelButton.textContent = '取消';
    cancelButton.onclick = () => formContainer.remove();
    form.appendChild(currentUserP);
    
    // 匿名用户不能修改密码
    if (userRole !== 'anonymous') {
        form.appendChild(passwordLabel);
        form.appendChild(passwordInput);
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'form-actions';
        actionsDiv.appendChild(saveButton);
        actionsDiv.appendChild(cancelButton);
        form.appendChild(actionsDiv);
    } else {
        passwordInput.value = ''; // 确保为空
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'form-actions';
        actionsDiv.appendChild(cancelButton);
        form.appendChild(actionsDiv);
    }

    formContainer.appendChild(form);
    listItemElement.appendChild(formContainer);
    if (userRole !== 'anonymous') {
        passwordInput.focus();
    }
}

async function handleUpdatePasswordByAdmin(event, userId, username, saveButtonElement) {
    // (无修改)
    event.preventDefault();
    if (isUpdatingPasswordByAdmin) return;

    isUpdatingPasswordByAdmin = true;
    if(saveButtonElement) {
        saveButtonElement.disabled = true;
        saveButtonElement.textContent = '保存中...';
    }

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

    isUpdatingPasswordByAdmin = false;
    if(saveButtonElement) {
        saveButtonElement.disabled = false;
        saveButtonElement.textContent = '保存新密码';
    }
}

let isAdminAddingUser = false; 
function setupAdminUserForm() {
    // (无修改)
    const addUserForm = document.getElementById('addUserForm');
    const addUserButton = addUserForm ? addUserForm.querySelector('button[type="submit"]') : null;

    if (addUserForm && addUserButton) {
        addUserForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (isAdminAddingUser) return; 

            isAdminAddingUser = true;
            addUserButton.disabled = true;
            addUserButton.textContent = '正在添加...';

            const formData = new FormData(addUserForm);
            const data = Object.fromEntries(formData.entries());
            
            if (!data.username || data.username.trim() === '') {
                displayMessage('用户名不能为空。', 'error', 'adminMessages');
                isAdminAddingUser = false;
                addUserButton.disabled = false;
                addUserButton.textContent = '新建用户';
                return;
            }
            // 咨询师或管理员的密码不能为空
            if ((data.role === 'admin' || data.role === 'consultant') && (!data.password || data.password.trim() === '')) {
                displayMessage('管理员或咨询师的密码不能为空。', 'error', 'adminMessages');
                isAdminAddingUser = false;
                addUserButton.disabled = false;
                addUserButton.textContent = '新建用户';
                return;
            }
            // 'anyone' 用户（用于匿名访问）
            if (data.username.trim() === 'anyone') {
                data.role = 'anonymous'; // 强制角色
                data.password = ''; // 强制无密码
            }

            displayMessage('', 'info', 'adminMessages'); 
            const result = await fetchData('/api/admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (result && result.id) {
                displayMessage(`用户 "${escapeHtml(result.username)}" (角色: ${result.role}) 已成功创建。`, 'success', 'adminMessages');
                addUserForm.reset();
                loadUsersForAdmin(currentAdminIdGlobal);
            } else if (result && result.message) {
                 displayMessage(result.message, 'error', 'adminMessages');
            }
            
            isAdminAddingUser = false;
            addUserButton.disabled = false;
            addUserButton.textContent = '新建用户';
        });
    }
}

// (新增) 设置站点设置表单
let isSavingSettings = false;
function setupSiteSettingsForm() {
    const settingsForm = document.getElementById('siteSettingsForm');
    const saveButton = document.getElementById('saveSettingsButton');
    
    if (settingsForm && saveButton) {
        settingsForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (isSavingSettings) return;

            isSavingSettings = true;
            saveButton.disabled = true;
            saveButton.textContent = '保存中...';
            
            const articlesPerPageInput = document.getElementById('articlesPerPage');
            const articlesPerPage = articlesPerPageInput.value;

            displayMessage('', 'info', 'adminMessages'); 
            
            const result = await fetchData('/api/admin/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ articlesPerPage: articlesPerPage })
            });

            if (result && result.message) {
                 displayMessage(result.message, 'success', 'adminMessages');
                 if(result.settings && result.settings.articlesPerPage) {
                     articlesPerPageInput.value = result.settings.articlesPerPage;
                 }
            }
            
            isSavingSettings = false;
            saveButton.disabled = false;
            saveButton.textContent = '保存设置';
        });
    }
}


async function deleteUserByAdmin(userId, username) {
    // (无修改)
    if (username === 'anyone') {
        alert("不能删除 'anyone' 用户。");
        return;
    }
    if (!confirm(`您确定要删除用户 "${username}" (ID: ${userId}) 吗？此操作将同时删除该用户的所有文章、附件和评论，且无法复原。`)) return;
    displayMessage('', 'info', 'adminMessages');
    const result = await fetchData(`/api/admin/users/${userId}`, { method: 'DELETE' });
    if (result && result.message && (result.message.includes("成功") || !result.message.toLowerCase().includes("错误") && !result.message.toLowerCase().includes("失败"))) {
        displayMessage(result.message, 'success', 'adminMessages');
        loadUsersForAdmin(currentAdminIdGlobal);
    } else if (result && result.message) {
         displayMessage(result.message, 'error', 'adminMessages');
    }
}

// --- 注册 (Registration) ---

let isRegistering = false;
function setupRegistrationForm() {
    // (无修改)
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
            // 注册时密码不能为空 (默认为 member)
            if (!password) {
                 displayMessage('密码不能为空。', 'error', messageContainerId); return;
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

// --- 修改密码 (Change Password) ---

let isChangingOwnPassword = false;
function setupChangeOwnPasswordForm() {
    // (无修改)
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
            if (newPassword !== confirmNewPassword) {
                displayMessage('新密码和确认密码不匹配。', 'error', messageContainerId);
                return;
            }
            // 检查当前角色 (使用已在 setupNavigation 中设置的全局变量)
            if ((currentUserRoleGlobal === 'admin' || currentUserRoleGlobal === 'consultant') && newPassword.trim() === '') {
                displayMessage('管理员或咨询师的新密码不能为空。', 'error', messageContainerId);
                return;
            }

            isChangingOwnPassword = true;
            submitButton.disabled = true;
            submitButton.textContent = '正在提交...';
            const result = await fetchData('/api/users/me/password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword, newPassword, confirmNewPassword })
            });
            if (result && result.message && result.message.includes("成功")) {
                displayMessage(result.message + ' 您需要重新登录。', 'success', messageContainerId);
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

// --- DOMContentLoaded (页面加载) (*** 重大修改 ***) ---

document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;
    
    // --- (无修改) ---
    // 正确读取由服务器在内联 <script> 标签中定义的 *全局* 变量
    // (例如 index.html, article.html, view-article.html 等页面底部定义的变量)
    const usernameFromServer = (typeof currentUsernameFromServer !== 'undefined' && currentUsernameFromServer !== "{{username}}") 
        ? currentUsernameFromServer 
        : (typeof currentUsername !== 'undefined' && currentUsername !== "{{username}}") // 兼容 change-password.html
        ? currentUsername
        : '访客';
        
    const roleFromServer = (typeof currentUserRoleFromServer !== 'undefined' && currentUserRoleFromServer !== "{{userRole}}") 
        ? currentUserRoleFromServer 
        : 'anonymous';
        
    const userIdFromServer = (typeof currentUserIdFromServer !== 'undefined' && currentUserIdFromServer !== "{{userId}}") 
        ? currentUserIdFromServer 
        : ''; 
        
    const adminIdFromServer = (typeof currentAdminId !== 'undefined' && currentAdminId !== "{{adminUserId}}") 
        ? currentAdminId 
        : '';
        
    const articleIdFromServer = (typeof currentArticleId !== 'undefined' && currentArticleId !== "{{articleId}}") 
        ? currentArticleId 
        : '';
    // --- (无修改结束) ---

    // 设置 main.js 内部的全局变量（供其他函数使用）
    currentAdminIdGlobal = adminIdFromServer; 
    currentUserIdGlobal = userIdFromServer;   
    
    // 1. 设置全局导航 (*** 已被修改为简化版 ***)
    setupNavigation(usernameFromServer, roleFromServer, userIdFromServer);
    
    // (*** 新增：动态添加页脚管理链接 ***)
    if (currentUserRoleGlobal !== 'anonymous') {
        const footer = document.querySelector('footer');
        // (修改) 使用 ID 选择器
        const copyright = document.getElementById('copyrightFooter'); 
        
        if (footer && copyright) {
            const managementLink = document.createElement('p');
            managementLink.style.marginBottom = '10px';
            managementLink.style.marginTop = '0';
            managementLink.innerHTML = `<a href="/management" style="color: #5f6368; text-decoration: underline;">后台管理</a>`;
            
            // 插入到版权信息之前
            footer.insertBefore(managementLink, copyright);
            
            // (新增) 确保版权信息没有上外边距
            copyright.style.marginTop = '0';
        }
    }


    // 2. 根据不同页面路径执行特定的加载函数
    if (path === '/' || path === '/index.html') {
        // (*** 修改：处理分页和过滤 ***)
        const urlParams = new URLSearchParams(window.location.search);
        // (修改) 初始化全局状态
        currentArticleListSearch = urlParams.get('search') || '';
        currentArticleListPage = parseInt(urlParams.get('page'), 10) || 1;
        currentArticleListCategory = urlParams.get('category') || 'all';

        const searchInput = document.getElementById('searchInput');
        const categorySelect = document.getElementById('categoryFilterSelect');

        if (searchInput && currentArticleListSearch) {
            searchInput.value = currentArticleListSearch;
        }
        if (categorySelect && currentArticleListCategory) {
            // (注意: 此时分类下拉框还是空的，我们会在 loadArticles 第一次返回时填充它并设置正确的值)
            // categorySelect.value = currentArticleListCategory; 
        }
        
        // (修改) 首次加载
        loadArticles(currentArticleListSearch, currentArticleListPage, currentArticleListCategory); 
        
        const clearSearchButton = document.getElementById('clearSearchButton');
        const searchForm = document.getElementById('searchForm');

        if (searchForm && searchInput && categorySelect && clearSearchButton) {
             // 搜索表单提交
             searchForm.addEventListener('submit', (event) => {
                event.preventDefault();
                const searchTerm = searchInput.value.trim();
                const category = categorySelect.value;
                // (修改) 搜索时重置为第1页
                loadArticles(searchTerm, 1, category); 
            });
            
            // (新增) 分类选择器变更
            categorySelect.addEventListener('change', () => {
                const searchTerm = searchInput.value.trim();
                const category = categorySelect.value;
                // (修改) 切换分类时重置为第1页
                loadArticles(searchTerm, 1, category);
            });

            // 清除按钮
            clearSearchButton.addEventListener('click', () => {
                searchInput.value = '';
                categorySelect.value = 'all'; // (新增) 重置分类
                loadArticles('', 1, 'all'); // (修改) 加载第一页
            });
        }
    } else if (path.startsWith('/article/')) { 
        // (无修改)
        if (path.startsWith('/article/new') || path.startsWith('/article/edit')) { 
            initializeRichTextEditor();
            setupArticleForm(); 
            const urlParams = new URLSearchParams(window.location.search);
            const articleId = urlParams.get('id');
            if (articleId && path.startsWith('/article/edit')) { 
                loadArticleForEditing(articleId); 
            }
        } else if (path.startsWith('/article/view') && articleIdFromServer) { 
            loadComments(articleIdFromServer); 
            setupCommentForm(articleIdFromServer); 
        }
    } else if (path === '/admin/users') {
        // (修改)
        // (admin.html 页面底部的内联脚本会定义 currentAdminId)
        loadUsersForAdmin(currentAdminIdGlobal); 
        setupAdminUserForm();
        setupSiteSettingsForm(); // (新增)
    } else if (path === '/register') {
        // (无修改)
        setupRegistrationForm();
    } else if (path === '/change-password') {
        // (无修改)
        // (change-password.html 页面底部的内联脚本会定义 currentUsername)
        setupChangeOwnPasswordForm();
    }
    // login.html 和 management.html 不需要 main.js 执行特定操作
    // (management.html 上的登出按钮由 setupNavigation 中的通用选择器处理)
});
