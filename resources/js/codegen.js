/**
 * 节点图 → Java / plugin.yml / config.yml / pom.xml 代码生成
 * 依赖：constants.js (litegraphGraph, editors, configEntries, registeredCommands)
 *       form.js (getMainClassParts)
 */

// 节点链接辅助

// 根据输入端口名称，找到连接到该端口的源节点
function getLinkedSourceNode(node, inputName) {
    if (!node.inputs || !litegraphGraph) return null;
    const inp = node.inputs.find(i => i.name === inputName);
    if (!inp || inp.link == null) return null;
    const link = litegraphGraph.links[inp.link];
    if (!link) return null;
    return litegraphGraph.getNodeById(link.origin_id);
}

// 找到节点第 outputIndex 个 exec 输出端口连接的下一个节点
function findNextExec(node, outputIndex) {
    if (!node.outputs || !litegraphGraph) return null;
    let execCount = 0;
    for (const out of node.outputs) {
        if (out.type === "exec") {
            if (execCount === outputIndex) {
                if (out.links && out.links.length > 0) {
                    const link = litegraphGraph.links[out.links[0]];
                    if (link) return litegraphGraph.getNodeById(link.target_id);
                }
                return null;
            }
            execCount++;
        }
    }
    return null;
}

// 表达式解析（节点输入 → Java 表达式）

// 将节点的字符串输入解析为对应的 Java 表达式
function resolveString(node, inputName, fallback) {
    const src = getLinkedSourceNode(node, inputName);
    if (!src) return fallback !== undefined ? fallback : '"Hello"';

    // 数据节点
    if (src.type === "values/text")
        return JSON.stringify(src.properties.text);
    if (src.type === "values/colorText")
        return 'ChatColor.translateAlternateColorCodes(\'&\', ' + JSON.stringify(src.properties.text) + ')';
    if (src.type === "values/playerName")
        return resolvePlayer(src) + ".getName()";
    if (src.type === "values/formatText") {
        const nameSrc = getLinkedSourceNode(src, "玩家名");
        const playerExpr = nameSrc ? resolvePlayer(nameSrc) + ".getName()" : "player.getName()";
        const tpl = JSON.stringify(src.properties.template || "");
        return tpl.replace('"{player}"', '" + ' + playerExpr + ' + "')
                  .replace('{player}',   '" + ' + playerExpr + ' + "');
    }

    // 配置读取节点
    if (src.type === "config/getString")
        return 'getConfig().getString("' + (src.properties["键"] || "key") + '", "")';

    // 逻辑节点
    if (src.type === "logic/strConcat") {
        const a = resolveString(src, "字符串A", '"A"');
        const b = resolveString(src, "字符串B", '"B"');
        return `(${a} + ${b})`;
    }

    // 网络节点
    if (src.type === "network/parseJsonField") {
        const jsonSrc = getLinkedSourceNode(src, "JSON字符串");
        const jsonExpr = jsonSrc ? resolveString(src, "JSON字符串", '"[]"') : "__responseBody";
        const field = src.properties["字段名"] || "name";
        return `__parseJson(${jsonExpr}, "${field}")`;
    }

    // 事件节点字符串输出
    if (src.type === "events/playerChat")
        return "event.getMessage()";
    if (src.type === "events/playerJoin")
        return "event.getJoinMessage()";
    if (src.type === "events/playerQuit")
        return "event.getQuitMessage()";
    if (src.type === "events/playerDeath")
        return "event.getDeathMessage()";
    if (src.type === "events/playerLogin")
        return "event.getAddress().toString()";
    if (src.type === "events/blockBreak" || src.type === "events/blockPlace")
        return "event.getBlock().getType().toString()";
    if (src.type === "events/playerDropItem" || src.type === "events/playerPickupItem")
        return "event.getItem().getType().toString()";
    if (src.type === "events/playerInteract")
        return "event.getAction().name()";
    if (src.type === "events/playerLevelUp")
        return "String.valueOf(event.getNewLevel())";
    if (src.type === "events/playerDamaged" || src.type === "events/entityDamageByPlayer")
        return "String.valueOf(event.getDamage())";

    // 默认回退
    return fallback !== undefined ? fallback : '"Hello"';
}

// 将节点的数值输入解析为对应的 Java 表达式
function resolveNumber(node, inputName, fallback) {
    const src = getLinkedSourceNode(node, inputName);
    if (!src) return fallback !== undefined ? String(fallback) : "100";

    if (src.type === "values/number") return String(src.properties.num);
    if (src.type === "config/getInt")
        return 'getConfig().getInt("' + (src.properties["键"] || "key") + '", 0)';
    if (src.type === "player/getHealth") {
        const plrSrc = getLinkedSourceNode(src, "玩家");
        return resolvePlayer(plrSrc) + ".getHealth()";
    }
    if (src.type === "player/getMaxHealth") {
        const plrSrc = getLinkedSourceNode(src, "玩家");
        return resolvePlayer(plrSrc) + ".getAttribute(org.bukkit.attribute.Attribute.GENERIC_MAX_HEALTH).getBaseValue()";
    }
    if (src.type === "player/getLevel") {
        const plrSrc = getLinkedSourceNode(src, "玩家");
        return resolvePlayer(plrSrc) + ".getLevel()";
    }
    if (src.type === "player/getFoodLevel") {
        const plrSrc = getLinkedSourceNode(src, "玩家");
        return resolvePlayer(plrSrc) + ".getFoodLevel()";
    }
    if (src.type === "server/getOnlineCount")
        return "org.bukkit.Bukkit.getOnlinePlayers().size()";
    if (src.type === "logic/mathOp") {
        const aNum = resolveNumber(src, "数值A", "0");
        const bNum = resolveNumber(src, "数值B", "0");
        const op = src.properties["运算"] || "+";
        return `(${aNum} ${op} ${bNum})`;
    }

    // 事件节点数字输出
    if (src.type === "events/playerLevelUp")
        return "event.getNewLevel()";
    if (src.type === "events/playerDamaged" || src.type === "events/entityDamageByPlayer")
        return "event.getDamage()";

    return fallback !== undefined ? String(fallback) : "100";
}

