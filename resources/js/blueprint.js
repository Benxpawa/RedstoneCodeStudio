/**
 * .mcbp 蓝图文件的导出与导入
 * 依赖：constants.js, codegen.js (regenerateAll), config-ui.js (renderConfigEntries),
 *        ui.js (switchTab, showStatus), form.js (onPluginNameInput, onMainClassInput)
 */


//将当前节点图、表单配置、配置项打包为 .mcbp 蓝图文件并触发下载

function exportBlueprint() {
    if (!litegraphGraph) {
        alert("节点图尚未初始化，请稍后再试。");
        return;
    }

    const graphData = litegraphGraph.serialize();

    // 收集表单字段值
    const fields = [
        'pluginName', 'mainClass', 'pluginVersion', 'apiVersion',
        'loadTime', 'author', 'website', 'description', 'softDepend',
        'groupId', 'artifactId', 'javaVersion', 'spigotVersion'
    ];
    const formData = {};
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) formData[id] = el.value;
    });

    const cfgEntries = JSON.parse(JSON.stringify(configEntries));

    const blueprint = {
        _format:  "mcbp",
        _version: "1.0",
        _created: new Date().toISOString(),
        _app:     "RedstoneCode Studio",
        form:     formData,
        config:   cfgEntries,
        graph:    graphData,
    };

    const json = JSON.stringify(blueprint, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const name = (formData.pluginName || 'blueprint').replace(/[^a-zA-Z0-9_-]/g, '_');
    a.href     = url;
    a.download = name + ".mcbp";
    a.click();
    URL.revokeObjectURL(url);

    showStatus("蓝图已导出：" + name + ".mcbp");
}


//读取 .mcbp 蓝图文件，恢复表单、配置项和节点图，并跳转到 logic 标签页
//@param {HTMLInputElement} inputEl 文件输入框

function importBlueprint(inputEl) {
    const file = inputEl.files[0];
    if (!file) return;
    inputEl.value = '';

    const reader = new FileReader();
    reader.onload = function (e) {
        let blueprint;
        try {
            blueprint = JSON.parse(e.target.result);
        } catch (err) {
            alert("文件解析失败，请确认这是有效的 .mcbp 蓝图文件。\n错误：" + err.message);
            return;
        }

        if (blueprint._format !== "mcbp") {
            if (!confirm("此文件不是标准 .mcbp 格式，仍然尝试导入？")) return;
        }

        // 恢复表单
        if (blueprint.form) {
            Object.entries(blueprint.form).forEach(([id, val]) => {
                const el = document.getElementById(id);
                if (el) el.value = val;
            });
        }

        // 恢复配置项
        if (Array.isArray(blueprint.config)) {
            configEntries = blueprint.config;
            renderConfigEntries();
        }

        // 恢复节点图
        if (blueprint.graph && litegraphGraph) {
            try {
                litegraphGraph.configure(blueprint.graph);
            } catch (err) {
                alert("节点图恢复时出现问题（部分节点可能无法显示）：\n" + err.message);
            }
        }

        regenerateAll();

        if (typeof onPluginNameInput === 'function') onPluginNameInput();
        if (typeof onMainClassInput  === 'function') onMainClassInput();

        // 跳转到 logic 并刷新画布
        switchTab('logic');
        setTimeout(() => {
            if (litegraphCanvas) {
                const c = document.getElementById('blocklyDiv');
                litegraphCanvas.resize(c.clientWidth, c.clientHeight);
                litegraphCanvas.ds.reset();
                litegraphCanvas.setDirty(true, true);
            }
        }, 100);

        const pluginName = blueprint.form?.pluginName || file.name;
        showStatus("已成功导入蓝图：" + pluginName);
    };
    reader.readAsText(file, 'utf-8');
}
