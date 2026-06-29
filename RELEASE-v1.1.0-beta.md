# Release v1.1.0-beta

**发布日期**：2026-06-25

---

## 新增功能

### 1. 服务器文件浏览器

新增"文件管理"页面，支持可视化浏览远程 FTP/SFTP 服务器文件，提供完整的文件管理能力：

- **目录浏览**：选择服务器后自动列出远程文件，点击文件夹可进入子目录
- **面包屑导航**：显示当前路径层级，支持点击跳转到任意层级
- **新建文件夹**：在当前目录下创建新文件夹
- **文件下载**：弹出系统保存对话框，将远程文件下载到本地
- **删除**：支持删除文件和文件夹，操作前需确认
- **重命名**：支持重命名文件和文件夹
- **文件信息**：展示文件名、大小、修改时间、权限等信息

### 2. 下载进度弹框与取消下载

文件管理模块下载文件时弹出进度弹框，实时显示下载进度、速度、剩余时间，支持取消下载：

- **实时进度**：进度条 + 已下载大小 + 下载速度 + 预估剩余时间
- **取消下载**：点击取消按钮立即中断传输，清理临时文件
- **流式下载**：FTP/SFTP 客户端改为流式下载，支持实时进度回调
- **AbortSignal 取消机制**：通过 AbortController + 底层 socket 销毁实现真正的传输中断

### 3. FTP/SFTP 客户端能力扩展

`TransferClient` 接口新增 `delete`、`rename`、`cancel` 方法，FTP 和 SFTP 两种协议均已实现。

---

## 改动文件清单

| 文件 | 改动说明 |
|------|---------|
| `src/main/services/ftp-client.ts` | TransferClient 接口 + FTPClient/SFTPClient 新增 delete/rename/cancel + 流式下载 + AbortSignal |
| `src/main/ipc/index.ts` | 新增 registerBrowserIPC()，注册 5 个文件浏览器 IPC handler + 下载进度推送 + 取消下载 |
| `src/main/index.ts` | registerIPC 中调用 registerBrowserIPC |
| `src/main/preload/index.ts` | ElectronAPI 接口 + contextBridge 新增浏览器方法 + 下载事件监听 |
| `src/renderer/types/ipc.ts` | ElectronAPI 接口新增方法签名 |
| `src/renderer/types/index.ts` | 新增 RemoteFileInfo、DownloadProgress 类型定义 |
| `src/renderer/pages/ServerBrowser.tsx` | **新建** — 文件浏览器页面组件 + 下载进度弹框 |
| `src/renderer/App.tsx` | 新增 /browser 路由 |
| `src/renderer/components/Layout/AppLayout.tsx` | 侧边栏新增"文件管理"菜单项 |

共 9 个文件（1 个新建，8 个修改）。
