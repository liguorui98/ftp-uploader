# Electron 打包 DMG 白屏问题 — 根因分析与修复总结

## 问题描述

FTP Uploader 是一个基于 Electron 30 + React + Ant Design 的桌面应用，使用 electron-vite 构建、electron-forge 打包为 macOS DMG。

**现象**：开发模式下运行正常，但打包为 DMG 安装后启动应用，窗口显示完全白屏，无任何 UI 渲染，控制台无报错，日志文件无错误。

---

## 根因分析

经过五轮迭代调试，最终定位到三个相互关联的根因：

### 根因 1：ESM 模块在 `file://` 协议下 CORS 失败（核心问题）

Vite 默认使用 ESModule 打包，产出 `<script type="module">` 标签。当 Electron 通过 `file://` 协议加载页面时，Chromium 将 origin 视为 `null`。ESM 模块请求被 CORS 策略拦截，浏览器静默拒绝加载，不触发任何 `error` 事件或 `unhandledrejection`。

**关键发现**：`<script type="module">` 的加载错误**不会触发** `window.addEventListener('error')`，也不会触发 `unhandledrejection`。它们只出现在 DevTools 控制台中，而打包后的应用没有 DevTools，因此错误完全不可见。

### 根因 2：`electron` npm 包遮蔽内置模块

Vite 打包主进程代码时，`require('electron')` 解析到 `node_modules/electron`（npm 包，导出二进制路径字符串），而非 Electron 运行时内置模块。导致 `app`、`BrowserWindow` 等核心 API 全部为 `undefined`。

### 根因 3：`BrowserRouter` 与自定义协议不兼容

React Router 的 `BrowserRouter` 依赖 History API 和真实的服务器路径。在 `app://` 或 `file://` 协议下，`window.location.pathname` 为 `/index.html` 而非 `/`，导致路由匹配全部失败，页面无法渲染任何组件。

---

## 修复方案（共 11 项改动）

### 1. 自定义 `app://` 协议（核心修复）

**文件**：`src/main/index.ts`、`electron.vite.config.ts`

替换 `file://` 为自定义 `app://` 协议，提供合法的 origin，彻底解决 ESM CORS 问题：

- `protocol.registerSchemesAsPrivileged()` 在 `app.whenReady()` 前注册 `app` scheme，启用 standard、secure、corsEnabled、bypassCSP、supportFetchAPI
- `protocol.handle('app', ...)` 拦截请求，映射到 `.vite/renderer/` 目录，返回正确 MIME 类型，包含路径穿越保护
- 生产环境使用 `loadURL('app://renderer/index.html')` 替代 `loadFile()`

### 2. Electron 模块 Shim（构建时修复）

**文件**：`src/main/electron-shim.ts`、`electron.vite.config.ts`、多个主进程文件

两层防御确保 `require('electron')` 解析到正确的内置模块：

- **运行时 shim**（`electron-shim.ts`）：检测 `require('electron')` 返回字符串时，清除 require 缓存并重试
- **构建时插件**（`electronShimPlugin`）：Vite 插件在编译时将 `import ... from 'electron'` 替换为 `process.mainModule.require('electron')` 运行时调用
- 所有主进程文件的 electron 导入改为从 `../electron-shim` 导入

### 3. 移除 `crossorigin` 属性

**文件**：`electron.vite.config.ts`

Vite 默认在 `<script>` 标签添加 `crossorigin` 属性，在 Electron 渲染进程中触发不必要的 CORS 检查。新增 `removeCrossoriginPlugin()` 在构建时移除该属性。

### 4. `BrowserRouter` → `HashRouter`

**文件**：`src/renderer/App.tsx`

`HashRouter` 使用 URL fragment（`#/path`）而非 History API，不受协议类型影响，是 Electron 自定义协议应用的标准选择。

### 5. React ErrorBoundary

**文件**：`src/renderer/App.tsx`

新增 class-based `ErrorBoundary` 组件包裹路由，将 React 渲染错误从不可见的白屏转为可见的错误信息展示。

### 6. HTML 诊断脚本

**文件**：`src/renderer/index.html`

内联 `<script>` 块提供运行时诊断：
- 记录启动时间戳
- 监听全局 `error` 和 `unhandledrejection` 事件
- 2 秒后检查 `#root` 是否有子元素
- 若 React 未渲染，使用 `new Function` + `import()` 测试模块是否可执行（绕过 Vite 静态分析）

### 7. render 调用 try-catch 包装

**文件**：`src/renderer/main.tsx`

