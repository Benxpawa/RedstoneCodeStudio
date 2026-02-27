/**
 * 初始化 LiteGraph 画布：注册节点、配置右键菜单、拖拽放置、自动代码生成
 * 依赖：constants.js, node-defs.js, codegen.js
 */

function initLiteGraph() {
    if (typeof LiteGraph === 'undefined') { setTimeout(initLiteGraph, 100); return; }

    registerAllNodes();

    const graph = new LiteGraph.LGraph();
    litegraphGraph = graph;

    const container = document.getElementById('blocklyDiv');
    container.style.position = 'relative';

    const canvas = document.createElement('canvas');
    canvas.id = 'lg-canvas';
    canvas.style.cssText = 'position:absolute;top:0;left:0;';
    container.appendChild(canvas);

    function doResize() {
        const w = container.clientWidth || window.innerWidth;
        const h = container.clientHeight || (window.innerHeight - 56);
        canvas.width = w; canvas.height = h;
        if (litegraphCanvas) litegraphCanvas.resize(w, h);
    }
    doResize();
    window.addEventListener('resize', doResize);

    const lgc = new LiteGraph.LGraphCanvas(canvas, graph);
    litegraphCanvas = lgc;
    lgc.background_image = null;
    lgc.clear_background_color = "#181b27";

    // 中文分类名称映射（用于右键"添加节点"菜单）
    const CN_CATEGORY = {
        "events":  "<i class=\"fa-regular fa-calendar\"></i> 事件节点",
        "command": "<i class=\"fa-solid fa-terminal\"></i> 指令节点",
        "actions": "<i class=\"fa-solid fa-envelope\"></i> 消息动作",
        "player":  "<i class=\"fa-solid fa-user\"></i> 玩家操控",
        "world":   "<i class=\"fa-solid fa-globe\"></i> 世界操作",
        "server":  "<i class=\"fa-solid fa-server\"></i> 服务器操作",
        "logic":   "<i class=\"fa-solid fa-cogs\"></i> 逻辑控制",
        "network": "<i class=\"fa-solid fa-network-wired\"></i> 网络请求",
        "config":  "<i class=\"fa-solid fa-gear\"></i> 配置文件",
        "values":  "<i class=\"fa-solid fa-database\"></i> 数据节点",
    };

    // 右键菜单：添加节点（按分类展开子菜单）
    function openAddNodeMenu(event, prev_menu) {
        const cats = {};
        for (const type of Object.keys(LiteGraph.registered_node_types)) {
            const cat = type.split('/')[0];
            if (!cats[cat]) cats[cat] = [];
            cats[cat].push(type);
        }
        const catItems = Object.keys(cats).map(cat => ({
            content: CN_CATEGORY[cat] || cat,
            has_submenu: true,
            callback: (_v, _opts, ev, prev) => {
                const nodeItems = cats[cat].map(type => ({
                    content: LiteGraph.registered_node_types[type].title || type,
                    callback: () => {
                        const node = LiteGraph.createNode(type);
                        if (!node) return;
                        const rect = canvas.getBoundingClientRect();
                        const x = (event.clientX - rect.left) / lgc.ds.scale - lgc.ds.offset[0];
                        const y = (event.clientY - rect.top)  / lgc.ds.scale - lgc.ds.offset[1];
                        node.pos = [x, y];
                        graph.add(node);
                    }
                }));
                new LiteGraph.ContextMenu(nodeItems, { event: ev, parentMenu: prev });
            }
        }));
        new LiteGraph.ContextMenu(catItems, { event, parentMenu: prev_menu });
    }

    // 画布空白区右键菜单
    lgc.getMenuOptions = function () {
        return [
            {
                content: "<i class=\"fa-solid fa-plus\"></i> 添加节点",
                has_submenu: true,
                callback: (_v, _opts, ev, prev) => openAddNodeMenu(ev, prev)
            },
            null,
            {
                content: "适应全部节点",
                callback: () => { lgc.ds.reset(); lgc.setDirty(true, true); }
            },
            {
                content: "清空画布",
                callback: () => {
                    if (confirm("确定清空画布上的所有节点？此操作不可撤销。")) {
                        graph.clear();
                        regenerateAll();
                    }
                }
            }
        ];
    };

    // 节点右键菜单
    lgc.getNodeMenuOptions = function (node) {
        return [
            { content: "克隆节点", callback: () => { const c = node.clone(); c.pos = [node.pos[0] + 30, node.pos[1] + 30]; graph.add(c); } },
            null,
            { content: "删除节点", callback: () => graph.remove(node) },
        ];
    };

    graph.start();

    // 节点变化时延迟重新生成代码
    const regen = () => setTimeout(regenerateAll, 80);
    graph.onNodeAdded        = regen;
    graph.onNodeRemoved      = regen;
    graph.onConnectionChange = regen;

    // 拖拽放置节点到画布
    const blocklyDiv = document.getElementById('blocklyDiv');
    blocklyDiv.addEventListener('dragover', e => e.preventDefault());
    blocklyDiv.addEventListener('drop', e => {
        e.preventDefault();
        const nodeType = e.dataTransfer.getData('nodeType');
        if (!nodeType) return;
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / lgc.ds.scale - lgc.ds.offset[0];
        const y = (e.clientY - rect.top)  / lgc.ds.scale - lgc.ds.offset[1];
        const node = LiteGraph.createNode(nodeType);
        if (node) { node.pos = [x, y]; graph.add(node); }
    });

    document.querySelectorAll('.node-item[draggable]').forEach(el => {
        el.addEventListener('dragstart', e => {
            e.dataTransfer.setData('nodeType', el.dataset.node);
        });
    });

    // 放置默认起始节点
    setTimeout(() => {
        const node = LiteGraph.createNode("events/onEnable");
        node.pos = [100, 140];
        graph.add(node);
        regenerateAll();
    }, 200);
}
