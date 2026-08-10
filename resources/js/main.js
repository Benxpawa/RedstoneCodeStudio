// 拦截开发者工具相关快捷键（F12 / Ctrl+U / Ctrl+Shift+I/J/C / Ctrl+S 等）
document.addEventListener('keydown', function (e) {
    const key = (e.key || '').toUpperCase();
    const isF12 = key === 'F12';
    const isCtrl = e.ctrlKey || e.metaKey;
    const isShift = e.shiftKey;
    if (isF12) { e.preventDefault(); e.stopPropagation(); return; }
    if (isCtrl && key === 'U') { e.preventDefault(); e.stopPropagation(); return; }
    if (isCtrl && isShift && (key === 'I' || key === 'J' || key === 'C' || key === 'K' || key === 'S')) {
        e.preventDefault(); e.stopPropagation(); return;
    }
    if (isCtrl && key === 'S') { e.preventDefault(); e.stopPropagation(); return; }
});

// 禁用页面右键菜单（防止"检查元素"入口），但保留输入框/编辑器/画布内的右键菜单
document.addEventListener('contextmenu', function (e) {
    const t = e.target;
    const inEditable = t && (t.closest('input, textarea, .ace_editor') || t.isContentEditable);
    if (!inEditable) { e.preventDefault(); return false; }
});

document.addEventListener('DOMContentLoaded', function () {

    if (typeof initOnlineMode === 'function') initOnlineMode();

    //  Ace 编辑器初始化 

    function initEditor(id, mode, readOnly) {
        const e = ace.edit(id);
        e.setTheme("ace/theme/monokai");
        e.session.setMode("ace/mode/" + mode);
        e.setReadOnly(!!readOnly);
        e.setShowPrintMargin(false);
        e.setOptions({ fontSize: "13px", tabSize: 4, useSoftTabs: true });
        return e;
    }

    // 全部都允许编辑吧，现在可视化和代码的转换还不够完善，先让用户自己改吧╰(*°▽°*)╯
    editors.java = initEditor("editor-java", "java",  false);
    editors.yml  = initEditor("editor-yml",  "yaml",  false);
    editors.cfg  = initEditor("editor-cfg",  "yaml",  false);
    editors.pom  = initEditor("editor-pom",  "xml",   false);

    //  配置项默认值 

    configEntries = [];
    renderConfigEntries();

    //  表单默认值 

    document.getElementById('pluginName').value  = 'MagicPlugin';
    document.getElementById('mainClass').value   = 'me.yourname.myplugin.Main';
    document.getElementById('groupId').value     = 'me.yourname';
    document.getElementById('artifactId').value  = 'magicplugin';

    // 触发校验显示
    onPluginNameInput();
    onMainClassInput();

    //  启动 LiteGraph 

    function waitLG() {
        if (typeof LiteGraph !== 'undefined') initLiteGraph();
        else setTimeout(waitLG, 100);
    }
    waitLG();

    setTimeout(() => {
        if (typeof initUpdateCheck === 'function') initUpdateCheck();
        if (typeof initAnnounce    === 'function') initAnnounce();
    }, 800);
});
