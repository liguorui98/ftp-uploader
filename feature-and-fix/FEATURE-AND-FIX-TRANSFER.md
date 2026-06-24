# 传输模块功能增强与问题修复

## 概述

本次开发为 FTP Uploader 的传输模块新增 3 项功能，测试后发现并修复 2 个问题。涉及 9 个文件，+438/-65 行。

---

# 第一部分：新功能实现

## 功能一：传输记录单条删除

### 需求描述

传输列表只有"清空全部"按钮，无法删除单条记录。用户需要能对每条传输记录进行单独删除操作。

### 实现方案

沿用项目中 `deleteServer`、`deleteSchedule`、`deleteWatcher` 的既有模式，全链路添加删除能力：

**数据层** — `config-store.ts` 新增 `deleteTransfer(id)` 方法：
```typescript
deleteTransfer(id: string): void {
  const transfers = this.store.get('transfers', [])
  this.store.set('transfers', transfers.filter((t) => t.id !== id))
}
```

**IPC 层** — `ipc/index.ts` 注册 `transfer:delete` handler，直接调用 `configStore.deleteTransfer(id)`

**Preload 层** — `preload/index.ts` 在 `ElectronAPI` 接口和 `contextBridge` 中暴露 `deleteTransfer`

**UI 层** — `TransferList.tsx` 在操作列添加 `<Popconfirm>` + `<Button danger icon={<DeleteOutlined />} />`，点击后调用 IPC 删除并从 state 中移除

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/main/services/config-store.ts` | 新增 `deleteTransfer(id)` 方法 |
| `src/main/ipc/index.ts` | 新增 `transfer:delete` IPC handler |
| `src/main/preload/index.ts` | 接口和 contextBridge 各添加一行 |
| `src/renderer/types/ipc.ts` | ElectronAPI 接口添加 `deleteTransfer` |
| `src/renderer/pages/TransferList.tsx` | 添加 `handleDeleteTransfer` 函数和删除按钮 |

---

## 功能二：文件夹上传保持目录结构

### 需求描述

1. 手动上传选择文件夹后，服务器端目录结构应与本地一致（如本地 `/备份/subdir/file.txt` → 服务器 `/home/备份/subdir/file.txt`）
2. 传输列表应只显示文件夹名，不要列出文件夹内的所有文件
3. 定时任务和文件监控模块的文件夹上传已正确处理，无需修改

### 问题分析

原有实现中，`dialog:select-folder-for-upload` IPC handler 使用 `fast-glob` 递归扫描文件夹后返回扁平的绝对路径列表（`string[]`）。`handleUpload` 用 `fileName`（basename）构建远程路径，导致子目录结构丢失。

定时任务（`scheduler.ts`）和文件监控（`file-watcher.ts`）已通过 `path.relative()` 正确保留了目录结构，只需将同样的模式应用到手动上传流程。

### 实现方案

**IPC 层改造** — 修改 `dialog:select-folder-for-upload` handler，返回结构化对象而非扁平数组：
```typescript
return {
  folderPath,
  folderName: path.basename(folderPath),
  files: files.map((filePath) => ({
    filePath,
    relativePath: path.relative(folderPath, filePath),
  })),
}
```

**数据模型扩展** — `TransferTask` 接口添加 `folderName?: string` 字段（`config-store.ts`、`preload/index.ts`、`types/index.ts` 三处同步），`UploadParams` 接口添加 `folderName?: string`，`transfer-manager.ts` 的 `enqueue` 方法接受并传播 `folderName`

**UI 层改造** — `TransferList.tsx`：
- `handleSelectFolder`：用 `relativePath` 作为 `SelectedFile.name`（如 `subdir/file.txt`）
- `handleUpload`：通过 `folderSelections` 查找文件所属文件夹，将 `folderName + '/' + f.name` 拼入远程路径
- "文件"列：有 `folderName` 时显示 `<FolderOpenOutlined /> 文件夹名 (N 个文件)`，否则显示原有文件列表

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/main/ipc/index.ts` | 重写 `dialog:select-folder-for-upload` 返回值 |
| `src/main/preload/index.ts` | 更新 `selectFolderForUpload` 返回类型，TransferTask/UploadParams 添加 `folderName` |
| `src/renderer/types/ipc.ts` | 同步接口类型 |
| `src/renderer/types/index.ts` | TransferTask/UploadParams 添加 `folderName` |
| `src/main/services/config-store.ts` | TransferTask 接口添加 `folderName` |
| `src/main/services/transfer-manager.ts` | enqueue 接受 `folderName`，设置到 task |
| `src/renderer/pages/TransferList.tsx` | 重写文件夹选择和上传逻辑，更新文件列显示 |