// 根据源节点类型返回对应的 Java 玩家变量名
function resolvePlayer(node) {
    if (!node) return "player";

    // 大多数事件都有玩家，且代码生成中已定义 player = event.getPlayer()
    if (node.type.startsWith("events/")) {
        // 排除一些可能没有玩家的事件（如服务器事件），但当前事件列表均有玩家
        return "player";
    }
    if (node.type === "command/onCommand") {
        return "player";
    }
    // 其他节点如 player/getHealth 等，其输入源可能也是事件，但会在递归中处理
    return "player";
}

// 从节点的玩家输入端口追溯并返回对应的 Java 玩家变量名
function resolvePlayerInput(node, inputName) {
    const src = getLinkedSourceNode(node, inputName);
    return resolvePlayer(src);
}

// 执行流遍历 → Java 语句生成

// 从起始节点沿执行流遍历，将每个节点翻译为 Java 代码行
function traverseExec(startNode, indent, imports) {
    const lines = [];
    let cur = startNode;
    const visited = new Set();

    while (cur) {
        if (visited.has(cur.id)) break;
        visited.add(cur.id);

        const i = indent;
        const p = resolvePlayerInput(cur, "玩家");

        switch (cur.type) {

            // 消息动作
            case "actions/consoleLog":
                lines.push(`${i}getLogger().info(${resolveString(cur, "内容", '"Log"')});`);
                break;
            case "actions/broadcast":
                imports.add("import org.bukkit.Bukkit;");
                lines.push(`${i}Bukkit.broadcastMessage(${resolveString(cur, "消息", '"Hello"')});`);
                break;
            case "actions/sendMessage":
                lines.push(`${i}${p}.sendMessage(${resolveString(cur, "消息", '"Hello"')});`);
                break;
            case "actions/sendTitle": {
                const title    = resolveString(cur, "标题", '"标题"');
                const subtitle = resolveString(cur, "副标题", '"副标题"');
                lines.push(`${i}${p}.sendTitle(${title}, ${subtitle}, 10, 70, 20);`);
                break;
            }
            case "actions/sendActionBar":
                imports.add("import net.md_5.bungee.api.ChatMessageType;");
                imports.add("import net.md_5.bungee.api.chat.TextComponent;");
                lines.push(`${i}${p}.spigot().sendMessage(ChatMessageType.ACTION_BAR, new TextComponent(${resolveString(cur, "消息", '"动作栏"')}));`);
                break;

            //  玩家操控 
            case "player/kick":
                lines.push(`${i}${p}.kickPlayer(${resolveString(cur, "原因", '"你被踢出了服务器"')});`);
                break;
            case "player/giveExp":
                lines.push(`${i}${p}.giveExp(${resolveNumber(cur, "经验值", 100)});`);
                break;
            case "player/giveItem": {
                const mat = cur.properties["物品类型"] || "DIAMOND";
                const qty = cur.properties["数量"] || 1;
                imports.add("import org.bukkit.Material;");
                imports.add("import org.bukkit.inventory.ItemStack;");
                lines.push(`${i}${p}.getInventory().addItem(new ItemStack(Material.${mat.toUpperCase()}, ${qty}));`);
                break;
            }
            case "player/setHealth":
                lines.push(`${i}${p}.setHealth(${resolveNumber(cur, "血量值", 20)});`);
                break;
            case "player/setFoodLevel":
                lines.push(`${i}${p}.setFoodLevel(${resolveNumber(cur, "饱食度", 20)});`);
                break;
            case "player/teleport": {
                const target = resolvePlayerInput(cur, "目标玩家");
                lines.push(`${i}${p}.teleport(${target}.getLocation());`);
                break;
            }
            case "player/setGameMode": {
                const gm = cur.properties["游戏模式"] || "SURVIVAL";
                imports.add("import org.bukkit.GameMode;");
                lines.push(`${i}${p}.setGameMode(GameMode.${gm});`);
                break;
            }
            case "player/setFlying": {
                const fly = cur.properties["允许飞行"] !== false ? "true" : "false";
                lines.push(`${i}${p}.setAllowFlight(${fly});`);
                if (fly === "true") lines.push(`${i}${p}.setFlying(true);`);
                break;
            }
            case "player/clearInventory":
                lines.push(`${i}${p}.getInventory().clear();`);
                break;
            case "player/removeItem": {
                imports.add("import org.bukkit.Material;");
                imports.add("import org.bukkit.inventory.ItemStack;");
                const mat2 = cur.properties["物品类型"] || "DIAMOND";
                const qty2 = resolveNumber(cur, "数量", 1);
                lines.push(`${i}${p}.getInventory().removeItem(new ItemStack(Material.${mat2.toUpperCase()}, ${qty2}));`);
                break;
            }
            case "player/setLevel":
                lines.push(`${i}${p}.setLevel(${resolveNumber(cur, "等级", 1)});`);
                break;
            case "player/setMaxHealth":
                imports.add("import org.bukkit.attribute.Attribute;");
                lines.push(`${i}${p}.getAttribute(Attribute.GENERIC_MAX_HEALTH).setBaseValue(${resolveNumber(cur, "最大血量", 20)});`);
                break;
            case "player/teleportToCoords": {
                imports.add("import org.bukkit.Location;");
                const world = cur.properties["世界"] || "world";
                const tx = cur.properties["X"] || 0;
                const ty = cur.properties["Y"] || 64;
                const tz = cur.properties["Z"] || 0;
                lines.push(`${i}${p}.teleport(new Location(${p}.getServer().getWorld("${world}"), ${tx}, ${ty}, ${tz}));`);
                break;
            }
            case "player/playParticle": {
                imports.add("import org.bukkit.Particle;");
                const pt   = cur.properties["粒子类型"] || "FLAME";
                const pqty = cur.properties["数量"] || 10;
                lines.push(`${i}${p}.getWorld().spawnParticle(Particle.${pt.toUpperCase()}, ${p}.getLocation(), ${pqty});`);
                break;
            }
            case "player/playSound": {
                imports.add("import org.bukkit.Sound;");
                const sound = cur.properties["音效"] || "ENTITY_EXPERIENCE_ORB_PICKUP";
                const vol   = cur.properties["音量"]  != null ? cur.properties["音量"]  : 1.0;
                const pitch = cur.properties["音调"]  != null ? cur.properties["音调"]  : 1.0;
                lines.push(`${i}${p}.playSound(${p}.getLocation(), Sound.${sound.toUpperCase()}, ${vol}f, ${pitch}f);`);
                break;
            }

            //  世界操作 
            case "world/setBlock": {
                imports.add("import org.bukkit.Material;");
                const mat3 = cur.properties["物品类型"] || "STONE";
                const offX = cur.properties["偏移X"] || 0;
                const offY = cur.properties["偏移Y"] || 0;
                const offZ = cur.properties["偏移Z"] || 0;
                lines.push(`${i}${p}.getWorld().getBlockAt(${p}.getLocation().add(${offX}, ${offY}, ${offZ})).setType(Material.${mat3.toUpperCase()});`);
                break;
            }
            case "world/spawnLightning": {
                const effectOnly = cur.properties["效果闪电"] !== false;
                lines.push(effectOnly
                    ? `${i}${p}.getWorld().strikeLightningEffect(${p}.getLocation());`
                    : `${i}${p}.getWorld().strikeLightning(${p}.getLocation());`);
                break;
            }
            case "world/createExplosion": {
                const power   = cur.properties["威力"] != null ? cur.properties["威力"] : 4.0;
                const setFire = cur.properties["点火"] ? "true" : "false";
                lines.push(`${i}${p}.getWorld().createExplosion(${p}.getLocation(), ${power}f, ${setFire});`);
                break;
            }
            case "world/setTime": {
                const time = cur.properties["时间刻"] != null ? cur.properties["时间刻"] : 6000;
                lines.push(`${i}${p}.getWorld().setTime(${time}L);`);
                break;
            }
            case "world/setWeather": {
                const weather = cur.properties["天气"] || "晴天";
                if (weather === "晴天") {
                    lines.push(`${i}${p}.getWorld().setStorm(false);`);
                    lines.push(`${i}${p}.getWorld().setThundering(false);`);
                } else if (weather === "下雨") {
                    lines.push(`${i}${p}.getWorld().setStorm(true);`);
                    lines.push(`${i}${p}.getWorld().setThundering(false);`);
                } else {
                    lines.push(`${i}${p}.getWorld().setStorm(true);`);
                    lines.push(`${i}${p}.getWorld().setThundering(true);`);
                }
                break;
            }
            case "world/spawnEntity": {
                imports.add("import org.bukkit.entity.EntityType;");
                const et = cur.properties["实体类型"] || "ZOMBIE";
                lines.push(`${i}${p}.getWorld().spawnEntity(${p}.getLocation(), EntityType.${et.toUpperCase()});`);
                break;
            }
            case "world/fillBlocks": {
                imports.add("import org.bukkit.Material;");
                const fillMat = cur.properties["方块类型"] || "AIR";
                const radius  = cur.properties["半径"] || 3;
                lines.push(`${i}// 填充半径 ${radius} 内的方块为 ${fillMat}`);
                lines.push(`${i}org.bukkit.Location __center = ${p}.getLocation();`);
                lines.push(`${i}for (int __x = -${radius}; __x <= ${radius}; __x++) {`);
                lines.push(`${i}    for (int __y = -${radius}; __y <= ${radius}; __y++) {`);
                lines.push(`${i}        for (int __z = -${radius}; __z <= ${radius}; __z++) {`);
                lines.push(`${i}            __center.clone().add(__x, __y, __z).getBlock().setType(Material.${fillMat.toUpperCase()});`);
                lines.push(`${i}        }`);
                lines.push(`${i}    }`);
                lines.push(`${i}}`);
                break;
            }

            //  服务器操作 
            case "server/dispatchCommand": {
                imports.add("import org.bukkit.Bukkit;");
                const cmdStr = resolveString(cur, "指令", '"say Hello"');
                lines.push(`${i}Bukkit.dispatchCommand(Bukkit.getConsoleSender(), ${cmdStr});`);
                break;
            }
            case "server/runTaskLater": {
                imports.add("import org.bukkit.Bukkit;");
                const delay = cur.properties["延迟刻"] != null ? cur.properties["延迟刻"] : 20;
                const delayedLines = [];
                const delayedNode  = findNextExec(cur, 1);
                if (delayedNode) traverseExecInto(delayedNode, indent + "    ", imports, delayedLines);
                lines.push(`${i}Bukkit.getScheduler().runTaskLater(this, () -> {`);
                delayedLines.forEach(l => lines.push(l));
                lines.push(`${i}}, ${delay}L);`);
                cur = findNextExec(cur, 0); continue;
            }
            case "server/runTaskTimer": {
                imports.add("import org.bukkit.Bukkit;");
                const initDelay = cur.properties["初始延迟"] != null ? cur.properties["初始延迟"] : 0;
                const interval  = cur.properties["间隔刻"]   != null ? cur.properties["间隔刻"]   : 20;
                const timerLines = [];
                const timerNode  = findNextExec(cur, 1);
                if (timerNode) traverseExecInto(timerNode, indent + "    ", imports, timerLines);
                lines.push(`${i}Bukkit.getScheduler().runTaskTimer(this, () -> {`);
                timerLines.forEach(l => lines.push(l));
                lines.push(`${i}}, ${initDelay}L, ${interval}L);`);
                cur = findNextExec(cur, 0); continue;
            }
            case "server/forEachPlayer": {
                imports.add("import org.bukkit.Bukkit;");
                imports.add("import org.bukkit.entity.Player;");
                const perPlayerLines = [];
                const perPlayerNode  = findNextExec(cur, 1);
                if (perPlayerNode) traverseExecInto(perPlayerNode, indent + "    ", imports, perPlayerLines);
                lines.push(`${i}for (Player __loopPlayer : Bukkit.getOnlinePlayers()) {`);
                perPlayerLines.forEach(l => lines.push(l.replace(/\bplayer\b/g, "__loopPlayer")));
                lines.push(`${i}}`);
                cur = findNextExec(cur, 0); continue;
            }
            case "server/broadcastToOps": {
                imports.add("import org.bukkit.Bukkit;");
                lines.push(`${i}Bukkit.broadcast(${resolveString(cur, "消息", '"管理员通知"')}, "minecraft.broadcast.admin");`);
                break;
            }
            case "server/kickAll": {
                imports.add("import org.bukkit.Bukkit;");
                imports.add("import org.bukkit.entity.Player;");
                const reason2 = resolveString(cur, "原因", '"服务器维护中"');
                lines.push(`${i}for (Player __kp : Bukkit.getOnlinePlayers()) {`);
                lines.push(`${i}    __kp.kickPlayer(${reason2});`);
                lines.push(`${i}}`);
                break;
            }
            case "server/setMotd": {
                imports.add("import org.bukkit.Bukkit;");
                lines.push(`${i}Bukkit.getServer().setMotd(${resolveString(cur, "消息", '"欢迎来到服务器"')});`);
                break;
            }

            //  配置文件 
            case "config/saveDefaultConfig":
                lines.push(`${i}saveDefaultConfig();`);
                break;
            case "config/reloadConfig":
                lines.push(`${i}reloadConfig();`);
                break;
            case "config/setAndSave": {
                const key = cur.properties["键"] || "key";
                const val = resolveString(cur, "值", '"value"');
                lines.push(`${i}getConfig().set("${key}", ${val});`);
                lines.push(`${i}saveConfig();`);
                break;
            }

            //  指令节点 
            case "command/sendUsage":
                lines.push(`${i}${p}.sendMessage("用法：/" + label + " <参数>");`);
                break;
            case "command/checkPermission": {
                const perm = cur.properties["权限节点"] || "myplugin.use";
                const yesLines = [], noLines = [];
                const yesNode  = findNextExec(cur, 0);
                const noNode   = findNextExec(cur, 1);
                if (yesNode) traverseExecInto(yesNode, indent + "    ", imports, yesLines);
                if (noNode)  traverseExecInto(noNode,  indent + "    ", imports, noLines);
                lines.push(`${i}if (${p}.hasPermission("${perm}")) {`);
                yesLines.forEach(l => lines.push(l));
                if (noLines.length > 0) {
                    lines.push(`${i}} else {`);
                    noLines.forEach(l => lines.push(l));
                }
                lines.push(`${i}}`);
                cur = null; break;
            }

            //  逻辑控制 
            case "logic/ifStringEqual": {
                const aStr    = resolveString(cur, "字符串A", '"A"');
                const bStr    = resolveString(cur, "字符串B", '"B"');
                const ignCase = cur.properties["忽略大小写"];
                const compare = ignCase ? `${aStr}.equalsIgnoreCase(${bStr})` : `${aStr}.equals(${bStr})`;
                const yLines = [], nLines = [];
                const yn = findNextExec(cur, 0), nn = findNextExec(cur, 1);
                if (yn) traverseExecInto(yn, indent + "    ", imports, yLines);
                if (nn) traverseExecInto(nn, indent + "    ", imports, nLines);
                lines.push(`${i}if (${compare}) {`);
                yLines.forEach(l => lines.push(l));
                if (nLines.length) { lines.push(`${i}} else {`); nLines.forEach(l => lines.push(l)); }
                lines.push(`${i}}`);
                cur = null; break;
            }
            case "logic/ifNumberCompare": {
                const aNum = resolveNumber(cur, "数值A", "0");
                const bNum = resolveNumber(cur, "数值B", "0");
                const op   = cur.properties["运算符"] || ">=";
                const yLines2 = [], nLines2 = [];
                const yn2 = findNextExec(cur, 0), nn2 = findNextExec(cur, 1);
                if (yn2) traverseExecInto(yn2, indent + "    ", imports, yLines2);
                if (nn2) traverseExecInto(nn2, indent + "    ", imports, nLines2);
                lines.push(`${i}if (${aNum} ${op} ${bNum}) {`);
                yLines2.forEach(l => lines.push(l));
                if (nLines2.length) { lines.push(`${i}} else {`); nLines2.forEach(l => lines.push(l)); }
                lines.push(`${i}}`);
                cur = null; break;
            }
            case "logic/ifContains": {
                const origin = resolveString(cur, "原始字符串", '"text"');
                const sub    = resolveString(cur, "子字符串", '"sub"');
                const yLines3 = [], nLines3 = [];
                const yn3 = findNextExec(cur, 0), nn3 = findNextExec(cur, 1);
                if (yn3) traverseExecInto(yn3, indent + "    ", imports, yLines3);
                if (nn3) traverseExecInto(nn3, indent + "    ", imports, nLines3);
                lines.push(`${i}if (${origin}.contains(${sub})) {`);
                yLines3.forEach(l => lines.push(l));
                if (nLines3.length) { lines.push(`${i}} else {`); nLines3.forEach(l => lines.push(l)); }
                lines.push(`${i}}`);
                cur = null; break;
            }
            case "logic/ifPlayerHasPerm": {
                const perm2 = cur.properties["权限节点"] || "myplugin.use";
                const yLines4 = [], nLines4 = [];
                const yn4 = findNextExec(cur, 0), nn4 = findNextExec(cur, 1);
                if (yn4) traverseExecInto(yn4, indent + "    ", imports, yLines4);
                if (nn4) traverseExecInto(nn4, indent + "    ", imports, nLines4);
                lines.push(`${i}if (${p}.hasPermission("${perm2}")) {`);
                yLines4.forEach(l => lines.push(l));
                if (nLines4.length) { lines.push(`${i}} else {`); nLines4.forEach(l => lines.push(l)); }
                lines.push(`${i}}`);
                cur = null; break;
            }
            case "logic/ifPlayerIsOp": {
                const yLines5 = [], nLines5 = [];
                const yn5 = findNextExec(cur, 0), nn5 = findNextExec(cur, 1);
                if (yn5) traverseExecInto(yn5, indent + "    ", imports, yLines5);
                if (nn5) traverseExecInto(nn5, indent + "    ", imports, nLines5);
                lines.push(`${i}if (${p}.isOp()) {`);
                yLines5.forEach(l => lines.push(l));
                if (nLines5.length) { lines.push(`${i}} else {`); nLines5.forEach(l => lines.push(l)); }
                lines.push(`${i}}`);
                cur = null; break;
            }
            case "logic/ifHealthBelow": {
                const threshold = cur.properties["阈值"] != null ? cur.properties["阈值"] : 5.0;
                const yLines6 = [], nLines6 = [];
                const yn6 = findNextExec(cur, 0), nn6 = findNextExec(cur, 1);
                if (yn6) traverseExecInto(yn6, indent + "    ", imports, yLines6);
                if (nn6) traverseExecInto(nn6, indent + "    ", imports, nLines6);
                lines.push(`${i}if (${p}.getHealth() < ${threshold}) {`);
                yLines6.forEach(l => lines.push(l));
                if (nLines6.length) { lines.push(`${i}} else {`); nLines6.forEach(l => lines.push(l)); }
                lines.push(`${i}}`);
                cur = null; break;
            }
            case "logic/ifItemInHand": {
                imports.add("import org.bukkit.Material;");
                const matHand = cur.properties["物品类型"] || "DIAMOND";
                const yLines7 = [], nLines7 = [];
                const yn7 = findNextExec(cur, 0), nn7 = findNextExec(cur, 1);
                if (yn7) traverseExecInto(yn7, indent + "    ", imports, yLines7);
                if (nn7) traverseExecInto(nn7, indent + "    ", imports, nLines7);
                lines.push(`${i}if (${p}.getInventory().getItemInMainHand().getType() == Material.${matHand.toUpperCase()}) {`);
                yLines7.forEach(l => lines.push(l));
                if (nLines7.length) { lines.push(`${i}} else {`); nLines7.forEach(l => lines.push(l)); }
                lines.push(`${i}}`);
                cur = null; break;
            }
            case "logic/cancelEvent":
                lines.push(`${i}event.setCancelled(true);`);
                break;

            //  网络请求 
            case "network/httpGet": {
                imports.add("import java.net.HttpURLConnection;");
                imports.add("import java.net.URL;");
                imports.add("import java.io.BufferedReader;");
                imports.add("import java.io.InputStreamReader;");
                const urlStr       = resolveString(cur, "URL", '"https://example.com/api"');
                const successLines = [], failLines = [];
                const successNode  = findNextExec(cur, 1), failNode = findNextExec(cur, 2);
                if (successNode) traverseExecInto(successNode, indent + "        ", imports, successLines);
                if (failNode)    traverseExecInto(failNode,    indent + "        ", imports, failLines);
                lines.push(`${i}Bukkit.getScheduler().runTaskAsynchronously(this, () -> {`);
                lines.push(`${i}    try {`);
                lines.push(`${i}        HttpURLConnection __conn = (HttpURLConnection) new URL(${urlStr}).openConnection();`);
                lines.push(`${i}        __conn.setRequestMethod("GET");`);
                lines.push(`${i}        __conn.setConnectTimeout(5000);`);
                lines.push(`${i}        StringBuilder __resp = new StringBuilder();`);
                lines.push(`${i}        try (BufferedReader __br = new BufferedReader(new InputStreamReader(__conn.getInputStream()))) {`);
                lines.push(`${i}            String __line;`);
                lines.push(`${i}            while ((__line = __br.readLine()) != null) __resp.append(__line);`);
                lines.push(`${i}        }`);
                lines.push(`${i}        final String __responseBody = __resp.toString();`);
                lines.push(`${i}        Bukkit.getScheduler().runTask(this, () -> {`);
                successLines.forEach(l => lines.push(l));
                lines.push(`${i}        });`);
                lines.push(`${i}    } catch (Exception __e) {`);
                lines.push(`${i}        getLogger().warning("HTTP请求失败: " + __e.getMessage());`);
                lines.push(`${i}        Bukkit.getScheduler().runTask(this, () -> {`);
                failLines.forEach(l => lines.push(l));
                lines.push(`${i}        });`);
                lines.push(`${i}    }`);
                lines.push(`${i}});`);
                cur = findNextExec(cur, 0); continue;
            }
            case "network/httpPost": {
                imports.add("import java.net.HttpURLConnection;");
                imports.add("import java.net.URL;");
                imports.add("import java.io.BufferedReader;");
                imports.add("import java.io.InputStreamReader;");
                imports.add("import java.io.OutputStream;");
                const urlStr2      = resolveString(cur, "URL", '"https://example.com/api"');
                const bodyStr      = resolveString(cur, "请求体", '"{}"');
                const successLines2 = [], failLines2 = [];
                const successNode2 = findNextExec(cur, 1), failNode2 = findNextExec(cur, 2);
                if (successNode2) traverseExecInto(successNode2, indent + "        ", imports, successLines2);
                if (failNode2)    traverseExecInto(failNode2,    indent + "        ", imports, failLines2);
                lines.push(`${i}Bukkit.getScheduler().runTaskAsynchronously(this, () -> {`);
                lines.push(`${i}    try {`);
                lines.push(`${i}        HttpURLConnection __conn = (HttpURLConnection) new URL(${urlStr2}).openConnection();`);
                lines.push(`${i}        __conn.setRequestMethod("POST");`);
                lines.push(`${i}        __conn.setDoOutput(true);`);
                lines.push(`${i}        __conn.setRequestProperty("Content-Type", "application/json");`);
                lines.push(`${i}        __conn.setConnectTimeout(5000);`);
                lines.push(`${i}        try (OutputStream __os = __conn.getOutputStream()) {`);
                lines.push(`${i}            __os.write(${bodyStr}.getBytes(java.nio.charset.StandardCharsets.UTF_8));`);
                lines.push(`${i}        }`);
                lines.push(`${i}        StringBuilder __resp = new StringBuilder();`);
                lines.push(`${i}        try (BufferedReader __br = new BufferedReader(new InputStreamReader(__conn.getInputStream()))) {`);
                lines.push(`${i}            String __line;`);
                lines.push(`${i}            while ((__line = __br.readLine()) != null) __resp.append(__line);`);
                lines.push(`${i}        }`);
                lines.push(`${i}        final String __responseBody = __resp.toString();`);
                lines.push(`${i}        Bukkit.getScheduler().runTask(this, () -> {`);
                successLines2.forEach(l => lines.push(l));
                lines.push(`${i}        });`);
                lines.push(`${i}    } catch (Exception __e) {`);
                lines.push(`${i}        getLogger().warning("HTTP POST失败: " + __e.getMessage());`);
                lines.push(`${i}        Bukkit.getScheduler().runTask(this, () -> {`);
                failLines2.forEach(l => lines.push(l));
                lines.push(`${i}        });`);
                lines.push(`${i}    }`);
                lines.push(`${i}});`);
                cur = findNextExec(cur, 0); continue;
            }
        }

        if (cur === null) break;
        cur = findNextExec(cur, 0);
    }
    return lines;
}

