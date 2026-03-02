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

        const keyInput = document.createElement('input');
        keyInput.className = 'cfg-input flex-1';
        keyInput.style.fontSize = '12px';
        keyInput.placeholder = '键名';
        keyInput.value = e.key;
        keyInput.addEventListener('input', () => {
            configEntries[i].key = keyInput.value;
            regenerateAll();
        });

        const valInput = document.createElement('input');
        valInput.className = 'cfg-input flex-1';
        valInput.style.fontSize = '12px';
        valInput.placeholder = '默认值';
        valInput.value = e.value;
        valInput.addEventListener('input', () => {
            configEntries[i].value = valInput.value;
            regenerateAll();
        });

        const delBtn = document.createElement('button');
        delBtn.className = 'text-red-400 hover:text-red-600 text-xs font-bold px-2';
        delBtn.textContent = '删除';
        delBtn.addEventListener('click', () => removeConfigEntry(i));

        row.appendChild(keyInput);
        row.appendChild(valInput);
        row.appendChild(delBtn);
        container.appendChild(row);
    });
}