---

## 功能三：实时传输进度

### 需求描述

概览模块和手动传输模块需要显示实时传输进度，包括：传输百分比、已经传输的大小、已经传输的时间、预计传输剩余时间。

### 问题分析

原有实现中：
- FTP/SFTP 客户端的 `onProgress` 回调仅在文件上传完成后调用一次（设置 `transferred = totalSize`），进度条直接从 0% 跳到 100%
- `speed` 字段始终为 0（有 TODO 注释）
- 无已用时间和 ETA 计算
- Dashboard 只显示进度条百分比

### 实现方案

**流式进度追踪** — 修改 `ftp-client.ts` 中 FTPClient 和 SFTPClient 的 `upload` 方法：
- 使用 `fs.createReadStream(localPath, { highWaterMark: 256 * 1024 })` 创建读取流
- 监听 `readStream.on('data')` 事件，累计已传输字节数并调用 `onProgress(transferred, totalSize)`

**速度/ETA 计算引擎** — 修改 `transfer-manager.ts` 的 `executeTask` 方法：
- 在文件循环前初始化速度追踪变量（`lastTransferred`、`lastTime`、`speed`）
- 在 progress callback 中计算：
  - `speed = (totalTransferred - lastTransferred) / timeDelta * 1000`（bytes/second）
  - `elapsedTime = now - task.startTime`
  - `estimatedTimeRemaining = (totalSize - totalTransferred) / speed * 1000`
- 通过 `transfer:progress` 事件发送完整的进度数据

**接口扩展** — `TransferProgress` 接口添加 5 个新字段：
```typescript
export interface TransferProgress {
  id: string
  fileIndex: number
  transferred: number
  total: number
  speed: number                    // bytes/second（新增）
  elapsedTime: number              // ms（新增）
  estimatedTimeRemaining: number   // ms（新增）
  totalTransferred: number         // bytes（新增）
  totalSize: number                // bytes（新增）
}
```

**事件监听扩展** — preload 新增 `onTransferStarted` 事件（`transfer:started` 已在 main process 中发送但此前未被 renderer 监听）

**Dashboard 更新** — 活跃传输卡片显示：`已传输 X MB / Y MB | 1.5 MB/s | 已用时 2m 30s | 剩余 1m 15s`

**TransferList 更新** — "大小"列显示实时 `transferred/total + speed`；"耗时"列显示实时已用时间 + ETA；"状态"列显示进度条

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/main/services/ftp-client.ts` | FTPClient 和 SFTPClient 流式上传 + 进度追踪 |
| `src/main/services/transfer-manager.ts` | 速度/ETA 计算引擎，进度事件发送 |
| `src/main/preload/index.ts` | TransferProgress 接口扩展，新增 `onTransferStarted` |
| `src/renderer/types/index.ts` | TransferProgress 接口扩展 |
| `src/renderer/types/ipc.ts` | 同步接口，新增 `onTransferStarted` |
| `src/renderer/pages/Dashboard.tsx` | 活跃传输显示速度/ETA/已传输大小 |
| `src/renderer/pages/TransferList.tsx` | 传输中记录显示实时进度 |

---

# 第二部分：测试问题修复

## Bug 1：文件夹上传路径丢失

### 问题描述

选择文件夹 `/备份`（含子文件夹 `subdir`）上传到服务器路径 `/home`，期望服务器端结构为 `/home/备份/subdir/...`，实际结果为 `/home/subdir/...`，文件夹名 `备份` 丢失。

### 根因分析

`TransferList.tsx` 的 `handleUpload` 中，`f.name` 是文件夹内的 `relativePath`（如 `a.txt`、`subdir/file.txt`），但文件夹名本身（如 `备份`）从未被拼入远程路径。

```typescript
// 原代码 — f.name = "subdir/file.txt"，缺少 "备份/" 前缀
remotePath: remotePath
  ? remotePath.replace(/\/$/, '') + '/' + f.name
  : f.name,
