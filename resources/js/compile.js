/**
 * 校验表单后将 Java 代码发送到后端编译服务器，成功后下载 JAR 文件
 * 依赖：constants.js (editors), form.js (validateMainClass, getMainClassParts),
 *        ui.js (showStatus, showModalDialog, switchTab)
 */

function compilePlugin() {
    const btn = document.getElementById('compileBtn');

    const pluginNameVal  = document.getElementById('pluginName')?.value?.trim()      || '';
    const mainClassVal   = document.getElementById('mainClass')?.value?.trim()       || '';
    const versionVal     = document.getElementById('pluginVersion')?.value?.trim()   || '1.0';
    const authorVal      = document.getElementById('author')?.value?.trim()          || '';
    const websiteVal     = document.getElementById('website')?.value?.trim()         || '';
    const groupIdVal     = document.getElementById('groupId')?.value?.trim()         || '';
    const artifactIdVal  = document.getElementById('artifactId')?.value?.trim()      || '';

    // 校验插件名
    if (!pluginNameVal || !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(pluginNameVal)) {
        alert('插件名称格式不正确！\n只能包含字母、数字和连字符，且不能以数字开头。\n例如：MagicPlugin、my-plugin、TestPlugin123');
        switchTab('config');
        document.getElementById('pluginName').focus();
        return;
    }

    // 校验主类路径
    const mainClassErrors = validateMainClass(mainClassVal);
    if (mainClassErrors.length > 0) {
        alert('主类路径格式不正确！\n' + mainClassErrors[0] + '\n\n正确格式示例：me.yourname.myplugin.Main');
        switchTab('config');
        document.getElementById('mainClass').focus();
        return;
    }

    showStatus("正在连接编译服务器...");
    if (btn) btn.disabled = true;

    const code = editors.java ? editors.java.getValue() : "";
    if (!code.includes("JavaPlugin")) {
        alert("请先设计节点逻辑！");
        if (btn) btn.disabled = false;
        return;
    }

    // 从生成的代码中提取包名和类名
    const pkgMatch   = code.match(/^package\s+([\w.]+)\s*;/m);
    const classMatch = code.match(/public\s+class\s+(\w+)\s+extends/);
    const pkg = pkgMatch   ? pkgMatch[1]   : getMainClassParts().pkg;
    const cls = classMatch ? classMatch[1] : getMainClassParts().cls;

    // 90 秒超时(?)，或者超时时间更长一点？
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 90000);

    fetch('/api/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
            pluginName:  pluginNameVal,
            packageName: pkg,
            mainClass:   cls,
            fullMain:    pkg + '.' + cls,
            version:     versionVal,
            author:      authorVal,
            website:     websiteVal,
            groupId:     groupIdVal,
            artifactId:  artifactIdVal,
            javaCode:    code,
            pluginYml:   editors.yml?.getValue() || "",
            configYml:   editors.cfg?.getValue() || "",
            pomXml:      editors.pom?.getValue() || ""
        })
    })
    .then(async res => {
        if (res.ok) {
            const blob = await res.blob();
            const a    = document.createElement('a');
            a.href     = URL.createObjectURL(blob);
            a.download = pluginNameVal + ".jar";
            a.click();
            showStatus("编译成功，JAR 文件已下载");
            showModalDialog("编译成功", "JAR 文件已生成并下载。", "success");
        } else {
            const d = await res.json().catch(() => ({}));
            showStatus("编译失败");
            showModalDialog("编译失败", d.error || '未知错误', "error");
        }
    })
    .catch(err => {
        if (err.name === 'AbortError') {
            showModalDialog("编译超时", "编译请求超时（90秒），请检查后端服务或网络连接。", "error");
        } else {
            showModalDialog("网络错误", "后端未启动或网络连接失败。", "error");
        }
        showStatus("编译失败");
    })
    .finally(() => {
        clearTimeout(timeoutId);
        if (btn) btn.disabled = false;
    });
}