// 将 traverseExec 结果追加到已有的 lines 数组
function traverseExecInto(startNode, indent, imports, lines) {
    traverseExec(startNode, indent, imports).forEach(l => lines.push(l));
}

//  主生成函数 

// 遍历节点图，生成完整的 Bukkit 插件 Java 源码并写入编辑器
function generateJava() {
    if (!editors.java) return;
    const graph = litegraphGraph;
    const imports = new Set([
        "import org.bukkit.plugin.java.JavaPlugin;",
        "import org.bukkit.Bukkit;",
        "import org.bukkit.ChatColor;"
    ]);
    const methods = [];
    let needsListener = false;
    registeredCommands = [];

    // onEnable
    const enableNodes = graph.findNodesByType("events/onEnable");
    if (enableNodes.length > 0) {
        const lines = traverseExec(enableNodes[0], "        ", imports);
        methods.push({ type: "onEnable", lines });
    }

    // onDisable
    const disableNodes = graph.findNodesByType("events/onDisable");
    if (disableNodes.length > 0) {
        const lines = traverseExec(disableNodes[0], "        ", imports);
        methods.push({ type: "onDisable", lines });
    }

    // 事件处理器
    const eventDefs = [
        { nodeType: "events/playerJoin",             method: "onPlayerJoin",             event: "PlayerJoinEvent",             pkg: "org.bukkit.event.player.PlayerJoinEvent",             playerGet: "event.getPlayer()" },
        { nodeType: "events/playerQuit",             method: "onPlayerQuit",             event: "PlayerQuitEvent",             pkg: "org.bukkit.event.player.PlayerQuitEvent",             playerGet: "event.getPlayer()" },
        { nodeType: "events/playerDeath",            method: "onPlayerDeath",            event: "PlayerDeathEvent",            pkg: "org.bukkit.event.entity.PlayerDeathEvent",            playerGet: "event.getEntity()" },
        { nodeType: "events/playerChat",             method: "onPlayerChat",             event: "AsyncPlayerChatEvent",        pkg: "org.bukkit.event.player.AsyncPlayerChatEvent",        playerGet: "event.getPlayer()" },
        { nodeType: "events/playerMove",             method: "onPlayerMove",             event: "PlayerMoveEvent",             pkg: "org.bukkit.event.player.PlayerMoveEvent",             playerGet: "event.getPlayer()" },
        { nodeType: "events/playerRespawn",          method: "onPlayerRespawn",          event: "PlayerRespawnEvent",          pkg: "org.bukkit.event.player.PlayerRespawnEvent",          playerGet: "event.getPlayer()" },
        { nodeType: "events/playerInteract",         method: "onPlayerInteract",         event: "PlayerInteractEvent",         pkg: "org.bukkit.event.player.PlayerInteractEvent",         playerGet: "event.getPlayer()" },
        { nodeType: "events/playerLogin",            method: "onPlayerLogin",            event: "PlayerLoginEvent",            pkg: "org.bukkit.event.player.PlayerLoginEvent",            playerGet: "event.getPlayer()" },
        { nodeType: "events/blockBreak",             method: "onBlockBreak",             event: "BlockBreakEvent",             pkg: "org.bukkit.event.block.BlockBreakEvent",              playerGet: "event.getPlayer()" },
        { nodeType: "events/blockPlace",             method: "onBlockPlace",             event: "BlockPlaceEvent",             pkg: "org.bukkit.event.block.BlockPlaceEvent",              playerGet: "event.getPlayer()" },
        { nodeType: "events/entityDamageByPlayer",   method: "onEntityDamageByPlayer",   event: "EntityDamageByEntityEvent",   pkg: "org.bukkit.event.entity.EntityDamageByEntityEvent",  playerGet: "(event.getDamager() instanceof Player) ? (Player) event.getDamager() : null", extraGuard: "if (!(event.getDamager() instanceof Player)) return;" },
        { nodeType: "events/playerDamaged",          method: "onPlayerDamaged",          event: "EntityDamageEvent",           pkg: "org.bukkit.event.entity.EntityDamageEvent",           playerGet: "(event.getEntity() instanceof Player) ? (Player) event.getEntity() : null", extraGuard: "if (!(event.getEntity() instanceof Player)) return;" },
        { nodeType: "events/playerDropItem",         method: "onPlayerDropItem",         event: "PlayerDropItemEvent",         pkg: "org.bukkit.event.player.PlayerDropItemEvent",         playerGet: "event.getPlayer()" },
        { nodeType: "events/playerPickupItem",       method: "onPlayerPickupItem",       event: "EntityPickupItemEvent",       pkg: "org.bukkit.event.entity.EntityPickupItemEvent",       playerGet: "(event.getEntity() instanceof Player) ? (Player) event.getEntity() : null", extraGuard: "if (!(event.getEntity() instanceof Player)) return;" },
        { nodeType: "events/playerLevelUp",          method: "onPlayerLevelUp",          event: "PlayerLevelChangeEvent",      pkg: "org.bukkit.event.player.PlayerLevelChangeEvent",      playerGet: "event.getPlayer()" },
        { nodeType: "events/playerSneak",            method: "onPlayerSneak",            event: "PlayerToggleSneakEvent",      pkg: "org.bukkit.event.player.PlayerToggleSneakEvent",      playerGet: "event.getPlayer()" },
        { nodeType: "events/playerSprint",           method: "onPlayerSprint",           event: "PlayerToggleSprintEvent",     pkg: "org.bukkit.event.player.PlayerToggleSprintEvent",     playerGet: "event.getPlayer()" },
    ];

    for (const def of eventDefs) {
        const nodes = graph.findNodesByType(def.nodeType);
        if (nodes.length === 0) continue;
        needsListener = true;
        imports.add("import org.bukkit.event.Listener;");
        imports.add("import org.bukkit.event.EventHandler;");
        imports.add("import org.bukkit.entity.Player;");
        imports.add("import " + def.pkg + ";");
        const lines = traverseExec(nodes[0], "        ", imports);
        methods.push({ type: "event", event: def.event, method: def.method, playerGet: def.playerGet, extraGuard: def.extraGuard || null, lines });
    }

    // 指令
    const cmdNodes = graph.findNodesByType("command/onCommand");
    for (const cmdNode of cmdNodes) {
        const cmdName = cmdNode.properties["指令名"] || "test";
        const perm    = cmdNode.properties["权限节点"] || "";
        registeredCommands.push({ name: cmdName, desc: cmdNode.properties["描述"] || "", usage: cmdNode.properties["用法"] || ("/" + cmdName), perm });
        imports.add("import org.bukkit.command.Command;");
        imports.add("import org.bukkit.command.CommandSender;");
        imports.add("import org.bukkit.entity.Player;");
        const lines = traverseExec(cmdNode, "            ", imports);
        methods.push({ type: "command", cmdName, perm, lines });
    }

    const { pkg, cls } = getMainClassParts();
    const implPart = needsListener ? " implements Listener" : "";

    // 注入 onEnable 前置调用
    const enableMethod = methods.find(m => m.type === "onEnable");
    if (enableMethod) {
        if (needsListener)
            enableMethod.lines.unshift("        Bukkit.getPluginManager().registerEvents(this, this);");
        if (cmdNodes.length > 0) {
            for (const cn of registeredCommands)
                enableMethod.lines.unshift(`        getCommand("${cn.name}").setExecutor(this);`);
        }
        if (configEntries.length > 0 || graph.findNodesByType("config/saveDefaultConfig").length > 0)
            enableMethod.lines.unshift("        saveDefaultConfig();");
    }

    if (cmdNodes.length > 0) imports.add("import org.bukkit.command.TabExecutor;");
    const extraImpl = cmdNodes.length > 0 ? (needsListener ? ", TabExecutor" : " implements TabExecutor") : "";

    // 组装类体
    const classLines = [];
    classLines.push(`public class ${cls} extends JavaPlugin${implPart}${extraImpl} {`);
    classLines.push("");

    for (const m of methods) {
        if (m.type === "onEnable") {
            classLines.push("    @Override");
            classLines.push("    public void onEnable() {");
            m.lines.forEach(l => classLines.push(l));
            classLines.push("    }");
        } else if (m.type === "onDisable") {
            classLines.push("");
            classLines.push("    @Override");
            classLines.push("    public void onDisable() {");
            m.lines.forEach(l => classLines.push(l));
            classLines.push("    }");
        } else if (m.type === "event") {
            classLines.push("");
            classLines.push("    @EventHandler");
            classLines.push(`    public void ${m.method}(${m.event} event) {`);
            if (m.extraGuard) classLines.push(`        ${m.extraGuard}`);
            classLines.push(`        Player player = ${m.playerGet};`);
            if (m.playerGet.includes("instanceof")) {
                classLines.push(`        if (player == null) return;`);
            }
            m.lines.forEach(l => classLines.push(l));
            classLines.push("    }");
        }
        classLines.push("");
    }

    // 指令处理方法
    const cmdMethods = methods.filter(m => m.type === "command");
    if (cmdMethods.length > 0) {
        classLines.push("");
        classLines.push("    @Override");
        classLines.push("    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {");
        cmdMethods.forEach((m, idx) => {
            const kw = idx === 0 ? "if" : "} else if";
            classLines.push(`        ${kw} (command.getName().equalsIgnoreCase("${m.cmdName}")) {`);
            if (m.perm) {
                classLines.push(`            if (!sender.hasPermission("${m.perm}")) {`);
                classLines.push(`                sender.sendMessage(ChatColor.RED + "你没有权限执行此指令。");`);
                classLines.push("                return true;");
                classLines.push("            }");
            }
            classLines.push("            if (!(sender instanceof Player)) {");
            classLines.push(`                sender.sendMessage("此指令只能由玩家执行！");`);
            classLines.push("                return true;");
            classLines.push("            }");
            classLines.push("            Player player = (Player) sender;");
            m.lines.forEach(l => classLines.push(l));
            classLines.push("            return true;");
        });
        classLines.push("        }");
        classLines.push("        return false;");
        classLines.push("    }");
        classLines.push("");
        classLines.push("    @Override");
        classLines.push("    public java.util.List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {");
        classLines.push("        return new java.util.ArrayList<>();");
        classLines.push("    }");
        classLines.push("");
    }

    // HTTP 工具方法
    const hasHttp = graph.findNodesByType("network/httpGet").length > 0 ||
                    graph.findNodesByType("network/httpPost").length > 0;
    if (hasHttp) {
        classLines.push("");
        classLines.push("    // HTTP JSON 解析工具方法");
        classLines.push("    private String __parseJson(String json, String key) {");
        classLines.push("        try {");
        classLines.push(`            String search = "\\"" + key + "\\"";`);
        classLines.push(`            int idx = json.indexOf(search + ":");`);
        classLines.push(`            if (idx < 0) idx = json.indexOf(search + " :");`);
        classLines.push(`            if (idx < 0) return "";`);
        classLines.push(`            int start = json.indexOf(':', idx) + 1;`);
        classLines.push(`            while (start < json.length() && json.charAt(start) == ' ') start++;`);
        classLines.push(`            if (json.charAt(start) == '"') {`);
        classLines.push(`                int end = json.indexOf('"', start + 1);`);
        classLines.push(`                return json.substring(start + 1, end);`);
        classLines.push(`            } else {`);
        classLines.push(`                int end = json.indexOf(',', start);`);
        classLines.push(`                if (end < 0) end = json.indexOf('}', start);`);
        classLines.push(`                return json.substring(start, end).trim();`);
        classLines.push(`            }`);
        classLines.push("        } catch (Exception e) { return \"\"; }");
        classLines.push("    }");
    }

    classLines.push("}");

    const importStr = [...imports].sort().join("\n");
    editors.java.setValue(`package ${pkg};\n\n${importStr}\n\n${classLines.join("\n")}\n`, -1);

    generatePluginYml();
}

