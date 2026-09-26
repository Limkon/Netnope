// public/js/main.js - 客户端 JavaScript 逻辑 (网密度色彩 & 全功能增强版)

// --- 全局变量 ---
let currentUsernameGlobal = '访客'; 
let currentUserRoleGlobal = 'anonymous'; 
let currentAdminIdGlobal = ''; 
let currentUserIdGlobal = ''; 
let savedRange = null; 
let currentArticleListPage = 1;
let currentArticleListSearch = '';
let currentArticleListCategory = 'all';

// --- 通用通讯与提示函数 ---
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
        if (document.getElementById('statsMessageArea')) msgElementId = 'statsMessageArea';
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

// --- 统一高密度科技导航栏构建系统 ---
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

    if (!navContainer) return;

    const currentPath = window.location.pathname;

    // 构建现代科技导航栏
    let navHtml = '';

    // 1. 首页链接
    const isHomeActive = (currentPath === '/' || currentPath === '/index.html') ? 'active' : '';
    navHtml += `<a href="/" class="nav-link ${isHomeActive}">首页</a>`;

    // 2. 根据权限显示“发表文章”
    if (currentUserRoleGlobal === 'consultant' || currentUserRoleGlobal === 'admin') {
        const isNewActive = (currentPath === '/article/new') ? 'active' : '';
        navHtml += `<a href="/article/new" class="nav-link ${isNewActive}">发表文章</a>`;
    }

    // 3. 管理中心链接（登录用户可见）
    if (currentUserRoleGlobal !== 'anonymous') {
        const isMgmtActive = (currentPath === '/management') ? 'active' : '';
        navHtml += `<a href="/management" class="nav-link ${isMgmtActive}">管理中心</a>`;
    }

    // 4. 管理员专属快捷入口
    if (currentUserRoleGlobal === 'admin') {
        const isStatsActive = (currentPath === '/admin/stats') ? 'active' : '';
        navHtml += `<a href="/admin/stats" class="nav-link ${isStatsActive}">访问统计</a>`;
    }

    // 5. 用户状态与登入/登出区域
    if (currentUserRoleGlobal === 'anonymous') {
        navHtml += `<span class="welcome-user">访客模式</span>`;
        navHtml += `<a href="/login" class="button-action" style="padding: 0.35rem 0.85rem; min-height: 32px; font-size: 0.85rem;">登录</a>`;
        navHtml += `<a href="/register" class="nav-link">注册</a>`;
    } else {
        navHtml += `<span class="welcome-user">在线: <strong id="usernameDisplayInNav">${escapeHtml(currentUsernameGlobal)}</strong></span>`;
        navHtml += `<button id="navLogoutButton" class="button-danger" style="padding: 0.35rem 0.85rem; min-height: 32px; font-size: 0.85rem;">登出</button>`;
    }

    navContainer.innerHTML = navHtml;

    // 绑定导航内的登出事件
    const navLogoutBtn = document.getElementById('navLogoutButton');
    if (navLogoutBtn) {
        navLogoutBtn.addEventListener('click', handleLogout);
    }

    // 处理页面中其他独立的登出按钮
    document.querySelectorAll('#logoutButton:not([data-listener-attached])').forEach(button => {
        button.addEventListener('click', handleLogout);
        button.setAttribute('data-listener-attached', 'true');
    });
}

async function handleLogout() {
    if (!confirm("您确定要登出系统吗？")) return;
    try {
        await fetchData('/logout', { method: 'POST' });
        window.location.href = '/login?logged_out=true';
    } catch (error) {
        console.error('登出请求错误:', error);
        window.location.href = '/login'; 
    }
}

// --- 统计数据加载 ---
async function loadPublicStats() {
    const statsSpan = document.getElementById('traffic-stats-views');
    if (!statsSpan) return;
    const data = await fetchData('/api/stats');
    if (data && data.totalViews !== undefined) {
        statsSpan.textContent = data.totalViews.toLocaleString('zh-CN');
    } else {
        statsSpan.textContent = 'N/A';
    }
}

