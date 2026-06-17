# Release v1.0.1-beta

**发布日期**：2026-06-17

---

## 新功能

### 1. 传输记录单条删除

传输列表操作列新增删除按钮，支持对每条传输记录进行单独删除。点击删除按钮后弹出确认对话框，确认后删除记录并从列表中移除。

- 新增 `deleteTransfer(id)` 数据持久化方法
- 新增 `transfer:delete` IPC 通道
- 传输列表操作列添加删除按钮（带确认弹窗）

### 2. 文件夹上传保持目录结构

手动上传选择文件夹后，服务器端目录结构与本地完全一致。

**改进前**：选择文件夹 `/备份` 上传到 `/home`，服务器端所有文件平铺在 `/home/` 下，子目录结构丢失。

**改进后**：服务器端结构为 `/home/备份/subdir/file.txt`，完整保留本地目录层级。

- 重写文件夹选择 IPC，返回 `relativePath` 而非扁平路径
- `TransferTask` 新增 `folderName` 字段
- 传输列表"文件"列：文件夹上传时显示 `📁 文件夹名 (N 个文件)`
- 定时任务和文件监控模块的文件夹上传已正确处理，无需修改

### 3. 实时传输进度

概览模块和手动传输模块新增实时传输进度显示。

**Dashboard（概览）** 活跃传输卡片显示：
- 传输百分比进度条
- 已传输大小 / 总大小（如 `150 MB / 500 MB`）
- 传输速度（如 `1.5 MB/s`）
- 已用时间（如 `已用时 2m 30s`）
- 预计剩余时间（如 `剩余 1m 15s`）

**TransferList（手动传输）** 传输中记录显示：
- "大小"列：实时 `已传输/总量 + 速度`
- "耗时"列：实时已用时间 + 预计剩余时间
- "状态"列：进度条

技术实现：
- FTP/SFTP 客户端改为流式上传，通过 `readStream.on('data')` 实时追踪字节
- TransferProgress 接口扩展 5 个字段：`speed`、`elapsedTime`、`estimatedTimeRemaining`、`totalTransferred`、`totalSize`
- 新增 `onTransferStarted` 事件监听，Dashboard 可实时感知新任务

---

## Bug 修复

### 1. 文件夹上传路径丢失

**问题**：选择文件夹 `/备份` 上传到 `/home`，服务器端文件直接在 `/home/` 下，缺少 `/备份/` 层级。

**根因**：`handleUpload` 构建远程路径时，`f.name` 是文件夹内的 `relativePath`（如 `a.txt`），文件夹名未被拼入路径。

**修复**：通过 `folderSelections` 查找文件所属文件夹，将 `folderName + '/' + f.name` 拼入远程路径。

### 2. 上传时 UI 卡顿

**问题**：手动上传大文件期间，点击其他模块无响应或延迟严重。

**根因**：流式进度回调无节流，`readStream.on('data')` 每 16KB 触发一次 IPC 消息，每秒数万次状态更新淹没渲染进程。

**修复**：
- 进度回调 300ms 节流（关键）：`sendToRenderer` 最多每 300ms 调用一次
- Stream buffer 增大到 256KB：减少 chunk 频率约 16 倍
- 每个文件完成时发送最终进度，确保 UI 更新到 100%

---

## 改动文件清单

| 文件 | 改动说明 |
|------|---------|
| `src/main/services/config-store.ts` | 新增 `deleteTransfer` 方法，TransferTask 添加 `folderName` |
| `src/main/ipc/index.ts` | 新增 `transfer:delete` handler，重写文件夹选择 IPC |
| `src/main/preload/index.ts` | 暴露新 API，扩展 TransferProgress 接口，新增 `onTransferStarted` |
| `src/main/services/ftp-client.ts` | 流式上传进度追踪，stream buffer 增大到 256KB |
| `src/main/services/transfer-manager.ts` | 速度/ETA 计算，300ms 节流，接受 `folderName` |
| `src/renderer/pages/Dashboard.tsx` | 活跃传输显示速度/ETA/已传输大小 |
| `src/renderer/pages/TransferList.tsx` | 删除按钮，文件夹路径修复，实时进度显示 |
| `src/renderer/types/index.ts` | TransferProgress/TransferTask/UploadParams 接口扩展 |
| `src/renderer/types/ipc.ts` | ElectronAPI 接口同步 |

共 9 个文件，+438/-65 行。

---

## 技术细节

### 进度追踪架构

```
ftp-client.ts (readStream.on('data'))
  → onProgress(transferred, totalSize)
    → transfer-manager.ts (300ms throttle)
      → speed = bytesDelta / timeDelta * 1000
      → elapsedTime = now - startTime
      → ETA = remaining / speed * 1000
        → sendToRenderer('transfer:progress', {...})
          → Dashboard.tsx / TransferList.tsx (setState)
```

### 文件夹路径构建

```
IPC dialog:select-folder-for-upload
  → { folderPath, folderName, files: [{ filePath, relativePath }] }
    → handleSelectFolder: name = relativePath
      → handleUpload: nameInPath = folderName + '/' + name
        → remotePath = remotePath + '/' + nameInPath
```
