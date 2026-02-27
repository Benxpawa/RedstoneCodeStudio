/**
 * 界面交互：标签页切换、模态弹窗、状态栏提示、节点面板过滤
 * 依赖：constants.js (litegraphCanvas, editors)
 */

// 节点面板搜索


// 按关键词过滤左侧节点面板
// 无输入时恢复默认展开状态
function filterNodes(query) {
    const q = query.trim().toLowerCase();
    const detailsList = document.querySelectorAll('#node-panel details');

    if (!q) {
        detailsList.forEach((details, index) => {
            details.open = (index === 0);
            details.querySelectorAll('.node-item').forEach(item => {
                item.style.display = '';
            });
        });
        return;
    }

    detailsList.forEach(details => {
        const items = details.querySelectorAll('.node-item');
        let sectionHasMatch = false;
        items.forEach(item => {
            const match = item.textContent.toLowerCase().includes(q);
            item.style.display = match ? '' : 'none';
            if (match) sectionHasMatch = true;
        });
        details.open = sectionHasMatch;
    });
}

// 标签页切换


// 切换顶部主标签页
// 切换到 logic 时自适应画布尺寸；切换到 source 时刷新 Ace 编辑器

function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-' + tab).classList.add('active');
    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + tab).classList.add('active');

    if (tab === 'logic') {
        setTimeout(() => {
            const c = document.getElementById('blocklyDiv');
            if (litegraphCanvas && c) litegraphCanvas.resize(c.clientWidth, c.clientHeight);
        }, 50);
    }
    if (tab === 'source') {
        Object.values(editors).forEach(e => { if (e) e.resize(); });
    }
}


// 切换源码面板中的子标签（java / yml / cfg / pom）
function switchSrcTab(name) {
    document.querySelectorAll('.src-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('srctab-' + name).classList.add('active');
    document.querySelectorAll('.src-editor-pane').forEach(p => p.classList.remove('active'));
    document.getElementById('pane-' + name).classList.add('active');
    if (editors[name]) { setTimeout(() => editors[name].resize(), 30); }
}

// 状态栏 


// 在状态栏显示短暂提示消息
function showStatus(msg) {
    const el = document.getElementById('status');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(showStatus._timer);
    showStatus._timer = setTimeout(() => el.classList.add('hidden'), 5000);
}

// 模态弹窗


// 显示自定义模态弹窗
// @param {string} title   标题
// @param {string} message 内容
// @param {'success'|'error'|'info'} type 类型
function showModalDialog(title, message, type = 'info') {
    const modal = document.getElementById('customModal');
    if (!modal) return;

    const titleEl = modal.querySelector('.modal-title');
    const msgEl   = document.getElementById('modalMessage');
    if (titleEl) titleEl.textContent = title;
    if (msgEl)   msgEl.textContent   = message;

    modal.classList.remove('success', 'error', 'info');
    modal.classList.add(type === 'success' || type === 'error' ? type : 'info');
    modal.classList.remove('hidden');
}

// 关闭模态弹窗
function closeModal() {
    const modal = document.getElementById('customModal');
    if (modal) modal.classList.add('hidden');
}