```

`folderName` 虽然被计算并作为 metadata 传递，但从未参与路径构建。

### 修复方案

在 `handleUpload` 的 `files` 映射中，为每个文件通过 `folderSelections` 查找其所属文件夹，将文件夹名插入路径：

```typescript
files: selectedFiles.map((f) => {
  const folder = folderSelections.find((fs) =>
    fs.files.some((ff) => ff.filePath === f.path)
  )
  const nameInPath = folder
    ? folder.folderName + '/' + f.name  // "备份/subdir/file.txt"
    : f.name
  return {
    localPath: f.path,
    remotePath: remotePath
      ? remotePath.replace(/\/$/, '') + '/' + nameInPath
      : nameInPath,
  }
}),
```

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/renderer/pages/TransferList.tsx` | `handleUpload` 路径拼接修复 |

---

## Bug 2：上传时 UI 卡顿

### 问题描述

手动上传大文件期间，点击其他模块（概览、服务器设置等）无响应或需要等待很长时间才能跳转。

### 根因分析

`readStream.on('data')` 每 16KB（Node.js 默认 `highWaterMark`）触发一次回调 → 调用 `onProgress` → `transfer-manager.ts` 的 `sendToRenderer` **无任何节流** → 每秒向渲染进程发送数万次 IPC 消息 → React 状态更新淹没渲染进程主线程。

频率估算：SSD 读取速度 ~500MB/s，16KB chunks → ~30,500 次/秒的 IPC 消息，每次触发两个 `setState` 调用。

### 修复方案（三层）

**A. 关键修复：进度回调节流** — `transfer-manager.ts`

在 `executeTask` 中，将 `sendToRenderer('transfer:progress', ...)` 限制为最多每 300ms 调用一次：
```typescript
let lastProgressEmitTime = 0
const PROGRESS_THROTTLE_MS = 300

// 在 progress callback 中
if (now - lastProgressEmitTime >= PROGRESS_THROTTLE_MS) {
  lastProgressEmitTime = now
  // 计算 speed, ETA，发送事件
}
```

每个文件完成时额外发送一次最终进度，确保 UI 更新到 100%。

**B. 辅助修复：增大 stream buffer** — `ftp-client.ts`

为 `fs.createReadStream` 添加 `highWaterMark: 256 * 1024`（256KB），减少 chunk 频率约 16 倍。

**C. 辅助修复：代码整理** — `Dashboard.tsx`

配合节流后的事件频率，整理进度更新逻辑。

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/main/services/transfer-manager.ts` | 进度回调 300ms 节流，文件完成时发送最终进度 |
| `src/main/services/ftp-client.ts` | `createReadStream` 的 `highWaterMark` 从 16KB 增大到 256KB |
| `src/renderer/pages/Dashboard.tsx` | 进度更新逻辑整理 |

---

# 改动文件汇总

| 文件 | 功能一 | 功能二 | 功能三 | Bug1 | Bug2 |
|------|:------:|:------:|:------:|:----:|:----:|
| `config-store.ts` | ✓ | ✓ | | | |
| `ipc/index.ts` | ✓ | ✓ | | | |
| `preload/index.ts` | ✓ | ✓ | ✓ | | |
| `types/ipc.ts` | ✓ | ✓ | ✓ | | |
| `types/index.ts` | | ✓ | ✓ | | |
| `transfer-manager.ts` | | ✓ | ✓ | | ✓ |
| `ftp-client.ts` | | | ✓ | | ✓ |
| `Dashboard.tsx` | | | ✓ | | ✓ |
| `TransferList.tsx` | ✓ | ✓ | ✓ | ✓ | |

共 9 个文件，+438/-65 行。

---

# 验证

1. **删除功能**：传输完成后，点击删除按钮，确认记录消失且刷新后仍不存在
2. **文件夹上传**：选择含子目录的文件夹上传，确认服务器端目录结构与本地一致；确认传输列表只显示文件夹名
3. **实时进度**：上传大文件，确认 Dashboard 和传输列表显示实时速度、已传输大小、已用时间、预计剩余时间
4. **路径正确性**：本地 `/备份` 上传到 `/home`，确认服务器端为 `/home/备份/...`
5. **UI 响应性**：上传大文件期间快速切换模块，确认页面即时响应无延迟
