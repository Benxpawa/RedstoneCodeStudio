# RedstoneCode Studio

RedstoneCode Studio（简称 RC Studio）是一个可视化的 Minecraft 插件开发工具。它通过节点图编辑器让开发者以拖拽方式构建插件逻辑，并自动生成完整的 Java 源码、`plugin.yml`、`config.yml` 以及 Maven 项目文件（`pom.xml`）。工具内置编译后端，可直接将项目打包为可运行的 Spigot / Bukkit 插件 JAR 文件。

## 特性

- 节点式逻辑设计  
  基于 LiteGraph.js 的画布，从左侧面板拖拽节点、连接端口，即可构建插件的事件响应、指令处理、玩家操作、世界交互等逻辑。

- 插件配置面板  
  在配置页填写插件名称、主类、版本、开发者信息、Maven 坐标等元数据，并支持动态添加 `config.yml` 的默认配置项。

- 源码实时预览  
  Ace 编辑器实时展示生成的 Java 源码、`plugin.yml`、`config.yml` 和 `pom.xml`，并可手动编辑（仅 `config.yml` 可写，其余只读）。

- 一键编译打包  
  点击“导出 JAR”按钮，前端将代码发送给内置的后端服务，后端调用 Maven 编译并返回 JAR 文件，直接下载。

- 项目导入/导出  
  支持将当前节点图与配置导出为 `.mcbp` 蓝图文件，也可导入他人分享的蓝图，方便复用和分享。

## 技术栈

- 前端：HTML5 / CSS3 / JavaScript，使用 Tailwind CSS 快速布局，LiteGraph.js 实现节点图，Ace Editor 提供代码高亮编辑。
- 后端：Go 语言，借助 webview_go 将 Web 页面嵌入桌面窗口，内置 HTTP 服务器处理编译请求，调用本地 Maven 进行构建。
- 构建：Maven 用于编译 Java 代码，生成最终插件 JAR。

## 下载与运行

### 预编译版本

从 [Releases](../../releases) 页面下载对应操作系统的压缩包（Windows、Linux、macOS），解压后直接运行可执行文件即可启动应用。

### 从源码构建

1. **安装依赖**
   - Go 1.18 或更高版本
   - Maven 3.x（也可使用内置的 Maven，构建时会自动检测）
   - Java JDK 8 或更高（推荐 JDK 17）

2. **克隆仓库**
   ```bash
   git clone https://github.com/Benxpawa/RedstoneCodeStudio.git
   cd RedstoneCodeStudio
   ```

3. **安装 Go 模块**
   ```bash
   go mod download
   ```

4. **准备前端资源**
   前端文件位于 `resources/` 目录，已经包含在仓库中。如需修改，请编辑对应文件后直接覆盖即可（无需额外构建步骤）。

5. **编译 Go 后端**
   ```bash
   go build -o rcstudio main.go
   ```

6. **运行**
   ```bash
   ./rcstudio
   ```

## 使用方法

1. 启动程序后，默认进入“逻辑设计”标签页。
2. 从左侧节点面板拖拽节点到画布，连接端口构建逻辑。
3. 切换到“插件配置”标签页，填写插件元数据并添加配置项。
4. 实时观察“源码预览”标签页中生成的代码变化。
5. 点击顶部工具栏的“导出 JAR”按钮，等待编译完成后下载插件。
6. 可通过“导出项目”保存当前工作为 `.mcbp` 文件，或通过“导入项目”恢复。

## 许可证

本项目基于 **GNU General Public License v3.0** 开源。  
完整许可证文本请见 [LICENSE](./LICENSE) 文件。

## 免责声明

本工具自动生成的代码仅供参考，不保证在所有 Minecraft 服务端版本上完全兼容。  
使用“网络请求”或“执行控制台指令”等节点时需自行承担风险。作者不对因用户逻辑设计不当导致的服务器安全问题承担责任。  
Minecraft 为 Mojang AB 的注册商标，本项目与 Mojang Studios 及 Microsoft 无任何从属关系。