async function loadDetailedStats() {
    displayMessage('正在加载详细统计... (网密度日志计算中)', 'info', 'statsMessageArea');
    const data = await fetchData('/api/admin/stats');
    
    if (!data) {
        displayMessage('加载统计失败。', 'error', 'statsMessageArea');
        return;
    }
    
    displayMessage('', 'info', 'statsMessageArea');

    const totalCachedEl = document.getElementById('stats-total-views-cached');
    const totalLogEl = document.getElementById('stats-total-views-log');
    const uniqueEl = document.getElementById('stats-unique-visitors');
    
    if (totalCachedEl) totalCachedEl.textContent = (data.cachedTotalViews || 0).toLocaleString('zh-CN');
    if (totalLogEl) totalLogEl.textContent = (data.totalViewsLog || 0).toLocaleString('zh-CN');
    if (uniqueEl) uniqueEl.textContent = (data.uniqueVisitors || 0).toLocaleString('zh-CN');

    const renderList = (elementId, dataObject, titleElementId, titlePrefix) => {
        const listElement = document.getElementById(elementId);
        const titleElement = document.getElementById(titleElementId);
        if (!listElement) return;
        
        const entries = Object.entries(dataObject || {});
        if (entries.length === 0) {
            listElement.innerHTML = '<li>暂无数据记录。</li>';
            return;
        }

        listElement.innerHTML = '';
        entries.forEach(([key, value]) => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${escapeHtml(key)}</span> <span class="count">${value.toLocaleString('zh-CN')}</span>`;
            listElement.appendChild(li);
        });
        
        if (titleElement) {
            titleElement.textContent = `${titlePrefix} (Top ${entries.length})`;
        }
    };
    
    renderList('stats-by-page-list', data.byPage, 'stats-by-page-title', '按页面浏览');
    renderList('stats-by-date-list', data.byDate, 'stats-by-date-title', '按日期浏览');
    renderList('stats-by-referrer-list', data.byReferrer, 'stats-by-referrer-title', '按来源');
}

// --- 文章列表、分类、搜索与置顶系统 ---
function renderCategoryFilter(categories, selectedCategory) {
    const categorySelect = document.getElementById('categoryFilterSelect');
    if (!categorySelect) return;
    categorySelect.innerHTML = '<option value="all">所有分类</option>';
    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = escapeHtml(category);
        if (category === selectedCategory) {
            option.selected = true;
        }
        categorySelect.appendChild(option);
    });
}

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
            a.href = '#'; 
            a.dataset.page = pageNumber;
            a.addEventListener('click', (e) => {
                e.preventDefault();
                currentArticleListPage = pageNumber; 
                loadArticles(searchTerm, pageNumber, category);
            });
        } else {
            a.href = '#';
            a.onclick = (e) => e.preventDefault(); 
        }
        li.appendChild(a);
        return li;
    };

    ul.appendChild(createPageItem('«', currentPage - 1, currentPage === 1));

    let startPage = Math.max(1, currentPage - 3);
    let endPage = Math.min(totalPages, currentPage + 3);
    if (currentPage - 3 < 1) { endPage = Math.min(totalPages, 1 + 6); }
    if (currentPage + 3 > totalPages) { startPage = Math.max(1, totalPages - 6); }

    if (startPage > 1) {
        ul.appendChild(createPageItem('1', 1));
        if (startPage > 2) { ul.appendChild(createPageItem('...', null, true)); }
    }

    for (let i = startPage; i <= endPage; i++) {
        ul.appendChild(createPageItem(i, i, false, i === currentPage));
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) { ul.appendChild(createPageItem('...', null, true)); }
        ul.appendChild(createPageItem(totalPages, totalPages));
    }

    ul.appendChild(createPageItem('»', currentPage + 1, currentPage === totalPages));
    paginationContainer.appendChild(ul);
}

async function loadArticles(searchTerm = '', page = 1, category = 'all') { 
    const articlesContainer = document.getElementById('articlesContainer'); 
    const globalMessageArea = document.getElementById('globalMessageArea');
    const clearSearchButton = document.getElementById('clearSearchButton');

    currentArticleListPage = page;
    currentArticleListSearch = searchTerm;
    currentArticleListCategory = category;

    if (globalMessageArea) displayMessage('', 'info', 'globalMessageArea');
    if (!articlesContainer) return;

    articlesContainer.innerHTML = '<p style="text-align: center; color: var(--cyber-cyan); padding: 30px;">⚡ 正在加载文章列表中...</p>'; 

    const params = new URLSearchParams();
    if (searchTerm) params.set('search', searchTerm);
    if (page > 1) params.set('page', page);
    if (category && category !== 'all') params.set('category', category);

    const apiUrl = `/api/articles?${params.toString()}`; 
    const data = await fetchData(apiUrl);

    const paginationContainer = document.getElementById('paginationContainer');
    if (paginationContainer) paginationContainer.innerHTML = '';

    if (!data || !data.articles) {
        articlesContainer.innerHTML = `<p class="error-message">无法加载文章。${searchTerm ? '请尝试清除搜索。' : '请检查网络连接或稍后再试。'}</p>`;
        if (searchTerm && clearSearchButton) clearSearchButton.style.display = 'inline-flex';
        return;
    }

    if (data.categories) {
        renderCategoryFilter(data.categories, category);
    }

    const articles = Array.isArray(data.articles) ? data.articles : [];
    if (articles.length === 0) {
        let noArticlesMessage = `<p style="padding: 20px 0; text-align: center; color: var(--text-muted);">暂无文章发表。`;
        if (searchTerm) noArticlesMessage = `<p style="padding: 20px 0; text-align: center; color: var(--text-muted);">未找到与“${escapeHtml(searchTerm)}”相关的文章。`;
        if (category && category !== 'all') noArticlesMessage += ` (分类: "${escapeHtml(category)}")`;
        noArticlesMessage += '</p>';
        articlesContainer.innerHTML = noArticlesMessage;
        if ((searchTerm || (category && category !== 'all')) && clearSearchButton) {
            clearSearchButton.style.display = 'inline-flex';
        } else if (clearSearchButton) {
            clearSearchButton.style.display = 'none';
        }
        return;
    }

    const ul = document.createElement('ul');
    ul.className = 'note-list';

    articles.forEach(article => {
        const li = document.createElement('li');
        li.className = 'note-item';
        li.id = `article-${article.id}`;
        
        // 置顶样式标记
        if (article.isPinned) {
            li.classList.add('pinned');
        }

        let ownerInfo = (article.ownerUsername) ? `<span class="note-owner">由 <strong>${escapeHtml(article.ownerUsername)}</strong> 发布</span>` : '';
        if (currentUserRoleGlobal === 'consultant' && article.userId === currentUserIdGlobal && article.status === 'draft') {
            ownerInfo += ` <span class="article-status-draft">草稿箱</span>`;
        }

        let titleHtml = escapeHtml(article.title);
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = article.content; 
        const textContentForPreview = tempDiv.textContent || tempDiv.innerText || ""; 
        let contentPreviewHtml = escapeHtml(textContentForPreview.substring(0, 160) + (textContentForPreview.length > 160 ? '...' : ''));

        if (searchTerm) {
            try {
                const regex = new RegExp(`(${escapeHtml(searchTerm).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                titleHtml = titleHtml.replace(regex, '<mark style="background: rgba(0,210,255,0.3); color:#fff; padding: 2px 4px; border-radius: 3px;">$1</mark>');
                contentPreviewHtml = contentPreviewHtml.replace(regex, '<mark style="background: rgba(0,210,255,0.3); color:#fff; padding: 2px 4px; border-radius: 3px;">$1</mark>');
            } catch (e) {
                console.warn("高亮词解析异常:", e);
            }
        }

        let attachmentHtml = '';
        if (article.attachment && article.attachment.path) { 
            const attachmentUrl = `/uploads/${encodeURIComponent(article.attachment.path)}`;
            attachmentHtml = `<div class="note-attachment">📎 附件: <a href="${attachmentUrl}" target="_blank" title="下载 ${escapeHtml(article.attachment.originalName)}">${escapeHtml(article.attachment.originalName)}</a></div>`;
        }

        // 管理按钮权限
        let actionsHtml = '';
        const canManageArticle = (currentUserRoleGlobal === 'admin') || 
                                 (currentUserRoleGlobal === 'consultant' && article.userId === currentUserIdGlobal);

        if (canManageArticle) { 
            const pinActionButton = (currentUserRoleGlobal === 'admin') ? `
                <button 
                    class="button-action" 
                    style="background: ${article.isPinned ? 'linear-gradient(135deg, #ffb703, #fb8500)' : 'rgba(255,255,255,0.1)'}; 
                           border-color: ${article.isPinned ? '#ffb703' : 'rgba(255,255,255,0.2)'}; 
                           color: ${article.isPinned ? '#0b0f19' : '#fff'}; font-weight: bold;"
                    onclick="togglePinStatus('${article.id}', ${article.isPinned})">
                    ${article.isPinned ? '★ 取消置顶' : '☆ 置顶文章'}
                </button>
            ` : '';

            actionsHtml = `
                <div class="note-actions">
                    <a href="/article/edit?id=${article.id}" class="button-action">编辑</a>
                    <button class="button-danger" onclick="deleteArticle('${article.id}', '${escapeHtml(article.title)}')">删除</button>
                    ${pinActionButton}
                </div>`;
        }

        const titleLink = `<a href="/article/view?id=${article.id}" class="note-title-link">${titleHtml}</a>`;
        const categoryHtml = article.category ? `<span class="article-category">🏷️ ${escapeHtml(article.category)}</span>` : '';
        const pinBadgeHtml = article.isPinned ? ` <span class="article-pinned-badge">★ 置顶推荐</span>` : '';

        li.innerHTML = `
            <div>
                <h3>${titleLink} ${pinBadgeHtml}</h3>
                <div class="note-meta">
                    ${categoryHtml}
                    ${ownerInfo}
                    <span>更新于: ${new Date(article.updatedAt).toLocaleString('zh-CN')}</span>
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

    renderPagination(data.totalPages, data.currentPage, searchTerm, category);

    if ((searchTerm || (category && category !== 'all')) && clearSearchButton) {
        clearSearchButton.style.display = 'inline-flex';
    } else if (clearSearchButton) {
        clearSearchButton.style.display = 'none';
    }
}

// 切换文章置顶状态 (Admin)
let isTogglingPin = false;
async function togglePinStatus(articleId, isCurrentlyPinned) {
    if (isTogglingPin) return;
    const actionText = isCurrentlyPinned ? '取消置顶' : '置顶';
    if (!confirm(`确认要将此文章【${actionText}】吗？`)) return;

    isTogglingPin = true;
    displayMessage(`正在${actionText}文章...`, 'info', 'globalMessageArea');

    const result = await fetchData(`/api/admin/articles/${articleId}/pin`, { 
        method: 'PUT'
    });

    if (result && result.message) {
        displayMessage(result.message, 'success', 'globalMessageArea');
        await loadArticles(currentArticleListSearch, currentArticleListPage, currentArticleListCategory);
    }
    isTogglingPin = false;
}

async function deleteArticle(articleId, articleTitle) { 
    if (!confirm(`您确定要删除文章 "${articleTitle}" 吗？此操作将连带删除附件与全部评论，且无法恢复。`)) return;
    const result = await fetchData(`/api/articles/${articleId}`, { method: 'DELETE' }); 
    if (result && result.message) {
        displayMessage(result.message, 'success', 'globalMessageArea');
        loadArticles(currentArticleListSearch, currentArticleListPage, currentArticleListCategory); 
    }
}

// --- 富文本编辑器实现 ---
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
                alert('请选择有效的图片文件。');
            }
        });
    }
}

function setupArticleForm() { 
    const articleForm = document.getElementById('articleForm');
    const richContent = document.getElementById('richContent');
    const hiddenContent = document.getElementById('hiddenContent');
    const saveButton = document.getElementById('saveArticleButton');

    if (articleForm && richContent && hiddenContent && saveButton) {
        articleForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (isSubmittingNote) return; 
            isSubmittingNote = true;
            saveButton.disabled = true; 
            saveButton.textContent = '保存中...';

            hiddenContent.value = richContent.innerHTML;
            const formData = new FormData(articleForm);
            if (!formData.has('content') || formData.get('content') === '') {
                 formData.set('content', richContent.innerHTML); 
            }

            // 处理置顶参数
            const isPinnedCheckbox = document.getElementById('isPinned');
            if (isPinnedCheckbox) {
                formData.set('isPinned', isPinnedCheckbox.checked ? 'true' : 'false');
            }

            const articleId = document.getElementById('articleId').value;
            const url = articleId ? `/api/articles/${articleId}` : '/api/articles';
            const method = articleId ? 'PUT' : 'POST';

            displayMessage('', 'info', 'formMessage');
            const result = await fetchData(url, { method: method, body: formData });
            if (result) {
                if (result.id && result.title) {
                    displayMessage(articleId ? '文章已成功更新！' : '文章已成功发布！', 'success', 'formMessage');
                    setTimeout(() => { window.location.href = '/'; }, 1200);
                } else if (result.message) {
                    displayMessage(result.message, 'error', 'formMessage');
                }
            }
            isSubmittingNote = false;
            saveButton.disabled = false; 
            saveButton.textContent = '保存文章';
        });
    }
}

async function loadArticleForEditing(articleId) { 
    const article = await fetchData(`/api/articles/${articleId}`); 
    const saveButton = document.getElementById('saveArticleButton');
    if (article) {
        document.getElementById('title').value = article.title;
        document.getElementById('richContent').innerHTML = article.content;
        document.getElementById('category').value = article.category || ''; 
        document.getElementById('status').value = article.status || 'draft';
        
        const isPinnedCheckbox = document.getElementById('isPinned');
        if (isPinnedCheckbox) {
            isPinnedCheckbox.checked = !!article.isPinned;
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
        displayMessage('无法加载指定文章进行编辑。', 'error', 'formMessage');
        if(saveButton) saveButton.disabled = true;
    }
}

// --- 评论系统 ---
async function loadComments(articleId) {
    const commentsContainer = document.getElementById('commentsContainer');
    if (!commentsContainer) return;
    const commentsData = await fetchData(`/api/articles/${articleId}/comments`);
    const commentsList = document.getElementById('commentsList');
    if (!commentsList) return;

    if (!commentsData) {
        commentsList.innerHTML = '<li class="error-message">评论加载失败。</li>';
        return;
    }
    const comments = Array.isArray(commentsData) ? commentsData : [];
    if (comments.length === 0) {
        commentsList.innerHTML = '<li style="color: var(--text-muted);">暂无评论，来发表第一条见解吧。</li>';
    } else {
        commentsList.innerHTML = '';
        comments.forEach(comment => {
            const li = document.createElement('li');
            li.className = 'comment-item';
            li.id = `comment-${comment.id}`;
            let deleteButton = '';
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
            contentInput.value = ''; 
            await loadComments(articleId);
        } else if (result && result.message) {
            displayMessage(result.message, 'error', 'commentMessage');
        }
        commentButton.disabled = false;
        commentButton.textContent = '提交评论';
    });
}

async function deleteComment(commentId) {
    if (!confirm('确定要删除此条评论吗？')) return;
    const result = await fetchData(`/api/comments/${commentId}`, { method: 'DELETE' });
    if (result && result.message) {
        displayMessage(result.message, 'success', 'commentMessage');
        const commentElement = document.getElementById(`comment-${commentId}`);
        if (commentElement) commentElement.remove();
    }
}

// --- 管理员专属用户与配置 ---
async function loadUsersForAdmin(currentAdminId) { 
    const userListUl = document.getElementById('userList');
    if (!userListUl) return;
    userListUl.innerHTML = '<li>正在加载用户列表中...</li>';
    const usersData = await fetchData('/api/admin/users');
    if (!usersData) {
        userListUl.innerHTML = '<li class="error-message">加载用户失败。</li>';
        return;
    }
    const users = Array.isArray(usersData) ? usersData : [];
    userListUl.innerHTML = '';
    users.forEach(user => {
        const li = document.createElement('li');
        li.className = 'user-item';
        li.id = `user-admin-${user.id}`;
        const userInfoSpan = document.createElement('span');
        let roleDisplay = escapeHtml(user.role);
        if (user.role === 'admin') roleDisplay = '管理员 (admin)';
        else if (user.role === 'consultant') roleDisplay = '咨询师 (consultant)';
        else if (user.role === 'member') roleDisplay = '会员 (member)';
        else if (user.role === 'anonymous') roleDisplay = '匿名 (anyone)';

        userInfoSpan.innerHTML = `<strong>${escapeHtml(user.username)}</strong> (角色: ${roleDisplay})`;
        li.appendChild(userInfoSpan);

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'user-item-actions';
        if (user.id !== currentAdminId) { 
            const resetPassButton = document.createElement('button');
            resetPassButton.className = 'button-action';
            resetPassButton.textContent = '重设密码';
            resetPassButton.onclick = () => showPasswordResetForm(user.id, user.username, li, user.role); 
            actionsDiv.appendChild(resetPassButton);

            if (user.username !== 'anyone') {
                const deleteButton = document.createElement('button');
                deleteButton.className = 'button-danger';
                deleteButton.textContent = '删除';
                deleteButton.onclick = () => deleteUserByAdmin(user.id, user.username);
                actionsDiv.appendChild(deleteButton);
            }
        } else {
            const selfSpan = document.createElement('span');
            selfSpan.style.fontSize = '0.85em';
            selfSpan.style.color = 'var(--cyber-blue)';
            selfSpan.textContent = '[当前登录账户]';
            actionsDiv.appendChild(selfSpan);
        }
        li.appendChild(actionsDiv);
        userListUl.appendChild(li);
    });
}

function showPasswordResetForm(userId, username, listItemElement, userRole) { 
    const existingForms = document.querySelectorAll('.password-edit-form-container');
    existingForms.forEach(form => form.remove());

    const formContainer = document.createElement('div');
    formContainer.className = 'password-edit-form-container';
    formContainer.style.marginTop = '10px';
    formContainer.style.padding = '15px';
    formContainer.style.border = '1px solid var(--border-color)';
    formContainer.style.borderRadius = '6px';
    formContainer.style.backgroundColor = 'var(--bg-surface-elevated)';

    const form = document.createElement('form');
    form.id = `passwordEditForm-${userId}`;
    const saveButton = document.createElement('button');
    saveButton.type = 'submit';
    saveButton.className = 'button-action';
    saveButton.textContent = '保存新密码';
    saveButton.style.marginRight = '10px';

    form.onsubmit = (event) => handleUpdatePasswordByAdmin(event, userId, username, saveButton); 

    const currentUserP = document.createElement('p');
    currentUserP.innerHTML = `正在为用户 <strong>${escapeHtml(username)}</strong> (${userRole}) 重设密码：`;
    currentUserP.style.marginBottom = '10px';

    const passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordInput.name = 'newPassword';
    passwordInput.placeholder = "输入新密码";
    passwordInput.style.marginBottom = '10px';

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'button-action button-cancel';
    cancelButton.textContent = '取消';
    cancelButton.onclick = () => formContainer.remove();

    form.appendChild(currentUserP);
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

async function handleUpdatePasswordByAdmin(event, userId, username, saveButtonElement) {
    event.preventDefault();
    if(saveButtonElement) {
        saveButtonElement.disabled = true;
        saveButtonElement.textContent = '保存中...';
    }
    const form = event.target;
    const newPassword = form.newPassword.value;
    displayMessage('正在更新密码...', 'info', 'adminMessages');
    const result = await fetchData(`/api/admin/users/${userId}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: newPassword })
    });
    if (result && result.message) {
        displayMessage(result.message, 'success', 'adminMessages');
        const formContainer = form.closest('.password-edit-form-container');
        if (formContainer) formContainer.remove();
    }
    if(saveButtonElement) {
        saveButtonElement.disabled = false;
        saveButtonElement.textContent = '保存新密码';
    }
}

