'use strict';

function _requireUserOnline(action) {
    if (typeof requireOnline === 'function' && !requireOnline(action)) return false;
    return true;
}

function openMyUploads() {
    if (!_requireUserOnline('查看我的上传')) return;
    if (!AuthStore.isLoggedIn()) { openAuthModal('login'); return; }
    document.getElementById('myUploadsModal')?.classList.remove('hidden');
    loadMyUploads();
}

function closeMyUploads() {
    document.getElementById('myUploadsModal')?.classList.add('hidden');
}

async function loadMyUploads() {
    if (!_requireUserOnline('加载我的上传')) return;
    _upShow('loading');
    try {
        const result = await AuthAPI.securePost('/api/market/my_uploads.php', {});

        if (result === null || result === undefined) {
            throw new Error('服务端响应为空，请检查 APP_SECRET 前后端是否一致');
        }
        if (typeof result !== 'object' || typeof result.then === 'function') {
            throw new Error('响应解密异常，请检查 APP_SECRET 配置');
        }
        if (!result.success) {
            throw new Error(result.message || `服务端返回失败（无错误信息）`);
        }

        _renderMyUploads(result.templates || []);
    } catch (err) {
        _upShow('error');
        const el = document.getElementById('up-error-msg');
        if (el) el.textContent = err.message;
        console.error('[MyUploads] 加载失败:', err);
    }
}

function _upShow(state) {
    const states = { loading: 'up-loading', error: 'up-error', empty: 'up-empty', list: 'up-list' };
    Object.entries(states).forEach(([k, id]) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.display = k === state ? (k === 'list' ? 'block' : 'flex') : 'none';
    });
}

function _renderMyUploads(templates) {
    if (!templates.length) { _upShow('empty'); return; }

    const list = document.getElementById('up-list');
    if (!list) return;

    const STATUS_LABELS = { pending: '审核中', approved: '已上架', rejected: '已拒绝' };
    const STATUS_CLASS  = { pending: 'up-status-pending', approved: 'up-status-approved', rejected: 'up-status-rejected' };

    list.innerHTML = templates.map(tpl => {
        const meta        = (typeof CAT_META !== 'undefined' ? CAT_META[tpl.category] : null) || { emoji: '📦', bg: '#f4f4f4' };
        const statusLabel = STATUS_LABELS[tpl.status] || tpl.status;
        const statusClass = STATUS_CLASS[tpl.status]  || '';
        const tags        = (tpl.tags || []).slice(0, 4);
        const date        = tpl.created_at ? new Date(tpl.created_at).toLocaleDateString('zh-CN') : '';
        const rejectNote  = tpl.status === 'rejected' && tpl.rejection_reason
            ? `<div style="margin-top:8px;padding:7px 10px;background:#fff5f5;border:1px solid #fecaca;border-radius:7px;font-size:11px;color:#dc2626;">
                 ⚠ 拒绝原因：${_escHtml(tpl.rejection_reason)}
               </div>` : '';

        return `
        <div class="up-card" id="upc-${tpl.id}">
            <div class="up-card-icon" style="background:${meta.bg};">${meta.emoji}</div>
            <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                    <span style="font-size:13px;font-weight:700;color:#1a2035;">${_escHtml(tpl.name)}</span>
                    <span class="up-card-tag ${statusClass}">${statusLabel}</span>
                    <span style="font-size:10px;color:#b0b8c8;margin-left:auto;">${date}</span>
                </div>
                <div style="font-size:12px;color:#6b7890;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                    ${_escHtml(tpl.description || '暂无描述')}
                </div>
                <div class="up-card-meta">
                    ${tags.map(t => `<span style="background:#f0f3f8;border:1px solid #e2e8f0;border-radius:5px;padding:1px 7px;font-size:10px;color:#6b7890;">${_escHtml(t)}</span>`).join('')}
                    <span style="font-size:11px;color:#b0b8c8;">⬇ ${tpl.downloads || 0} 次下载 · ${tpl.node_count || 0} 个节点</span>
                </div>
                ${rejectNote}
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;">
                <button onclick="deleteMyUpload(${tpl.id})"
                    style="background:#fff5f5;color:#dc2626;border:1px solid #fecaca;border-radius:8px;padding:5px 12px;font-size:11px;font-weight:600;cursor:pointer;transition:background .12s;white-space:nowrap;"
                    onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background='#fff5f5'">
                    删除
                </button>
            </div>
        </div>`;
    }).join('');

    _upShow('list');
}

async function deleteMyUpload(id) {
    if (!_requireUserOnline('删除模板')) return;
    if (!confirm('确定删除这个模板？删除后不可恢复。')) return;
    try {
        const result = await AuthAPI.securePost('/api/market/delete_upload.php', { id });
        if (!result.success) throw new Error(result.message || '删除失败');
        const card = document.getElementById(`upc-${id}`);
        if (card) {
            card.style.opacity = '0';
            card.style.transition = 'opacity .25s';
            setTimeout(() => {
                card.remove();
                const list = document.getElementById('up-list');
                if (list && !list.children.length) _upShow('empty');
            }, 260);
        }
        if (typeof showStatus === 'function') showStatus('模板已删除');
        if (typeof _allTemplates !== 'undefined') {
            _allTemplates = _allTemplates.filter(t => t.id !== id);
            if (typeof _applyFilter === 'function') _applyFilter();
        }
    } catch (err) {
        if (typeof showModalDialog === 'function')
            showModalDialog('删除失败', err.message, 'error');
    }
}

