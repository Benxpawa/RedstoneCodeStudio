/**
 * 全局共享状态变量 + 节点颜色常量
 * 所有其他模块均可读写这些变量
 */

// LiteGraph 画布与图实例
let litegraphCanvas, litegraphGraph;

// Ace 编辑器实例集合（java / yml / cfg / pom）
let editors = {};

// 配置文件条目列表
let configEntries = [];

// 已注册的指令列表
let registeredCommands = [];

// 节点颜色常量
// ev=事件, act=动作, msg=消息, dat=数据, cmd=指令
// cfg=配置, plr=玩家, wld=世界, srv=服务器, lgc=逻辑, net=网络, ent=实体
const C = {
    evBg:  "#0e1c3a", evFg:  "#1a3a7a",
    actBg: "#1a0b30", actFg: "#5a1a9a",
    msgBg: "#2a1200", msgFg: "#a04a00",
    datBg: "#0b2410", datFg: "#1a6b30",
    cmdBg: "#2a2000", cmdFg: "#8a6a00",
    cfgBg: "#2a0b10", cfgFg: "#9a1020",
    plrBg: "#0a2030", plrFg: "#0a6090",
    wldBg: "#072020", wldFg: "#0a7a6a",
    srvBg: "#221000", srvFg: "#955000",
    lgcBg: "#1a1a00", lgcFg: "#7a7a00",
    netBg: "#150a2a", netFg: "#6a20b0",
    entBg: "#2a0a00", entFg: "#b03010",
    // 变量存储
    varBg: "#1a0a2a", varFg: "#8a30c0",
    // 类型转换
    cvtBg: "#081828", cvtFg: "#1a7ab0",
};
