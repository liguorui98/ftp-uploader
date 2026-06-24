# Release v1.0.4-beta

**发布日期**：2026-06-24

---

## 新增功能

### 1. 传输列表新增取消按钮

传输列表操作列新增取消按钮，状态为等待中/连接中/传输中时可点击取消上传任务。取消后会断开 FTP/SFTP 连接，立即中断实际传输。

### 2. 打开文件夹并选中文件

传输列表的"打开文件"改为"打开文件夹"，点击后在系统文件管理器中打开文件所在目录并自动选中该文件（使用 `shell.showItemInFolder`）。

---

## Bug 修复

### 1. 取消传输不中断实际传输

修复点击取消后 UI 状态变为"已取消"但底层 FTP/SFTP 传输仍在继续的问题。通过存储客户端引用并在取消时调用 `disconnect()` 断开连接，实现真正的传输中断。

### 2. 传输历史分页选择器失效

修复表格右下角"每页条数"选择器点击无反应的问题。将 `pageSize` 改为 `defaultPageSize`，从受控模式切换为非受控模式。

---

## 改动文件清单

| 文件 | 改动说明 |
|------|---------|
| `src/main/ipc/index.ts` | 新增 `shell:show-item-in-folder` IPC handler |
| `src/main/preload/index.ts` | 接口 + contextBridge 添加 `showItemInFolder` |
| `src/renderer/types/ipc.ts` | ElectronAPI 添加 `showItemInFolder` 签名 |
| `src/renderer/pages/TransferList.tsx` | 打开文件夹 + 取消按钮 + 分页修复 |
| `src/main/services/transfer-manager.ts` | activeClients + cancelledTasks 实现真正取消 |

共 5 个文件。

---

## 技术细节

### 取消传输实现

```
cancel(taskId)
  ├── cancelledTasks.add(taskId)     // 标记取消，防止重试
  ├── activeTasks.delete(taskId)     // 从活跃任务移除
  ├── client.disconnect()            // 断开连接，中断传输
  └── processQueue()                 // 处理队列中下一个任务

executeTask catch
  └── if cancelledTasks.has(id) → return  // 跳过重试
```

### shell.showItemInFolder vs shell.openPath

| 方法 | 行为 |
|------|------|
| `shell.openPath(filePath)` | 用系统默认应用打开文件 |
| `shell.showItemInFolder(filePath)` | 在文件管理器中打开并选中文件 |