// 根据表单和节点图中的指令/权限节点，生成 plugin.yml 内容
function generatePluginYml() {
    if (!editors.yml) return;
    const name    = document.getElementById('pluginName')?.value    || 'MagicPlugin';
    const main    = document.getElementById('mainClass')?.value     || 'me.test.Main';
    const version = document.getElementById('pluginVersion')?.value || '1.0.0';
    const api     = document.getElementById('apiVersion')?.value    || '1.20';
    const author  = document.getElementById('author')?.value        || '';
    const website = document.getElementById('website')?.value       || '';
    const desc    = document.getElementById('description')?.value   || '';
    const load    = document.getElementById('loadTime')?.value      || 'POSTWORLD';
    const soft    = document.getElementById('softDepend')?.value    || '';

    let yml = `name: ${name}\nmain: ${main}\nversion: ${version}\napi-version: ${api}\n`;
    if (author)              yml += `author: ${author}\n`;
    if (website)             yml += `website: ${website}\n`;
    if (desc)                yml += `description: ${desc}\n`;
    if (load !== 'POSTWORLD') yml += `load: ${load}\n`;
    if (soft)                yml += `softdepend: [${soft.split(',').map(s => s.trim()).join(', ')}]\n`;

    const cmdNodes = litegraphGraph ? litegraphGraph.findNodesByType("command/onCommand") : [];
    if (cmdNodes.length > 0) {
        yml += `\ncommands:\n`;
        for (const cn of cmdNodes) {
            const cmdName = cn.properties["指令名"] || "test";
            const cmdDesc = cn.properties["描述"]   || "";
            const usage   = cn.properties["用法"]   || ("/" + cmdName);
            const perm    = cn.properties["权限节点"] || "";
            yml += `  ${cmdName}:\n`;
            yml += `    description: ${cmdDesc}\n`;
            yml += `    usage: ${usage}\n`;
            if (perm) yml += `    permission: ${perm}\n`;
        }
    }

    const permSet = new Set();
    cmdNodes.forEach(cn => { if (cn.properties["权限节点"]) permSet.add(cn.properties["权限节点"]); });
    if (litegraphGraph) {
        litegraphGraph.findNodesByType("command/checkPermission").forEach(n => {
            if (n.properties["权限节点"]) permSet.add(n.properties["权限节点"]);
        });
    }
    if (permSet.size > 0) {
        yml += `\npermissions:\n`;
        permSet.forEach(p => {
            yml += `  ${p}:\n    description: 允许使用 ${p}\n    default: op\n`;
        });
    }

    editors.yml.setValue(yml, -1);
}

