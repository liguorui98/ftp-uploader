# 下载进度弹框与取消下载功能

**日期**：2026-06-25

## 概述

为文件管理模块的下载功能增加实时进度弹框，显示下载进度、下载速度、剩余时间，支持取消下载。涉及 6 个文件。

---

## 功能 1：FTP/SFTP 客户端流式下载与取消支持

### 问题描述

原 `download()` 方法使用一次性下载（`downloadTo(localPath)` / `get(remotePath, localPath)`），不支持实时进度回调和取消。

### 修复方案

1. 使用 `PassThrough` 流拦截数据块，实时触发 `onProgress(transferred, total)` 回调
2. 新增 `AbortSignal` 参数，signal abort 时销毁底层连接中断传输
3. 新增 `cancel()` 方法：FTP 直接销毁 `dataSocket` + `close()`；SFTP 调用 `end()`

```typescript
interface TransferClient {
  download(remotePath: string, localPath: string, onProgress?: ProgressCallback, signal?: AbortSignal): Promise<void>
  cancel(): void
}

// FTPClient.cancel — 销毁数据传输 socket
cancel(): void {
  this.client.ftp.dataSocket?.destroy(new Error('下载已取消'))
  this.client.close()
}

// SFTPClient.cancel — 关闭 SSH 连接
cancel(): void {
  this.client.end()
}
```

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/main/services/ftp-client.ts` | download 改为流式 + AbortSignal + cancel() 方法 |

---

## 功能 2：下载进度 IPC 通道

### 问题描述

需要将下载进度实时推送到渲染进程，并支持取消下载。

### 修复方案

`browser:download` handler 中：
- 传入 `onProgress` 回调，计算速度/ETA（300ms 限流），通过 `webContents.send('browser:download-progress')` 推送
- 通过 `webContents.send('browser:download-started')` 立即发送 downloadId（不等待下载完成）
- 新增 `browser:cancel-download` handler，调用 `abortController.abort()` + `client.cancel()`
- 使用 `AbortController` + `activeDownloads` Map 管理活跃下载

新增 IPC 通道：

| IPC Channel | 说明 |
|-------------|------|
| `browser:download-started` | 下载开始时立即发送 downloadId |
| `browser:download-progress` | 实时进度（transferred, total, speed, ETA） |
| `browser:download-complete` | 下载完成/失败/取消 |
| `browser:cancel-download` | 取消下载 |

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/main/ipc/index.ts` | 新增 3 个事件通道 + cancel handler + 速度/ETA 计算 |
| `src/main/preload/index.ts` | 新增 4 个 API 方法/监听器 |

---

## 功能 3：下载进度弹框 UI

### 问题描述

下载期间无反馈，用户无法了解下载状态或取消下载。

### 修复方案

新增下载进度 Modal，包含：
- `Progress` 进度条（百分比 + 动画）
- 已下载大小 / 总大小
- 下载速度（KB/s 或 MB/s）
- 剩余时间
- 取消下载按钮

关键实现细节：
- 使用 `useRef` 存储 downloadId，避免 React 状态闭包陈旧问题
- 监听 `browser:download-started` 事件立即设置 ref（IPC handler 在下载完成才 return）
- 取消后 3 秒兜底强制关闭弹框
- 保存对话框取消时重置 downloading 状态

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/renderer/pages/ServerBrowser.tsx` | 新增下载状态 + 进度 Modal + 事件监听 |
| `src/renderer/types/ipc.ts` | 新增 DownloadProgress 类型和方法签名 |
| `src/renderer/types/index.ts` | 新增 DownloadProgress 接口 |

---

# 改动文件汇总

| 文件 | 功能1 | 功能2 | 功能3 |
|------|:-----:|:-----:|:-----:|
| `src/main/services/ftp-client.ts` | ✓ | | |
| `src/main/ipc/index.ts` | | ✓ | |
| `src/main/preload/index.ts` | | ✓ | |
| `src/renderer/pages/ServerBrowser.tsx` | | | ✓ |
| `src/renderer/types/ipc.ts` | | | ✓ |
| `src/renderer/types/index.ts` | | | ✓ |

共 6 个文件。

---

# 验证

1. 点击文件下载 → 弹出系统保存对话框 → 选择路径后弹出进度弹框
2. 进度条实时更新，显示已下载大小、速度、剩余时间
3. 点击"取消下载" → 下载立即中断，弹框关闭，提示"下载已取消"
4. 取消后无残留临时文件
5. 取消后可正常再次下载同一文件
6. 保存对话框点击取消 → 进度弹框消失，无异常
7. 下载完成 → 弹框自动关闭，提示"下载完成"
8. FTP 和 SFTP 服务器均正常支持下载进度和取消
