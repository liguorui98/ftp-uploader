# Windows 窗口标题栏问题 — 根因分析与修复总结

## 问题描述

FTP Uploader 使用 Electron 的 `titleBarStyle: 'hiddenInset'` 实现自定义标题栏，macOS 上红绿灯按钮正常显示且向内缩进。

**现象**：在 Windows 上打包运行后，窗口**标题栏与titleBar重复**。

---

## 根因分析

### 核心问题：`hiddenInset` 是 macOS 专有属性

Electron 的 `titleBarStyle: 'hiddenInset'` 是 macOS 特有的窗口样式，功能是：
- 隐藏默认标题栏
- 将红绿灯按钮（关闭/最小化/最大化）向内缩进
- 保留原生窗口控制能力

在 Windows 平台上，`hiddenInset` **没有任何效果**，也不会回退到默认标题栏。结果是窗口既没有自定义标题栏，也没有原生控制按钮。
Windows 等效效果 = 隐藏标题栏 + 内容全屏 + 保留原生窗口按钮（最小 / 最大 / 关闭）+ 按钮往里缩进一点
用：
titleBarStyle: 'hidden'
再加 titleBarOverlay（Windows 专属）

### Windows 的正确方案：`hidden` + `titleBarOverlay`

Windows 平台需要使用两个配合的 API：

1. **`titleBarStyle: 'hidden'`**：隐藏默认标题栏
2. **`titleBarOverlay`**：在隐藏标题栏的同时，保留原生的最小化/最大化/关闭按钮区域

`titleBarOverlay` 支持以下配置：

| 属性 | 类型 | 说明 |
|---|---|---|
| `color` | string | 按钮区域背景色，设为 `'transparent'` 与应用融合 |
| `symbolColor` | string | 按钮图标颜色，`'#000000'` 适合浅色主题 |
| `height` | number | 按钮区域高度（px），32px 与 macOS 标题栏高度接近 |

---

## 修复方案

### 跨平台标题栏配置

**Windows 等效效果 = 隐藏标题栏 + 内容全屏 + 保留原生窗口按钮（最小 / 最大 / 关闭）+ 按钮往里缩进一点用：titleBarStyle: 'hidden',再加 titleBarOverla（Windows 专属）**

**改动文件**：[src/main/index.ts:134-166](src/main/index.ts#L134-L166)

根据 `process.platform` 动态选择标题栏策略：

```typescript
// 跨平台标题栏配置
const platformTitleBarConfig = process.platform === 'darwin'
  ? {
      // macOS: 使用 hiddenInset，红绿灯向内缩进
      titleBarStyle: 'hiddenInset' as const,
    }
  : {
      // Windows: 使用 hidden + titleBarOverlay，保留原生控制按钮
      titleBarStyle: 'hidden' as const,
      titleBarOverlay: {
        color: 'transparent',
        symbolColor: '#000000',
        height: 32
      }
    }
```

应用到 BrowserWindow：

```typescript
this.mainWindow = new BrowserWindow({
  width: 1200,
  height: 800,
  minWidth: 900,
  minHeight: 600,
  webPreferences: { ... },
  // 应用跨平台标题栏配置
  ...platformTitleBarConfig,
  show: false,
})
```

---

## 关键区别：macOS vs Windows 标题栏

| 特性 | macOS | Windows |
|---|---|---|
| 配置方式 | `titleBarStyle: 'hiddenInset'` | `titleBarStyle: 'hidden'` + `titleBarOverlay` |
| 控制按钮 | 红绿灯（关闭/最小化/最大化） | 原生窗口按钮（最小化/最大化/关闭） |
| 按钮位置 | 左上角，向内缩进 | 右上角，overlay 区域 |
| 背景色 | 系统默认 | 可自定义（建议透明） |
| 按钮颜色 | 系统默认 | 可自定义（黑色/白色） |

---

## 经验教训

1. **Electron API 跨平台差异**：`titleBarStyle` 的 `'hiddenInset'` 是 macOS 专有值，Windows 上静默失效，不会报错也不会回退
2. **Windows 使用 `titleBarOverlay`**：这是 Electron 在 Windows 上实现自定义标题栏同时保留原生控件的标准方式
3. **透明背景融合**：将 `titleBarOverlay.color` 设为 `'transparent'` 可让按钮区域与应用界面无缝融合
4. **`symbolColor` 适配主题**：浅色主题用 `'#000000'`，深色主题用 `'#ffffff'`，当前固定为黑色

---

## 验证

macOS 上红绿灯按钮正常显示且向内缩进；Windows 上右上角显示原生最小化/最大化/关闭按钮，背景透明与应用界面融合。