function setupAdminUserForm() {
    const addUserForm = document.getElementById('addUserForm');
    const addUserButton = addUserForm ? addUserForm.querySelector('button[type="submit"]') : null;
    if (addUserForm && addUserButton) {
        addUserForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            addUserButton.disabled = true;
            addUserButton.textContent = '创建中...';
            const formData = new FormData(addUserForm);
            const data = Object.fromEntries(formData.entries());

            const result = await fetchData('/api/admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (result && result.id) {
                displayMessage(`用户 "${escapeHtml(result.username)}" 已成功创建。`, 'success', 'adminMessages');
                addUserForm.reset();
                loadUsersForAdmin(currentAdminIdGlobal);
            }
            addUserButton.disabled = false;
            addUserButton.textContent = '新建用户';
        });
    }
}

function setupSiteSettingsForm() {
    const settingsForm = document.getElementById('siteSettingsForm');
    const saveButton = document.getElementById('saveSettingsButton');
    if (settingsForm && saveButton) {
        settingsForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            saveButton.disabled = true;
            saveButton.textContent = '保存中...';
            const articlesPerPage = document.getElementById('articlesPerPage').value;
            const result = await fetchData('/api/admin/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ articlesPerPage: articlesPerPage })
            });
            if (result && result.message) {
                 displayMessage(result.message, 'success', 'adminMessages');
            }
            saveButton.disabled = false;
            saveButton.textContent = '保存设置';
        });
    }
}

