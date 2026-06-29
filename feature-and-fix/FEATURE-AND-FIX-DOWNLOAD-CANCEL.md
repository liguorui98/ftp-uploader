# 下载取消功能 — 八轮修复记录

**日期**：2026-06-25

## 问题描述

文件管理模块下载文件时，点击"取消下载"按钮无反应，下载无法中断，下载进度对话框不消失。

---

## 第一轮：用 Map 存储活跃下载引用

### 分析

`cancelledDownloads` Set 只存储 ID，cancel handler 没有客户端引用，无法断开连接。

### 修复

改为 `activeDownloads` Map 存储 `{ client, passThrough, localPath }`，cancel 时 destroy passThrough + disconnect 客户端。

### 结果

无效。

---

## 第二轮：AbortSignal 取消机制

### 分析

IPC handler 创建的 passThrough 与客户端内部的 passThrough 是不同实例。cancel handler destroy 的是外层的，客户端内部的不受影响。

### 修复

`TransferClient.download()` 新增 `AbortSignal` 参数，signal abort 时客户端内部 destroy 自己的 passThrough。

### 结果

无效。

---

## 第三轮：关闭底层连接

### 分析

`passThrough.destroy()` 不会中断底层 FTP/SFTP 库的 socket 读取。`basic-ftp` 的 `downloadTo()` 继续从 socket 读数据，流被 destroy 只是丢弃数据，不会 reject promise。

### 修复

新增 `cancelClient` 回调参数，signal abort 时调用 `client.disconnect()` 关闭底层连接。

### 结果

无效。

---

## 第四轮：销毁 dataSocket

### 分析

通过阅读 `basic-ftp` 源码发现：`Client.close()` 关闭的是控制连接（control socket），数据传输通过独立的 `dataSocket` 进行，`close()` 不一定中断活跃的 data socket。

### 修复

新增 `cancel()` 方法，直接 `this.client.ftp.dataSocket?.destroy()` 销毁数据传输 socket。

### 结果

无效。

---

## 第五轮：诊断日志

### 分析

理论链路应可行但实际不工作，需要加日志定位失败点。

### 修复

关键节点加 `log.info` 日志；cancel handler 直接调用 `client.cancel()` + `abortController.abort()` 双保险；兜底 3 秒超时强制关闭弹框。

### 结果

日志显示 `ReferenceError: log is not defined`。

---

## 第六轮：导入 log 模块

### 分析

`log` 未在 `ipc/index.ts` 中导入。所有 `log.info()` 调用在 catch/finally 块中抛出 `ReferenceError`，导致 `browser:download-complete` 事件从未发送，Modal 永远不关闭。

### 修复

```ts
import log from 'electron-log'
```

### 结果

Modal 可以关闭了，但取消按钮仍无反应。日志显示没有 `[cancel-download] called`。

---

## 第七轮：React 状态闭包陈旧

### 分析

日志确认 cancel IPC 从未被调用。`handleCancelDownload` 中 `downloadId` 为空。

`browserDownload` 是 `await` 的，阻塞期间组件不会重新渲染。`setDownloadId` 调用后只有当 `await` 返回后组件才 re-render，但 Modal 的 cancel 按钮绑定的是旧 render 的 `handleCancelDownload`，其中 `downloadId` 仍是 `''`。

### 修复

使用 `useRef` 保持最新值：

```tsx
const downloadIdRef = useRef('')
// handleDownload 中：downloadIdRef.current = result.downloadId
// handleCancelDownload 中：const id = downloadIdRef.current
```

### 结果

仍无效。因为 `downloadIdRef.current` 在 `await browserDownload()` 返回后才设置，而 IPC handler 在下载完成才 return。

---

## 第八轮：通过事件立即发送 downloadId（最终修复）

### 分析

**`browserDownload` IPC handler 只在下载完成后才 return。** `downloadId` 在 handler 内部创建，但 renderer 的 `await` 要等整个下载结束才能拿到 `downloadId`。下载期间 `downloadIdRef.current` 始终为空。

### 修复

在下载开始前，通过 `webContents.send('browser:download-started', { downloadId })` 立即发送 downloadId。renderer 监听此事件设置 ref。

```ts
// ipc/index.ts — 在 client.download() 前
sendToRenderer('browser:download-started', { downloadId })

// ServerBrowser.tsx — useEffect 中监听
window.electronAPI.onBrowserDownloadStarted?.((data) => {
  downloadIdRef.current = data.downloadId
  setDownloadId(data.downloadId)
})
```

### 结果

取消下载功能正常工作。

---

## 根因总结

| 轮次 | 以为的根因 | 实际根因 |
|:----:|-----------|---------|
| 1 | cancel handler 没有客户端引用 | passThrough 是不同实例 |
| 2 | passThrough 实例不同 | destroy passThrough 不中断 socket |
| 3 | 流 destroy 不中断 socket | close() 关的是控制连接 |
| 4 | close() 关控制连接 | 需要直接销毁 dataSocket |
| 5 | 需要诊断日志 | log 未导入导致 catch 崩溃 |
| 6 | log 未导入 | cancel IPC 从未被调用 |
| 7 | React 状态闭包陈旧 | await 阻塞导致 ref 无法设置 |
| 8 | **IPC handler 同步返回 downloadId** | **通过事件异步发送** |

## 最终改动文件

| 文件 | 改动 |
|------|------|
| `src/main/services/ftp-client.ts` | 流式下载 + AbortSignal + cancel() 方法 |
| `src/main/ipc/index.ts` | 进度推送 + 取消下载 + download-started 事件 |
| `src/main/preload/index.ts` | 新增下载相关 API 和事件监听 |
| `src/renderer/types/ipc.ts` | 新增方法签名 |
| `src/renderer/types/index.ts` | 新增 DownloadProgress 类型 |
| `src/renderer/pages/ServerBrowser.tsx` | 下载进度弹框 + useRef + download-started 监听 |