function openSettings() {
    if (!_requireUserOnline('打开账户设置')) return;
    if (!AuthStore.isLoggedIn()) { openAuthModal('login'); return; }

    const user = AuthStore.getUser();
    const unameEl = document.getElementById('st-username');
    const emailEl = document.getElementById('st-email');
    if (unameEl) unameEl.value = user.username || '';
    if (emailEl) emailEl.value = user.email    || '';

    const infoUname = document.getElementById('st-info-username');
    const infoJoined = document.getElementById('st-info-joined');
    if (infoUname)  infoUname.textContent  = user.username || '';
    if (infoJoined) infoJoined.textContent = user.joined
        ? new Date(user.joined).toLocaleDateString('zh-CN')
        : '未知';

    ['st-old-pwd','st-new-pwd','st-confirm-pwd'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    _hideAlert('settings-profile-alert');
    _hideAlert('settings-pwd-alert');

    document.getElementById('settingsModal')?.classList.remove('hidden');
}

function closeSettings() {
    document.getElementById('settingsModal')?.classList.add('hidden');
}

async function saveProfile() {
    if (!_requireUserOnline('更新账户信息')) return;
    const username = document.getElementById('st-username')?.value.trim() || '';
    const email    = document.getElementById('st-email')?.value.trim()    || '';

    if (username.length < 2 || username.length > 32) {
        return _showAlert('settings-profile-alert', '用户名须在 2-32 个字符之间', 'err');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        return _showAlert('settings-profile-alert', '邮箱格式不正确', 'err');
    }

    const btn = _setBtnLoading('settings-profile-alert', true);
    try {
        const result = await AuthAPI.securePost('/api/market/auth/update_profile.php', {
            action: 'profile', username, email,
        });
        if (!result.success) throw new Error(result.message);

        const user = { ...AuthStore.getUser(), username, email };
        AuthStore.save(AuthStore.getToken(), user,
            !!localStorage.getItem('rcs_auth_v1'));

        _showAlert('settings-profile-alert', '基本信息已更新', 'ok');
        renderHeaderUser();
    } catch (err) {
        _showAlert('settings-profile-alert', err.message, 'err');
    } finally {
        _setBtnLoading('settings-profile-alert', false, btn);
    }
}

async function savePassword() {
    if (!_requireUserOnline('更新密码')) return;
    const oldPwd     = document.getElementById('st-old-pwd')?.value      || '';
    const newPwd     = document.getElementById('st-new-pwd')?.value      || '';
    const confirmPwd = document.getElementById('st-confirm-pwd')?.value  || '';

    if (!oldPwd) return _showAlert('settings-pwd-alert', '请输入当前密码', 'err');
    if (newPwd.length < 8) return _showAlert('settings-pwd-alert', '新密码至少 8 位', 'err');
    if (newPwd !== confirmPwd) return _showAlert('settings-pwd-alert', '两次输入的新密码不一致', 'err');

    const user     = AuthStore.getUser();
    const identity = user.username || user.email || '';

    const btn = _setBtnLoading('settings-pwd-alert', true);
    try {
        const oldHash = await CryptoLayer.hashPassword(oldPwd, identity);
        const newHash = await CryptoLayer.hashPassword(newPwd, identity);

        const result = await AuthAPI.securePost('/api/market/auth/update_profile.php', {
            action:       'password',
            old_password: oldHash,
            new_password: newHash,
        });
        if (!result.success) throw new Error(result.message);

        _showAlert('settings-pwd-alert', '密码已更新，请重新登录', 'ok');
        setTimeout(async () => {
            await AuthAPI.logout();
            closeSettings();
            renderHeaderUser();
            openAuthModal('login', '密码已修改，请重新登录');
        }, 1500);
    } catch (err) {
        _showAlert('settings-pwd-alert', err.message, 'err');
    } finally {
        _setBtnLoading('settings-pwd-alert', false, btn);
    }
}

async function confirmDeleteAccount() {
    if (!_requireUserOnline('注销账户')) return;
    if (!confirm('确定注销账户？此操作将永久删除您的账户及所有上传的模板，不可恢复！')) return;
    if (!confirm('再次确认：真的要删除账户吗？')) return;

    try {
        const result = await AuthAPI.securePost('/api/market/auth/update_profile.php', {
            action: 'delete_account',
        });
        if (!result.success) throw new Error(result.message);
        await AuthAPI.logout();
        closeSettings();
        renderHeaderUser();
        if (typeof showModalDialog === 'function')
            showModalDialog('账户已注销', '您的账户已被永久删除。', 'success');
    } catch (err) {
        if (typeof showModalDialog === 'function')
            showModalDialog('注销失败', err.message, 'error');
    }
}


function _escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _showAlert(containerId, msg, type) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.textContent = msg;
    el.className   = `up-alert up-alert-${type}`;
    el.style.display = 'block';
    if (type === 'ok') {
        clearTimeout(el._t);
        el._t = setTimeout(() => { el.style.display = 'none'; }, 4000);
    }
}

function _hideAlert(containerId) {
    const el = document.getElementById(containerId);
    if (el) el.style.display = 'none';
}

function _setBtnLoading(alertId, loading, origHtml) {
    const alertEl = document.getElementById(alertId);
    if (!alertEl) return '';
    const btn = alertEl.nextElementSibling?.querySelector
        ? alertEl.nextElementSibling.querySelector('.auth-submit-btn')
        : null;
    if (!btn) return '';
    if (loading) {
        const orig = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="auth-btn-spinner"></span>&nbsp;请稍候…';
        return orig;
    } else {
        btn.disabled = false;
        if (origHtml) btn.innerHTML = origHtml;
        return '';
    }
}