async function deleteUserByAdmin(userId, username) {
    if (!confirm(`确定要删除用户 "${username}" 吗？此操作不可撤销。`)) return;
    const result = await fetchData(`/api/admin/users/${userId}`, { method: 'DELETE' });
    if (result && result.message) {
        displayMessage(result.message, 'success', 'adminMessages');
        loadUsersForAdmin(currentAdminIdGlobal);
    }
}

// --- 修改自身密码 ---
function setupChangeOwnPasswordForm() {
    const form = document.getElementById('changeOwnPasswordForm');
    const submitButton = document.getElementById('submitChangePassword');
    if (form && submitButton) {
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const currentPassword = document.getElementById('currentPassword').value;
            const newPassword = document.getElementById('newPasswordUser').value;
            const confirmNewPassword = document.getElementById('confirmNewPasswordUser').value;

            if (newPassword !== confirmNewPassword) {
                displayMessage('两次输入的新密码不一致。', 'error', 'changePasswordMessage');
                return;
            }

            submitButton.disabled = true;
            submitButton.textContent = '提交中...';

            const result = await fetchData('/api/users/me/password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword, newPassword, confirmNewPassword })
            });

            if (result && result.message) {
                displayMessage(result.message + ' 正在重新登录...', 'success', 'changePasswordMessage');
                setTimeout(() => { handleLogout(); }, 1500);
            }
            submitButton.disabled = false;
            submitButton.textContent = '确认修改';
        });
    }
}

