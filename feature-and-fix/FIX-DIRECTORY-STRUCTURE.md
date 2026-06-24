# 定时任务与文件监控修复

**日期**：2026-06-24

## 概述

本次开发为定时任务新增了"选择文件"按钮，修复了定时任务和文件监控上传时目录结构不一致的问题，并修复了文件监控无法检测文件修改的问题。涉及 3 个文件。

---

## 新增功能：定时任务新增"选择文件"按钮

### 问题描述

定时任务配置页只有"选择文件夹"按钮，无法直接选择单个文件。

### 修复方案

在"选择文件夹"按钮旁新增"选择文件"按钮，调用已有的 `window.electronAPI.selectFiles()` 弹出文件选择对话框，选中的文件路径逐行追加到 sourcePaths 输入框。

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/renderer/pages/ScheduleConfig.tsx` | 新增 handleSelectFiles + "选择文件"按钮 |

---

## Bug 1：定时任务目录结构不一致

### 问题描述

定时任务选择文件夹 `/Users/liguorui/Desktop/备份` 上传时，服务器端路径为 `/home/test.txt`，期望为 `/home/备份/test.txt`（丢失了源文件夹名"备份"）。

### 根因分析

`buildRemotePath` 使用 `path.relative(baseSourcePath, localPath)` 计算相对路径，会丢掉源文件夹自身的名称。

```
sourcePath = /Users/liguorui/Desktop/备份
localPath  = /Users/liguorui/Desktop/备份/test.txt

path.relative(sourcePath, localPath) = test.txt         ← 丢失了"备份"
path.join("/home", "test.txt") = /home/test.txt          ← 错误

期望结果: /home/备份/test.txt
```

### 修复方案

改用 `path.dirname(baseSourcePath)` 作为 `path.relative` 的基准，保留源文件夹自身的名称：

```typescript
// 修复前
const relativePath = path.relative(baseSourcePath, localPath)

// 修复后
const relativePath = path.relative(path.dirname(baseSourcePath), localPath)
```

```
path.dirname(sourcePath) = /Users/liguorui/Desktop
path.relative("/Users/liguorui/Desktop", "/Users/liguorui/Desktop/备份/test.txt") = 备份/test.txt
path.join("/home", "备份/test.txt") = /home/备份/test.txt  ← 正确
```

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/main/services/scheduler.ts` | buildRemotePath 用 path.dirname 保留文件夹名 |

---

## Bug 2：文件监控目录结构不一致

### 问题描述

与 Bug 1 相同，文件监控任务上传时也丢失了监控文件夹名。

### 根因分析

`handleNewFile` 使用 `path.relative(config.watchPath, filePath)` 计算相对路径，同样会丢掉监控文件夹名。

### 修复方案

改用 `path.dirname(config.watchPath)` 作为基准：

```typescript
// 修复前
const relativePath = path.relative(config.watchPath, filePath)

// 修复后
const relativePath = path.relative(path.dirname(config.watchPath), filePath)
```

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/main/services/file-watcher.ts` | handleNewFile 用 path.dirname 保留文件夹名 |

---

## Bug 3：文件修改后不自动上传

### 问题描述

文件监控任务中，已有文件被修改后不会自动重新上传。

### 根因分析

1. `addWatcher` 已注册 `change` 事件，但缺少日志输出，难以排查是否触发
2. `removeWatcher` 中 debounce 定时器清理逻辑有 bug：用 `id` 查找定时器，但实际 key 格式为 `id:filePath`，导致清理失败

### 修复方案

1. `change` 事件增加 `log.info` 日志输出，便于排查
2. `removeWatcher` 改为遍历所有 debounce key，清理以 `id:` 开头的定时器：

```typescript
// 修复前
const timer = this.debounceTimers.get(id)
if (timer) {
  clearTimeout(timer)
  this.debounceTimers.delete(id)
}

// 修复后
for (const [key, timer] of this.debounceTimers.entries()) {
  if (key.startsWith(id + ':')) {
    clearTimeout(timer)
    this.debounceTimers.delete(key)
  }
}
```

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/main/services/file-watcher.ts` | change 事件日志 + removeWatcher debounce 清理修复 |

---

# 改动文件汇总

| 文件 | 新增功能 | Bug1 | Bug2 | Bug3 |
|------|:-------:|:----:|:----:|:----:|
| `src/renderer/pages/ScheduleConfig.tsx` | ✓ | | | |
| `src/main/services/scheduler.ts` | | ✓ | | |
| `src/main/services/file-watcher.ts` | | | ✓ | ✓ |

共 3 个文件。

---

# 验证

1. 定时任务配置页：点击"选择文件"按钮 → 弹出文件选择对话框 → 选中文件路径追加到输入框
2. 定时任务：sourcePath=`/Users/.../备份`, remotePath=`/home` → 上传文件到 `/home/备份/xxx`
3. 文件监控：watchPath=`/Users/.../备份`, remotePath=`/home` → 新文件上传到 `/home/备份/xxx`
4. 文件监控：修改已有文件 → 自动重新上传，日志中可见 `change 事件` 输出
