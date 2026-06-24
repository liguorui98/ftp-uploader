# 传输操作优化与取消功能修复

**日期**：2026-06-24

## 概述

本次开发优化了传输模块的操作按钮，并修复了取消传输无法真正中断传输的问题。涉及 5 个文件。

---

## Bug 1：打开文件改为打开文件夹

### 问题描述

传输列表的操作按钮"打开文件"使用 `shell.openPath()` 打开文件本身，用户希望改为打开文件所在文件夹并自动选中该文件。

### 根因分析

`shell.openPath(filePath)` 会用系统默认应用打开文件，而非在文件管理器中定位文件。Electron 提供了 `shell.showItemInFolder(filePath)` 专门用于在文件管理器中打开并选中文件，但项目中从未使用过。

### 修复方案

1. 主进程新增 `shell:show-item-in-folder` IPC handler，调用 `shell.showItemInFolder()`
2. preload 接口和 contextBridge 添加 `showItemInFolder` 方法
3. `ipc.ts` 类型定义添加签名
4. `TransferList.tsx` 中 `handleOpenFile` 改为 `handleOpenFolder`，调用 `showItemInFolder`

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/main/ipc/index.ts` | 新增 `shell:show-item-in-folder` handler |
| `src/main/preload/index.ts` | 接口 + contextBridge 添加 `showItemInFolder` |
| `src/renderer/types/ipc.ts` | ElectronAPI 添加 `showItemInFolder` |
| `src/renderer/pages/TransferList.tsx` | handleOpenFile → handleOpenFolder |

---

## Bug 2：新增取消按钮

### 问题描述

传输列表缺少取消按钮，用户无法取消正在进行的上传任务。

### 根因分析

后端取消机制已完全就绪（`transfer:cancel` IPC → `transferManager.cancel()`），但 UI 层从未添加触发按钮。

### 修复方案

在操作列添加取消按钮，状态为 `pending`/`connecting`/`transferring` 时显示，使用 `Popconfirm` 确认后调用 `cancelTransfer`：

```tsx
{(record.status === 'pending' || record.status === 'connecting' || record.status === 'transferring') && (
  <Popconfirm title="确定取消此上传任务？" onConfirm={() => handleCancel(record.id)}>
    <Tooltip title="取消">
      <Button type="text" danger icon={<StopOutlined />} />
    </Tooltip>
  </Popconfirm>
)}
```

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/renderer/pages/TransferList.tsx` | 新增 handleCancel + 取消按钮 |

---

## Bug 3：取消传输不中断实际传输

### 问题描述

点击取消按钮后，UI 状态变为"已取消"，但底层 FTP/SFTP 传输仍在继续，文件仍在上传。

### 根因分析

`cancel()` 方法只做了元数据操作（设置状态、从队列移除），从未断开 FTP/SFTP 客户端连接。`executeTask()` 中的 `client` 是局部变量，`cancel()` 无法访问。

关键问题链：
```
cancel() → activeTask.status = 'cancelled' → 但无人读取此标志
cancel() → activeTasks.delete(taskId) → 但 executeTask 继续运行
cancel() → 从未调用 client.disconnect() → 传输继续
```

### 修复方案

1. 新增 `activeClients: Map<string, TransferClient>` — 按 taskId 存储客户端引用
2. 新增 `cancelledTasks: Set<string>` — 标记取消的任务，防止重试
3. `executeTask()` 中注册/注销客户端到 `activeClients`
4. `cancel()` 中调用 `client.disconnect()` 断开连接，中断传输
5. `processQueue` catch 中检查 `cancelledTasks`，取消的任务跳过重试

```typescript
// cancel() 核心改动
const client = this.activeClients.get(taskId)
if (client) {
  client.disconnect().catch(() => {})
  this.activeClients.delete(taskId)
}
```

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/main/services/transfer-manager.ts` | activeClients Map + cancelledTasks Set + cancel/executeTask/processQueue 修改 |

---

## Bug 4：传输历史分页选择器失效

### 问题描述

传输历史表格右下角的"每页条数"选择器点击无反应，无法切换显示条数。

### 根因分析

`pagination` 配置中硬编码了 `pageSize: 20`。Ant Design Table 的 `pageSize` 是受控属性，硬编码后选择器切换的值永远被覆盖为 20，导致选择器形同虚设。

### 修复方案

将 `pageSize` 改为 `defaultPageSize`，切换为非受控模式：

```tsx
// 修复前
pagination={{ pageSize: 20, showSizeChanger: true }}

// 修复后
pagination={{ defaultPageSize: 20, showSizeChanger: true }}
```

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/renderer/pages/TransferList.tsx` | pageSize → defaultPageSize |

---

# 改动文件汇总

| 文件 | Bug1 | Bug2 | Bug3 | Bug4 |
|------|:----:|:----:|:----:|:----:|
| `src/main/ipc/index.ts` | ✓ | | | |
| `src/main/preload/index.ts` | ✓ | | | |
| `src/renderer/types/ipc.ts` | ✓ | | | |
| `src/renderer/pages/TransferList.tsx` | ✓ | ✓ | | ✓ |
| `src/main/services/transfer-manager.ts` | | | ✓ | |

共 5 个文件。

---

# 验证

1. 传输列表点击"打开文件夹" → 文件管理器打开并选中对应文件
2. 传输任务状态为等待/连接/传输中时显示"取消"按钮
3. 点击"取消" → 传输立即中断（网速归零），状态变为"已取消"
4. 取消后队列中下一个任务正常开始
5. 表格右下角分页选择器可正常切换每页条数