`ReactDOM.createRoot(...).render(...)` 包装在 try-catch 中，错误输出到 console，通过 `console-message` handler 转发到日志文件。

### 8. 主进程诊断日志

**文件**：`src/main/index.ts`

BrowserWindow 新增两个事件监听：
- `did-fail-load`：记录页面加载失败
- `console-message`：将渲染进程 console 输出转发到主进程日志文件

### 9. 打包路径修复

**文件**：`src/main/index.ts`、`src/main/ipc/index.ts`

`__dirname` 相对路径替换为 `app.getAppPath()` 基础路径，确保在 asar 归档中正确解析：
- Preload 脚本、Tray 图标、package.json 路径均已修正

### 10. Forge 配置清理

**文件**：`forge.config.ts`

扩展 ignore 列表，排除 `.claude`、`.DS_Store`、配置文件，以及 `node_modules/electron` 目录（防止 npm 包与内置模块冲突）。

### 11. 其他修复

- 删除 `index.js`（不再需要的 shim 文件）
- `tsconfig.web.json` 添加 `"target": "ESNext"` 和 `"lib"` 配置
- `Dashboard.tsx`、`TransferList.tsx` 类型修复
- `ftp-client.ts` timeout 选项位置修正

---

## 调试过程（五轮迭代）

| 轮次 | 尝试 | 关键发现 |
|------|------|---------|
| 1 | 注册自定义协议、移除 crossorigin、electron shim | 协议注册成功，但白屏依旧 |
| 2 | 协议处理器添加详细日志 | 确认 JS/CSS 都正确返回（200），但模块从未执行 |
| 3 | ArrayBuffer 转换 + Content-Length 头 | 网络层完全正常，问题在模块执行层 |
| 4 | fetch 诊断测试 | fetch 成功获取模块内容，但 `load`/`error` 事件时序问题导致诊断失效 |
| 5 | `import()` 诊断 + HashRouter + try-catch | 最终确认：BrowserRouter 不兼容是渲染失败的直接原因 |

---

## 经验教训

1. **ESM + Electron 自定义协议**：Vite 的 ESM 输出在 `file://` 下会被 CORS 拦截，必须使用自定义协议并调用 `registerSchemesAsPrivileged`
2. **模块加载错误不可见**：`<script type="module">` 的异常不触发标准 error handler，必须通过 `import()` 动态导入捕获
3. **Vite 静态分析**：内联 `<script>` 中的 `import()` 会被 Vite 解析，需用 `new Function` 隐藏
4. **BrowserRouter vs HashRouter**：Electron 自定义/文件协议应用必须使用 `HashRouter`
5. **`electron` npm 包陷阱**：Vite 打包主进程时，npm 包会遮蔽内置模块，需要 shim 或插件处理
6. **打包路径**：asar 归档中 `__dirname` 行为不同，应使用 `app.getAppPath()`

---

## 最终验证日志

```
[2026-06-05 15:13:59.950] [info]  配置存储初始化完成
[2026-06-05 15:14:00.128] [info]  自定义协议 app:// 已注册，渲染目录: /Applications/FTP Uploader.app/Contents/Resources/app.asar/.vite/renderer
[2026-06-05 15:14:00.222] [info]  已恢复 0 个定时任务
[2026-06-05 15:14:00.223] [info]  已恢复 0 个文件监控
[2026-06-05 15:14:00.223] [info]  应用启动完成
[2026-06-05 15:14:00.366] [info]  [protocol] app://renderer/index.html → index.html (ext=.html)
[2026-06-05 15:14:00.367] [info]  [protocol] 响应: index.html (text/html; charset=utf-8, 1941 bytes)
[2026-06-05 15:14:00.648] [info]  [protocol] app://renderer/assets/index-D8TY9JMl.js → assets/index-D8TY9JMl.js (ext=.js)
[2026-06-05 15:14:00.654] [info]  [protocol] 响应: assets/index-D8TY9JMl.js (application/javascript, 2826476 bytes)
[2026-06-05 15:14:00.660] [info]  [renderer info] [diagnostic] HTML loaded via app://renderer/index.html
[2026-06-05 15:14:00.662] [info]  [protocol] app://renderer/assets/index-CA9Jbh4P.css → assets/index-CA9Jbh4P.css (ext=.css)
[2026-06-05 15:14:00.662] [info]  [protocol] 响应: assets/index-CA9Jbh4P.css (text/css, 3608 bytes)
[2026-06-05 15:14:02.653] [info]  [renderer info] [diagnostic] DOM check: root has 1 children
[2026-06-05 15:14:02.654] [info]  [renderer info] [diagnostic] React rendered successfully!
```
