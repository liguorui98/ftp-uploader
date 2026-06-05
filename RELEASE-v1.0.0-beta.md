# FTP Uploader v1.0.0-beta

**发布日期**：2026-06-05

FTP Uploader 首个Beta版本发布。一款基于 Electron 的 FTP/SFTP 自动上传桌面应用，支持 macOS 和 Windows。

---

## 功能亮点

- **FTP/SFTP 文件上传**：支持 FTP 和 SFTP 协议，批量上传文件到远程服务器
- **服务器配置管理**：可视化配置多个 FTP/SFTP 服务器连接
- **定时任务**：支持配置定时上传计划，自动化文件传输
- **文件夹监控**：监控本地文件夹变化，自动上传新增或修改的文件
- **传输队列**：实时查看上传进度、状态和历史记录
- **系统托盘**：最小化到系统托盘，后台运行不干扰工作
- **macOS 程序坞支持**：关闭窗口后可通过程序坞图标重新打开

---

## Bug 修复

- **修复打包 DMG 后白屏问题**：Vite ESM 模块在 `file://` 协议下 CORS 失败导致 React 无法渲染，改用自定义 `app://` 协议解决
- **修复 Electron 模块解析问题**：Vite 打包主进程时 `require('electron')` 解析到 npm 包而非内置模块，新增 shim 和构建时插件双重保障
- **修复路由不兼容问题**：`BrowserRouter` 在自定义协议下无法工作，切换为 `HashRouter`
- **修复打包后路径错误**：`__dirname` 在 asar 归档中行为异常，改用 `app.getAppPath()` 确保路径正确
- **修复 FTP 客户端 timeout 配置**：`basic-ftp` 的 timeout 选项需在构造函数中传入
- **修复 TypeScript 编译错误**：补充 `tsconfig.web.json` 的 target 和 lib 配置

---

## 技术改进

- **自定义 `app://` 协议**：注册为特权 scheme，支持 CORS、CSP 绕过、Fetch API
- **构建时 Electron Shim 插件**：自动将 `import ... from 'electron'` 替换为运行时正确的 require 调用
- **`crossorigin` 属性移除插件**：防止 Vite 默认添加的 crossorigin 触发不必要的 CORS 检查
- **React ErrorBoundary**：渲染错误不再白屏，而是展示可读的错误信息
- **运行时诊断系统**：HTML 内联诊断脚本 + 主进程 console-message 转发，打包后也能追踪问题
- **协议处理器日志**：记录每个资源请求的路径、MIME 类型、大小，便于排查加载问题
- **Forge 配置优化**：排除不必要的文件，减小打包体积

---

## 构建与运行

```bash
# 开发模式
npm run dev

# 构建
npm run build

# 打包 macOS DMG
npm run make:mac

# 打包 Windows 安装包
npm run make:win
```

---

## 技术栈

- Electron 30
- React 19 + TypeScript
- Ant Design 5
- Vite (electron-vite)
- Electron Forge
- basic-ftp / ssh2

---

## 已知问题

- 首次启动可能需要几秒钟加载（主进程 bundle 约 2.8MB）
- macOS 未签名应用首次打开需要在"系统设置 > 隐私与安全性"中允许运行

---

## 安装

下载对应平台的安装包：
- **macOS**：`FTP Uploader-x.x.x.dmg`（拖拽到 Applications 文件夹即可）
- **Windows**：`FTP Uploader Setup x.x.x.exe`（运行安装向导）
