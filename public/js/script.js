// public/js/script.js
document.addEventListener('DOMContentLoaded', function () {
    const editorContainer = document.getElementById('editor-container');

    if (editorContainer) {
        const quill = new Quill('#editor-container', {
            modules: {
                toolbar: [
                    [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
                    [{ 'font': [] }],
                    [{ 'size': ['small', false, 'large', 'huge'] }],
                    ['bold', 'italic', 'underline', 'strike'],
                    [{ 'color': [] }, { 'background': [] }],
                    [{ 'list': 'ordered'}, { 'list': 'bullet' }, { 'list': 'check' }],
                    [{ 'script': 'sub'}, { 'script': 'super' }],
                    [{ 'indent': '-1'}, { 'indent': '+1' }],
                    [{ 'direction': 'rtl' }],
                    [{ 'align': [] }],
                    ['link', 'image', 'blockquote', 'code-block', 'video'],
                    ['clean']
                ],
            },
            theme: 'snow',
            placeholder: '在此输入您的精彩内容...'
        });

        const noteForm = document.getElementById('note-form'); // 主记事内容表单
        if (noteForm) {
            const quillContentInput = document.getElementById('quill-content');
            // 尝试从隐藏输入字段或现有编辑器内容加载 (如果EJS已渲染)
            if (quillContentInput && quillContentInput.value && quillContentInput.value.trim() !== '' && quillContentInput.value !== '<p><br></p>') {
                // quill.clipboard.dangerouslyPasteHTML(0, quillContentInput.value);
            } else {
                // 如果 editor-container 本身包含由 EJS 渲染的内容，Quill会自动加载它
            }

            noteForm.addEventListener('submit', function() {
                if (quillContentInput) {
                    quillContentInput.value = quill.root.innerHTML;
                    if (quill.getText().trim().length === 0 && quill.root.innerHTML === '<p><br></p>') {
                         // quillContentInput.value = ''; // 可选：将空的Quill内容视为空字符串
                    }
                }
            });
        }

        // 自定义 Quill 图片上传处理
        quill.getModule('toolbar').addHandler('image', () => {
            selectLocalImage(quill);
        });
    }

    // ----- 客户端确认删除 -----
    // 为所有具有 `data-confirm-delete` 属性的表单添加提交确认
    const deleteForms = document.querySelectorAll('form[onsubmit*="confirm"]');
    deleteForms.forEach(form => {
        form.addEventListener('submit', function(event) {
            // onsubmit 属性中的 confirm 已经处理了，这里可以留空或做额外处理
            // const message = this.getAttribute('data-confirm-delete') || '确定要执行此操作吗？';
            // if (!confirm(message)) {
            //     event.preventDefault();
            // }
        });
    });

});

function selectLocalImage(quillInstance) {
    const input = document.createElement('input');
    input.setAttribute('type', 'file');
    input.setAttribute('accept', 'image/*');
    input.click();

    input.onchange = async () => {
        const file = input.files[0];
        if (file) {
            const formData = new FormData();
            formData.append('imageFile', file); // 与 routes/notes.js 中 uploadImage.single('imageFile') 对应

            const range = quillInstance.getSelection(true);
            quillInstance.insertText(range.index, ' [上传中...] ', 'user');

            try {
                const response = await fetch('/notes/upload/image', { // 确保此路径正确
                    method: 'POST',
                    body: formData
                });

                const currentSelection = quillInstance.getSelection(true);
                if (currentSelection) {
                    const loadingTextIndex = quillInstance.getText(0, currentSelection.index + 1).lastIndexOf(' [上传中...] ');
                    if (loadingTextIndex !== -1 && loadingTextIndex + ' [上传中...] '.length === currentSelection.index ) {
                         quillInstance.deleteText(loadingTextIndex, ' [上传中...] '.length, 'user');
                    }
                }

                if (response.ok) {
                    const result = await response.json();
                    const imageIndex = quillInstance.getSelection(true).index;
                    quillInstance.insertEmbed(imageIndex, 'image', result.imageUrl);
                    quillInstance.setSelection(imageIndex + 1);
                } else {
                    const errorResult = await response.json();
                    console.error('Image upload failed:', errorResult.error || response.statusText);
                    alert('图片上传失败: ' + (errorResult.error || '服务器错误，请检查控制台。'));
                }
            } catch (error) {
                const currentSelectionOnError = quillInstance.getSelection(true);
                 if(currentSelectionOnError) {
                    const loadingTextIndexOnError = quillInstance.getText(0, currentSelectionOnError.index + 1).lastIndexOf(' [上传中...] ');
                     if (loadingTextIndexOnError !== -1 && loadingTextIndexOnError + ' [上传中...] '.length === currentSelectionOnError.index ) {
                         quillInstance.deleteText(loadingTextIndexOnError, ' [上传中...] '.length, 'user');
                    }
                }
                console.error('Error uploading image:', error);
                alert('图片上传时发生网络错误或服务器无响应。');
            }
        }
    };
}

// 如果将来需要更复杂的客户端交互（例如 AJAX 提交附件），可以在这里添加更多函数。
// 例如，显示文件上传进度，或在不刷新页面的情况下更新附件列表。
