# Windows .exe 打包问题 — 根因分析与修复总结

## 问题描述

FTP Uploader 使用 **electron-forge** 打包 macOS DMG 成功后，尝试用相同工具链打包 Windows 安装包。

**现象**：执行 `npm run make:win`（即 `electron-vite build && electron-forge make --platform win32`）后，构建进度卡在 **"Finalizing package"** 阶段，进程不退出也不报错。反复重试多次（包括直接调用 `npx electron-forge package --platform win32`）均卡在同一位置。Electron 二进制文件已下载（108MB zip），但解压到临时目录后无法完成。

---

## 根因分析

### 核心问题：electron-forge / electron-packager 在 Windows 上打包卡死

electron-forge 底层使用 `electron-packager` 进行打包。在 Windows 平台上，`electron-packager` 的文件提取/复制步骤出现挂起：

- Electron 二进制 zip 文件已成功下载
- 解压到临时目录（`C:\Users\...\AppData\Local\Temp\electron-packager-*`）开始但未完成
- 进程返回 exit code 0，但 `out/` 目录未生成任何产物
- 无错误日志输出，无法定位具体阻塞点

该问题可能与 Windows 文件系统权限、杀毒软件实时扫描、或 electron-packager 在 Windows 上的文件 I/O 处理有关，但无法确认具体原因。

### 辅助问题

1. **缺少 Windows 图标**：`resources/` 目录仅有 `icon.icns`（Mac）和 `icon.png`，缺少 `.ico` 格式
2. **生产环境 DevTools 默认打开**：`src/main/index.ts` 生产环境分支中 `openDevTools()` 未移除

---

## 修复方案

### 1. 改用 electron-builder（核心修复）

放弃 electron-forge 的 Windows 打包，改用 **electron-builder** 生成 NSIS 安装包。

**原因**：
- electron-builder 是 Electron 生态中最成熟的打包工具之一
- 对 Windows 平台支持更好，NSIS 安装包功能丰富（自定义安装目录、卸载程序等）
- 不依赖 electron-packager，规避了卡死问题

**改动文件**：[package.json](package.json)

**具体改动**：

1. 安装依赖：
```bash
npm install --save-dev electron-builder
```

2. 添加 `build:win` 脚本：
```json
"scripts": {
  "build:win": "electron-vite build && electron-builder --win"
}
```

3. 添加 electron-builder 配置：
```json
"build": {
  "appId": "com.liguorui.ftp-uploader",
  "productName": "FTP Uploader",
  "directories": { "output": "out" },
  "files": [".vite/**/*", "resources/**/*", "package.json"],
  "win": {
    "target": [{ "target": "nsis", "arch": ["x64"] }],
    "icon": "resources/icon.ico"
  },
  "nsis": {
    "oneClick": false,
    "allowToChangeInstallationDirectory": true,
    "installerIcon": "resources/icon.ico",
    "uninstallerIcon": "resources/icon.ico"
  },
  "asar": true
}
```

### 2. 生成 Windows 图标

**改动文件**：`resources/icon.ico`（新建）

从 `resources/icon.png` 转换为 ICO 格式。ICO 文件结构：6 字节 header + 16 字节 directory entry + PNG 数据。使用 Node.js 脚本直接写入二进制格式，无需第三方依赖。

### 3. 移除生产环境 DevTools

**改动文件**：[src/main/index.ts:157](src/main/index.ts#L157)

移除生产环境分支中的 `this.mainWindow.webContents.openDevTools()` 调用。该行代码导致打包后的应用每次启动都自动打开开发者工具。

---

## 执行步骤

```bash
# 1. 安装依赖
npm install

# 2. 构建 + 打包 Windows 安装包
npm run build:win
```

构建过程：
1. `electron-vite build` — 编译主进程、preload、渲染进程
2. `electron-builder --win` — 打包为 NSIS 安装包

---

## 输出产物

| 文件 | 大小 | 说明 |
|---|---|---|
| `out/FTP Uploader Setup 1.0.0-beta.exe` | 86 MB | NSIS 安装包 |
| `out/win-unpacked/` | — | 解压后的应用目录 |
| `out/latest.yml` | — | 自动更新配置 |
| `out/FTP Uploader Setup 1.0.0-beta.exe.blockmap` | — | 差量更新用 |

---

## 关键区别：electron-forge vs electron-builder

| 特性 | electron-forge | electron-builder |
|---|---|---|
| Windows 安装包格式 | Squirrel.Windows | NSIS |
| 自定义安装目录 | 不支持 | 支持 |
| 配置方式 | `forge.config.ts` | `package.json` 中 `build` 字段 |
| macOS 打包 | 正常工作 | — |
| Windows 打包 | 卡死 | 正常工作 |

> **注意**：macOS 打包仍使用 electron-forge（`npm run make:mac`），Windows 打包使用 electron-builder（`npm run build:win`）。

---

## 经验教训

1. **工具链差异**：同一打包工具在不同平台表现可能完全不同，macOS 成功不代表 Windows 也能成功
2. **electron-builder 更成熟**：对于 Windows 打包，electron-builder 的 NSIS 方案比 electron-forge 的 Squirrel.Windows 更稳定
3. **ICO 格式**：Windows 图标必须是 `.ico` 格式，可从 PNG 直接转换，无需安装额外依赖
4. **生产环境检查**：打包前应检查是否有 DevTools、console.log 等调试代码遗留

---

## 验证日志

```
  • electron-builder  version=26.15.0
  • loaded configuration  file=package.json
  • writing effective config  file=out/builder-effective-config.yaml
  • rebuilding  platform=win32 arch=x64
  • packaging       platform=win32 arch=x64 electron=30.5.1
  • building        target=NSIS arch=x64
  • building block map  blockMapFile=out/FTP Uploader Setup 1.0.0-beta.exe.blockmap
```
