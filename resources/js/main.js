/**
 * 应用入口：DOM 加载完毕后初始化 Ace 编辑器、配置项、表单默认值，并启动 LiteGraph
 * 依赖：所有其他模块
 */

document.addEventListener('DOMContentLoaded', function () {

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

    editors.java = initEditor("editor-java", "java",  true);
    editors.yml  = initEditor("editor-yml",  "yaml",  true);
    editors.cfg  = initEditor("editor-cfg",  "yaml",  false);  // 配置文件允许手动编辑
    editors.pom  = initEditor("editor-pom",  "xml",   true);

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
});