// --- 页面生命周期与初始化路由 ---
document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;

    const usernameFromServer = (typeof currentUsernameFromServer !== 'undefined' && currentUsernameFromServer !== "{{username}}") 
        ? currentUsernameFromServer 
        : (typeof currentUsername !== 'undefined' && currentUsername !== "{{username}}") 
        ? currentUsername : '访客';
    const roleFromServer = (typeof currentUserRoleFromServer !== 'undefined' && currentUserRoleFromServer !== "{{userRole}}") 
        ? currentUserRoleFromServer : 'anonymous';
    const userIdFromServer = (typeof currentUserIdFromServer !== 'undefined' && currentUserIdFromServer !== "{{userId}}") 
        ? currentUserIdFromServer : ''; 
    const adminIdFromServer = (typeof currentAdminId !== 'undefined' && currentAdminId !== "{{adminUserId}}") 
        ? currentAdminId : '';
    const articleIdFromServer = (typeof currentArticleId !== 'undefined' && currentArticleId !== "{{articleId}}") 
        ? currentArticleId : '';

    currentAdminIdGlobal = adminIdFromServer; 
    currentUserIdGlobal = userIdFromServer;   

    // 1. 初始化全站科技导航栏
    setupNavigation(usernameFromServer, roleFromServer, userIdFromServer);

    // 2. 页脚数据与微光统计挂载
    const footer = document.querySelector('footer');
    const copyright = document.getElementById('copyrightFooter'); 
    if (footer && copyright) {
        const statsElement = document.createElement('p');
        statsElement.style.margin = '6px 0';
        statsElement.innerHTML = `🌐 全站实时访问量: <strong id="traffic-stats-views" style="color: var(--cyber-cyan);">...</strong> 次`; 
        footer.insertBefore(statsElement, copyright);
    }

    // 3. 页面分支逻辑
    if (path === '/' || path === '/index.html') {
        const urlParams = new URLSearchParams(window.location.search);
        currentArticleListSearch = urlParams.get('search') || '';
        currentArticleListPage = parseInt(urlParams.get('page'), 10) || 1;
        currentArticleListCategory = urlParams.get('category') || 'all';

        const searchInput = document.getElementById('searchInput');
        const categorySelect = document.getElementById('categoryFilterSelect');
        const clearSearchButton = document.getElementById('clearSearchButton');
        const searchForm = document.getElementById('searchForm');

        if (searchInput && currentArticleListSearch) {
            searchInput.value = currentArticleListSearch;
        }

        loadArticles(currentArticleListSearch, currentArticleListPage, currentArticleListCategory); 

        if (searchForm && searchInput) {
            searchForm.addEventListener('submit', (e) => {
                e.preventDefault();
                loadArticles(searchInput.value.trim(), 1, categorySelect ? categorySelect.value : 'all'); 
            });
        }
        if (categorySelect) {
            categorySelect.addEventListener('change', () => {
                loadArticles(searchInput ? searchInput.value.trim() : '', 1, categorySelect.value);
            });
        }
        if (clearSearchButton) {
            clearSearchButton.addEventListener('click', () => {
                if (searchInput) searchInput.value = '';
                if (categorySelect) categorySelect.value = 'all'; 
                loadArticles('', 1, 'all'); 
            });
        }
    } else if (path.startsWith('/article/')) {
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
        loadUsersForAdmin(currentAdminIdGlobal); 
        setupAdminUserForm();
        setupSiteSettingsForm(); 
    } else if (path === '/change-password') {
        setupChangeOwnPasswordForm();
    } else if (path === '/admin/stats') {
        loadDetailedStats();
    }

    // 4. 全局拉取实时流量计数
    loadPublicStats();
});
