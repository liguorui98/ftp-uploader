# 服务器文件浏览器模块

**日期**：2026-06-25

## 概述

新增"文件管理"页面，支持可视化浏览远程 FTP/SFTP 服务器文件，提供目录导航、文件下载、删除、新建文件夹、重命名等功能。涉及 9 个文件（1 个新建，8 个修改）。

---

## 新增功能 1：FTP/SFTP 客户端扩展 delete/rename

### 问题描述

`TransferClient` 接口缺少文件删除和重命名方法，无法支持服务器端文件管理操作。

### 修复方案

在 `TransferClient` 接口和两个实现类中新增 `delete` 和 `rename` 方法：

```typescript
// TransferClient 接口新增
delete(remotePath: string): Promise<void>
rename(oldPath: string, newPath: string): Promise<void>
```

- FTPClient：使用 `basic-ftp` 内置的 `client.remove()` 和 `client.rename()`
- SFTPClient：使用 `ssh2-sftp-client` 内置的 `client.delete()` / `client.rmdir()` 和 `client.rename()`

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/main/services/ftp-client.ts` | TransferClient 接口 + FTPClient + SFTPClient 新增 delete/rename |

---

## 新增功能 2：文件浏览器 IPC 通道

### 问题描述

渲染进程无法访问远程服务器的文件操作，需要新增 IPC 通道将客户端能力暴露给前端。

### 修复方案

新增 `registerBrowserIPC()` 函数，注册 5 个 IPC handler，每个 handler 创建临时客户端连接执行操作后断开：

| IPC Channel | 说明 |
|-------------|------|
| `browser:list` | 列出目录内容 |
| `browser:mkdir` | 新建文件夹 |
| `browser:delete` | 删除文件/文件夹 |
| `browser:rename` | 重命名 |
| `browser:download` | 下载文件（含保存对话框） |

辅助函数 `getClient(configStore, serverId)` 封装：获取配置 → 创建客户端 → 连接 → 返回。

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/main/ipc/index.ts` | 新增 `registerBrowserIPC()` |
| `src/main/index.ts` | `registerIPC()` 中调用 `registerBrowserIPC` |

---

## 新增功能 3：Preload API 与类型定义

### 问题描述

IPC handler 已注册，但渲染进程通过 preload 脚本访问，需要暴露对应的 API 方法。

### 修复方案

在 preload 的 `ElectronAPI` 接口和 `contextBridge` 中新增 5 个方法映射到对应 IPC 调用。同步更新 `src/renderer/types/ipc.ts` 和 `src/renderer/types/index.ts`。

新增 `RemoteFileInfo` 类型：

```typescript
interface RemoteFileInfo {
  name: string
  type: 'file' | 'directory' | 'symbolicLink'
  size: number
  modifyTime: string
  permissions: string
}
```

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/main/preload/index.ts` | ElectronAPI 接口 + contextBridge 新增 5 个方法 |
| `src/renderer/types/ipc.ts` | ElectronAPI 接口新增 5 个方法签名 |
| `src/renderer/types/index.ts` | 新增 `RemoteFileInfo` 类型 |

---

## 新增功能 4：文件浏览器页面

### 功能说明

新建 `ServerBrowser.tsx` 页面组件，提供完整的服务器文件管理界面：

- **服务器选择**：Select 组件选择已配置的 FTP/SFTP 服务器，切换时自动加载根目录
- **目录导航**：点击文件夹进入子目录，双击也可进入，`..` 行返回上级
- **面包屑路径**：显示当前路径层级，可点击跳转到任意层级
- **文件列表**：Ant Design Table，列：名称（带文件类型图标）、大小、修改时间、权限、操作
- **新建文件夹**：Modal 输入名称创建
- **下载文件**：弹出系统保存对话框选择保存路径
- **删除**：Popconfirm 确认后删除
- **重命名**：Modal 输入新名称

```tsx
// 页面布局
┌─────────────────────────────────────────────────┐
│ 服务器: [Select]              [新建文件夹] [刷新]  │
├─────────────────────────────────────────────────┤
│ 路径: 根目录 > uploads > subfolder  (面包屑)     │
├─────────────────────────────────────────────────┤
│ 📁 .. (上级目录)                                  │
│ 📁 folder-a                    2024-01-15 10:30  │
│ 📄 file.txt          1.2 MB   2024-01-15 09:00  │
│ ...                                              │
└─────────────────────────────────────────────────┘
```

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/renderer/pages/ServerBrowser.tsx` | **新建** — 文件浏览器页面组件 |

---

## 新增功能 5：路由与菜单注册

### 修复方案

在路由配置中添加 `/browser` 路由，在侧边栏菜单中添加"文件管理"入口（使用 `FolderViewOutlined` 图标）。

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/renderer/App.tsx` | import ServerBrowser + 新增 `/browser` 路由 |
| `src/renderer/components/Layout/AppLayout.tsx` | 新增"文件管理"菜单项 |

---

# 改动文件汇总

| 文件 | 功能1 | 功能2 | 功能3 | 功能4 | 功能5 |
|------|:-----:|:-----:|:-----:|:-----:|:-----:|
| `src/main/services/ftp-client.ts` | ✓ | | | | |
| `src/main/ipc/index.ts` | | ✓ | | | |
| `src/main/index.ts` | | ✓ | | | |
| `src/main/preload/index.ts` | | | ✓ | | |
| `src/renderer/types/ipc.ts` | | | ✓ | | |
| `src/renderer/types/index.ts` | | | ✓ | | |
| `src/renderer/pages/ServerBrowser.tsx` | | | | ✓ | |
| `src/renderer/App.tsx` | | | | | ✓ |
| `src/renderer/components/Layout/AppLayout.tsx` | | | | | ✓ |

共 9 个文件（1 个新建，8 个修改）。

---

# 验证

1. 侧边栏显示"文件管理"菜单项，点击进入文件浏览器页面
2. 选择服务器后自动列出远程根目录文件和文件夹
3. 点击文件夹进入子目录，面包屑正确显示路径层级
4. 点击面包屑可跳转到对应层级目录
5. 新建文件夹成功后列表自动刷新
6. 点击下载按钮弹出系统保存对话框，下载完成后文件正确保存
7. 删除文件/文件夹弹出确认框，确认后列表刷新
8. 重命名功能正常工作
9. FTP 和 SFTP 服务器均正常支持所有操作
