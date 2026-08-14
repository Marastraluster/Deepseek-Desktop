<p align="center">
  <img src="docs/assets/deepseek-desktop-logo.png" alt="DeepSeek Desktop" width="160" />
</p>

<h1 align="center">DeepSeek Desktop</h1>

<p align="center">
  基于 DeepSeek Harness 的桌面客户端
</p>

<p align="center">
  <a href="README.md">简体中文</a> | <a href="README.en.md">English</a>
</p>

DeepSeek Desktop 是一个面向本地开发工作的 Electron 客户端。它基于
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的官方 Host
与渲染器架构迭代构建，将 Harness 的 Agent 工作流带到 Windows、macOS 和 Linux
桌面环境。

> 本项目是社区维护的桌面端实现，并非 DeepSeek 官方客户端，也不代表 DeepSeek
> 的官方立场或背书。

## 功能概览

- **官方 Harness 架构**：直接复用 DeepSeek Harness 的 Host、客户端连接层与
  官方 Web 渲染器，不是将 WebUI 包进浏览器窗口。
- **原生桌面通信**：桌面主进程通过 Electron IPC 与本地 Host 通信，不启动由本
  应用维护的 HTTP 或 WebSocket 服务。
- **工作区与会话**：选择本地工作区，创建和切换会话，在同一桌面客户端中持续处理
  开发任务。
- **Agent 预设**：提供可选的 Agent 预设，便于按任务类型调整协作方式。
- **开箱即用的发布版**：安装包内置与当前平台匹配的 Node 运行时和 Host 依赖，终端
  用户无需额外安装 Node.js 或 pnpm。
- **保留源码开发体验**：支持从源码安装依赖、启动调试环境、运行测试和原生平台打包。
- **三端交付**：发布流程构建 Windows x64、macOS Intel/Apple Silicon 和 Linux x64
  产物。

## 获取发布版

在 [GitHub Releases](https://github.com/Marastraluster/Deepseek-Desktop/releases)
下载与你的平台匹配的安装包：

- Windows x64：NSIS 安装程序和便携版 EXE。
- macOS x64 / arm64：DMG 和 ZIP。当前版本未签名、未公证，首次启动需要在 Finder
  中使用“打开”。
- Linux x64：AppImage。下载后先赋予可执行权限。

Windows 构建使用 `CN=Astraluster` 自签名证书。每个 Release 附带
`Astraluster.cer` 公钥证书；将它导入受信任证书存储可移除该证书对应的发布者警告，
但不会建立 Microsoft SmartScreen 声誉。

## 从源码启动

需要 Node.js 24 和 pnpm 11.19。

```powershell
pnpm install
pnpm harness:prepare
pnpm dev
```

`pnpm dev` 会依次构建桌面连接层、Host 与官方渲染器所需插件，并启动 Electron
开发环境。

常用命令：

```powershell
pnpm test
pnpm build
pnpm dist:win
pnpm dist:mac
pnpm dist:linux
```

原生打包应在对应操作系统上执行。生成的产物位于 `dist/`；完整发布流程见
[docs/release.md](docs/release.md)。

## 项目结构

- `apps/desktop-main/`：Electron 主进程、窗口生命周期和 IPC 边界。
- `apps/desktop-renderer/`：基于 Harness 官方渲染器的桌面前端入口。
- `packages/desktop-connection/`：Host 与渲染器间的连接实现。
- `vendor/deepseek-harness/`：作为上游来源引用的 DeepSeek Harness。
- `scripts/`：Harness 准备、发布分发和本地打包脚本。

## 后续开发建议

1. **先稳定 Windows 体验**：覆盖首次启动、工作区切换、新会话、Agent 预设、错误恢复
   与日志导出等核心路径的端到端测试。
2. **补齐三端冒烟验证**：在真实 macOS 和 Linux 环境验证首次启动、文件权限、窗口
   行为与 Host 生命周期，而不只依赖打包成功。
3. **完善更新与诊断能力**：引入可审计的自动更新策略、版本信息页和一键导出的脱敏
   诊断日志，降低排障成本。
4. **管理用户配置与密钥**：把工作区偏好、模型/服务配置和敏感凭据分层保存；敏感
   数据优先接入系统凭据存储。
5. **提升可用性**：补充键盘导航、无障碍语义、界面国际化和适合高分屏的显示测试。
6. **规划扩展边界**：在不改变 Harness 核心协议的前提下，为命令、工具和工作流预设
   设计受权限约束的扩展机制。

## 致谢与许可证

本项目从 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
迭代而来。上游 Harness 的许可、版权和第三方声明仍适用于其对应代码；本仓库新增
部分遵循 [MIT License](LICENSE)。