// 合并配置列表与节点图中引用的配置键，生成 config.yml 内容
function generateConfigYml() {
    if (!editors.cfg) return;
    let yml = "# 插件默认配置文件\n";

    const keys = new Set();
    if (litegraphGraph) {
        ["config/getString", "config/getInt"].forEach(t => {
            litegraphGraph.findNodesByType(t).forEach(n => {
                if (n.properties["键"]) keys.add({ key: n.properties["键"], type: t === "config/getInt" ? "int" : "string" });
            });
        });
    }

    configEntries.forEach(e => { yml += `${e.key}: ${e.value}\n`; });

    const usedKeys = new Set(configEntries.map(e => e.key));
    keys.forEach(k => {
        if (!usedKeys.has(k.key)) {
            yml += `${k.key}: ${k.type === "int" ? "0" : '""'}\n`;
        }
    });

    editors.cfg.setValue(yml, -1);
}

// 根据表单中的 Maven 坐标等信息，生成 pom.xml 内容
function generatePomXml() {
    if (!editors.pom) return;
    const groupId    = document.getElementById('groupId')?.value      || 'me.yourname';
    const artifactId = document.getElementById('artifactId')?.value   || 'myplugin';
    const version    = document.getElementById('pluginVersion')?.value || '1.0.0';
    const javaVer    = document.getElementById('javaVersion')?.value   || '17';
    const spigotVer  = document.getElementById('spigotVersion')?.value || '1.20.4-R0.1-SNAPSHOT';
    const { cls }    = getMainClassParts();
    const pluginName = document.getElementById('pluginName')?.value    || 'MagicPlugin';

    const pom = `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>${groupId}</groupId>
    <artifactId>${artifactId}</artifactId>
    <version>${version}</version>
    <packaging>jar</packaging>

    <name>${pluginName}</name>
    <description>由 RedstoneCode Studio 生成</description>

    <properties>
        <java.version>${javaVer}</java.version>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
        <maven.compiler.source>${javaVer}</maven.compiler.source>
        <maven.compiler.target>${javaVer}</maven.compiler.target>
    </properties>

    <repositories>
        <!-- Spigot API 仓库 -->
        <repository>
            <id>spigot-repo</id>
            <url>https://hub.spigotmc.org/nexus/content/repositories/snapshots/</url>
        </repository>
        <!-- BungeeCord（用于 ActionBar） -->
        <repository>
            <id>bungeecord-repo</id>
            <url>https://oss.sonatype.org/content/repositories/snapshots</url>
        </repository>
    </repositories>

    <dependencies>
        <!-- Spigot API -->
        <dependency>
            <groupId>org.spigotmc</groupId>
            <artifactId>spigot-api</artifactId>
            <version>${spigotVer}</version>
            <scope>provided</scope>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-compiler-plugin</artifactId>
                <version>3.11.0</version>
                <configuration>
                    <source>${javaVer}</source>
                    <target>${javaVer}</target>
                    <encoding>UTF-8</encoding>
                </configuration>
            </plugin>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-jar-plugin</artifactId>
                <version>3.3.0</version>
                <configuration>
                    <archive>
                        <manifestEntries>
                            <Built-By>RedstoneCode Studio</Built-By>
                        </manifestEntries>
                    </archive>
                    <finalName>${pluginName}-${version}</finalName>
                </configuration>
            </plugin>
        </plugins>
    </build>
</project>
`;
    editors.pom.setValue(pom, -1);
}

// 重新生成全部输出文件（Java / plugin.yml / config.yml / pom.xml）
function regenerateAll() {
    if (!litegraphGraph) return;
    generateJava();
    generatePluginYml();
    generateConfigYml();
    generatePomXml();
}