/**
 * 表单字段校验、实时同步、工具函数
 * 依赖：constants.js, codegen.js (regenerateAll)
 */

//  工具函数 

//  检查字符串是否为合法的 Java 标识符 
function isValidJavaIdent(s) {
    return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(s);
}

//  将任意字符串净化为合法的 Java 标识符 
function sanitizeToIdent(s) {
    let r = s.replace(/[^a-zA-Z0-9_$]/g, '');
    if (!r) return 'MyPlugin';
    if (/^[0-9]/.test(r)) r = 'Plugin' + r;
    return r;
}

//  设置表单字段为错误状态并显示提示文字 
function setFieldError(input, hint, msg) {
    input.style.borderColor = '#ef4444';
    if (hint) { hint.textContent = msg; hint.classList.remove('hidden'); }
}

//  清除表单字段的错误状态 
function clearFieldError(input, hint) {
    input.style.borderColor = '';
    if (hint) { hint.textContent = ''; hint.classList.add('hidden'); }
}

//  主类路径解析 


// 从表单中解析并净化主类路径，返回 { pkg, cls }
 
function getMainClassParts() {
    const raw        = document.getElementById('mainClass')?.value?.trim() || '';
    const pluginName = document.getElementById('pluginName')?.value?.trim() || 'MagicPlugin';

    if (!raw || !raw.includes('.')) {
        const safeClass = sanitizeToIdent(pluginName);
        return { pkg: 'me.plugin', cls: safeClass };
    }

    const parts     = raw.split('.');
    const sanitized = parts.map((p, i) => {
        let s = p.replace(/[^a-zA-Z0-9_$]/g, '');
        if (!s) s = i === parts.length - 1 ? 'Main' : 'pkg';
        if (/^[0-9]/.test(s)) s = (i === parts.length - 1 ? 'Plugin' : 'pkg') + s;
        return s;
    });

    const cls     = sanitized[sanitized.length - 1];
    const clsSafe = cls.charAt(0).toUpperCase() + cls.slice(1);
    sanitized[sanitized.length - 1] = clsSafe;

    const pkg = sanitized.slice(0, -1).join('.');
    return { pkg, cls: clsSafe };
}


// 校验主类全限定名，返回错误信息数组（空数组表示合法）
 
function validateMainClass(val) {
    if (!val) return ['主类路径不能为空'];
    const parts = val.split('.');
    if (parts.length < 2) return ['至少需要一个包名，格式：me.yourname.ClassName'];
    const errors = [];
    for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (!p) { errors.push('路径中有连续的点'); break; }
        if (!isValidJavaIdent(p)) {
            errors.push(`"${p}" 不是合法的 Java 标识符（不能以数字开头，不能有特殊字符）`);
            break;
        }
        if (i < parts.length - 1 && /^[A-Z]/.test(p)) {
            errors.push(`包名 "${p}" 建议用小写字母`);
        }
    }
    const cls = parts[parts.length - 1];
    if (cls && !/^[A-Z]/.test(cls)) {
        errors.push(`类名 "${cls}" 建议以大写字母开头（当前: ${cls}）`);
    }
    return errors;
}

//  输入框事件处理 

// 插件名输入框变化时校验格式并同步所有生成文件 
function onPluginNameInput() {
    const input = document.getElementById('pluginName');
    const hint  = document.getElementById('pluginName-hint');
    const val   = input.value.trim();
    const valid = /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(val);
    if (!val) {
        setFieldError(input, hint, '插件名不能为空');
    } else if (!valid) {
        setFieldError(input, hint, '只能含字母/数字/连字符，不能以数字开头');
    } else {
        clearFieldError(input, hint);
    }
    syncAllFiles();
}

// 主类路径输入框变化时校验格式并给出实时提示 
function onMainClassInput() {
    const input = document.getElementById('mainClass');
    const hint  = document.getElementById('mainClass-hint');
    if (!input) return;
    const val    = input.value.trim();
    const errors = validateMainClass(val);
    if (!val) {
        input.style.borderColor = '';
        if (hint) { hint.textContent = ''; hint.classList.add('hidden'); }
    } else if (errors.length > 0) {
        input.style.borderColor = '#ef4444';
        if (hint) { hint.textContent = errors[0]; hint.classList.remove('hidden'); hint.style.color = '#ef4444'; }
    } else {
        input.style.borderColor = '#22c55e';
        if (hint) { hint.textContent = '格式正确'; hint.classList.remove('hidden'); hint.style.color = '#22c55e'; }
    }
    syncAllFiles();
}

// 将插件名中的非法字符替换为下划线，并短暂高亮提示用户 
function sanitizePluginName() {
    const input = document.getElementById('pluginName');
    if (!input) return;
    const original = input.value;
    const safe     = original.replace(/[^A-Za-z0-9_\-]/g, '_');
    if (safe !== original) {
        input.value = safe;
        input.style.borderColor = '#f59e0b';
        setTimeout(() => { input.style.borderColor = ''; }, 1500);
    }
}

// 表单变化时触发，重新生成所有文件 
function syncAllFiles() {
    regenerateAll();
}
