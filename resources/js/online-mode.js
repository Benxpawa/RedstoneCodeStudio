/**
 * 在线/离线模式开关（默认离线）
 * 依赖：ui.js（showStatus）可选
 */

const ONLINE_MODE_KEY = 'rcs_online_mode';
let _onlineMode = false;

function isOnlineMode() {
    return !!_onlineMode;
}

function requireOnline(action) {
    if (isOnlineMode()) return true;
    const msg = action ? `离线模式下无法${action}` : '离线模式下无法使用在线功能';
    if (typeof showStatus === 'function') showStatus(msg);
    return false;
}

function setOnlineMode(enabled, opts = {}) {
    _onlineMode = !!enabled;

    // 同步写 localStorage（用于同次会话的即时缓存）
    try { localStorage.setItem(ONLINE_MODE_KEY, _onlineMode ? '1' : '0'); } catch (_) {}

    // 持久化到后端文件（跨端口、跨会话均有效）
    fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onlineMode: _onlineMode })
    }).catch(err => {
        console.warn('设置保存失败（后端未响应）:', err);
    });

    applyOnlineModeUI();
    if (!opts.silent && typeof showStatus === 'function') {
        showStatus(_onlineMode ? '已切换到在线模式' : '已切换到离线模式');
    }
}

function toggleOnlineMode(enabled) {
    if (enabled) {
        requestOnlineEnable('toggle');
        return;
    }
    setOnlineMode(false);
}

function initOnlineMode() {
	let cached = null;
	try { cached = localStorage.getItem(ONLINE_MODE_KEY); } catch (_) {}
	if (cached !== null) {
		_onlineMode = (cached === '1');
		_wrapFetchOnce();
		applyOnlineModeUI();
	}

	// 从后端文件读取值
	fetch('/api/settings')
		.then(r => r.json())
		.then(data => {
			const serverVal = !!data.onlineMode;
			if (serverVal !== _onlineMode) {
				_onlineMode = serverVal;
				// 同步更新 localStorage 缓存
				try { localStorage.setItem(ONLINE_MODE_KEY, _onlineMode ? '1' : '0'); } catch (_) {}
				_wrapFetchOnce();
				applyOnlineModeUI();
			}
		})
		.catch(() => {
			// 后端不可用，使用缓存值
			_wrapFetchOnce();
			if (cached === null) applyOnlineModeUI();
		});
}

function _wrapFetchOnce() {
    if (window._rcsFetchWrapped) return;
    window._rcsFetchWrapped = true;
    const rawFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
        if (!isOnlineMode()) {
            const url = typeof input === 'string' ? input : (input && input.url) ? input.url : '';
            const isAbs = /^https?:\/\//i.test(url);
            const sameOrigin = !isAbs || url.startsWith(window.location.origin);
            if (isAbs && !sameOrigin) {
                return Promise.reject(new Error('离线模式下禁止访问网络'));
            }
        }
        return rawFetch(input, init);
    };
}

function requestOnlineEnable(reason) {
    if (_onlineMode) return;
    if (typeof closeOfflineGuide === 'function') closeOfflineGuide();
    const toggles = [
        document.getElementById('online-mode-toggle-menu'),
        document.getElementById('online-mode-toggle-about'),
    ];
    toggles.forEach(t => { if (t) t.checked = false; });
    const modal = document.getElementById('onlineDeclModal');
    if (modal) modal.classList.remove('hidden');
}

function acceptOnlineDecl() {
    const modal = document.getElementById('onlineDeclModal');
    if (modal) modal.classList.add('hidden');
    const toggles = [
        document.getElementById('online-mode-toggle-menu'),
        document.getElementById('online-mode-toggle-about'),
    ];
    toggles.forEach(t => { if (t) t.checked = true; });
    setOnlineMode(true);
}

function cancelOnlineDecl() {
    const modal = document.getElementById('onlineDeclModal');
    if (modal) modal.classList.add('hidden');
    const toggles = [
        document.getElementById('online-mode-toggle-menu'),
        document.getElementById('online-mode-toggle-about'),
    ];
    toggles.forEach(t => { if (t) t.checked = false; });
}

function showOfflineMarketGuide() {
    const modal = document.getElementById('offlineGuideModal');
    if (modal) modal.classList.remove('hidden');
}

function closeOfflineGuide() {
    const modal = document.getElementById('offlineGuideModal');
    if (modal) modal.classList.add('hidden');
}

function applyOnlineModeUI() {
    syncModeControls();

    const tab = document.getElementById('tab-market');
    if (tab) {
        tab.classList.toggle('disabled', !_onlineMode);
        tab.setAttribute('aria-disabled', _onlineMode ? 'false' : 'true');
    }

    if (document.body) {
        document.body.setAttribute('data-net-mode', _onlineMode ? 'online' : 'offline');
    }

    if (!_onlineMode) {
        if (typeof marketShowOffline === 'function') marketShowOffline();
        const area = document.getElementById('auth-header-area');
        if (area) {
            area.innerHTML = '';
        }
        const viewMarket = document.getElementById('view-market');
        if (viewMarket && viewMarket.classList.contains('active')) {
            if (typeof switchTab === 'function') switchTab('logic');
        }
    } else {
        if (typeof renderHeaderUser === 'function') renderHeaderUser();
        if (typeof marketInit === 'function') marketInit();
    }
}

function syncModeControls() {
    const toggles = [
        document.getElementById('online-mode-toggle-menu'),
        document.getElementById('online-mode-toggle-about'),
    ];
    toggles.forEach(t => { if (t) t.checked = _onlineMode; });

    const labels = document.querySelectorAll('[data-net-label]');
    labels.forEach(l => { l.textContent = _onlineMode ? '在线' : '离线'; });

    toggles.forEach(t => {
        const wrap = t?.closest('label');
        if (wrap) wrap.title = _onlineMode ? '当前在线，点击切换为离线' : '当前离线，点击切换为在线';
    });
}