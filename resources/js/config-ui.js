/**
 * 配置项列表的增删改与 DOM 渲染
 * 依赖：constants.js (configEntries), codegen.js (regenerateAll)
 */

// 添加一条新的配置项并刷新 UI
function addConfigEntry() {
    configEntries.push({ key: "settings.new-key", value: "defaultValue" });
    renderConfigEntries();
    regenerateAll();
}

// 删除指定索引的配置项并刷新 UI
function removeConfigEntry(idx) {
    configEntries.splice(idx, 1);
    renderConfigEntries();
    regenerateAll();
}

// 将 configEntries 渲染为可编辑的表单行
function renderConfigEntries() {
    const container = document.getElementById('config-entries');
    if (!container) return;
    container.innerHTML = '';
    configEntries.forEach((e, i) => {
        const row = document.createElement('div');
        row.className = 'flex gap-2 items-center';
        row.innerHTML = `
            <input class="cfg-input flex-1" style="font-size:12px;" value="${e.key}"
                oninput="configEntries[${i}].key=this.value;regenerateAll()" placeholder="键名">
            <input class="cfg-input flex-1" style="font-size:12px;" value="${e.value}"
                oninput="configEntries[${i}].value=this.value;regenerateAll()" placeholder="默认值">
            <button onclick="removeConfigEntry(${i})"
                class="text-red-400 hover:text-red-600 text-xs font-bold px-2">删除</button>`;
        container.appendChild(row);
    });
}
