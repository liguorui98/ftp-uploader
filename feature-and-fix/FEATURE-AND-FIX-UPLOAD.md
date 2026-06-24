# 上传队列与表单问题修复

**日期**：2026-06-23

## 概述

本次开发修复了上传队列不处理、表单字段不持久化、队列状态不更新等问题。涉及 12 个文件，+147/-122 行。

---

## Bug 1：上传任务一直"等待中"（第一轮 — onStarted 跳过更新）

### 问题描述

上传文件后，任务在传输列表中一直显示"等待中"，无法开始上传。

### 根因分析

`TransferList.tsx` 的 `onStarted` handler 中，如果任务已存在于列表中则跳过更新：

```typescript
if (prev.find((t) => t.id === data.id)) return prev  // 跳过更新
```

当 `loadTransfers()` 先于 `transfer:started` 事件完成时，任务已存在于列表中（状态为 'pending'）。`onStarted` 发现任务已存在就跳过，导致 UI 永远显示"等待中"。

### 修复方案

改为始终用新数据更新已有任务：

```typescript
const idx = prev.findIndex((t) => t.id === data.id)
if (idx >= 0) {
  const next = [...prev]
  next[idx] = data
  return next
}
return [data, ...prev]
```

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/renderer/pages/TransferList.tsx` | onStarted 更新已有任务 |

---

## Bug 2：上传任务一直"等待中"（第二轮 — processQueue 未持久化状态）

### 问题描述

第一轮修复后问题仍然存在。添加日志后发现 `processQueue` 确实在运行，但磁盘上的任务状态仍为 'pending'。

### 根因分析

`enqueue()` 调用 `configStore.addTransfer(task)` 保存任务到磁盘（status: 'pending'）。然后 `processQueue` 将内存中的 `task.status` 改为 'connecting'，但 `configStore.updateTransfer` 传递整个 task 对象。当 `loadTransfers()` 从磁盘读取时，读到的是旧数据。

### 修复方案

在 `processQueue` 中，只传递变更的字段：

```typescript
this.configStore.updateTransfer(task.id, {
  status: 'connecting',
  startTime: task.startTime,
})
```

重试和失败时也精确更新字段。

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/main/services/transfer-manager.ts` | 精确更新变更字段 + 添加日志 |

---

## Bug 3：上传任务一直"等待中"（第三轮 — maxConcurrency 为 null）

### 问题描述

添加日志后发现关键信息：`[processQueue] 并发已满: 0/null，跳过处理`。`maxConcurrency` 为 null。

### 根因分析

三层问题叠加：

1. **electron-store 浅合并**：`conf` 库做浅 `Object.assign`，磁盘上已有的 `settings` 对象完全替换默认值。如果 `settings` 缺少 `maxConcurrency` 字段，则为 undefined
2. **AppSettings InputNumber 无 required 规则**：清空输入框返回 null，保存时 null 写入磁盘
3. **JavaScript null 比较**：`0 >= null` 为 `true`（null 隐式转换为 0），导致并发 guard 永远阻塞

### 修复方案

三层防御：

1. **构造函数 fallback**：`this.maxConcurrency = settings.maxConcurrency || 3`
2. **getSettings 合并默认值**：`return { ...defaultConfig.settings, ...stored }`
3. **InputNumber required 规则**：防止保存 null

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/main/services/transfer-manager.ts` | 构造函数 fallback |
| `src/main/services/config-store.ts` | getSettings 合并默认值 |
| `src/renderer/pages/AppSettings.tsx` | InputNumber 添加 required 规则 |

---

## Bug 4：FTP 运算符优先级 bug

### 问题描述

`ftp-client.ts` 中 `!this.client.closed === false` 运算符优先级错误。

### 根因分析

`!` 绑定优先于 `===`，所以 `!this.client.closed === false` 等价于 `(!this.client.closed) === false`，即 `this.client.closed === true`。如果 `closed` 是 getter 属性返回 boolean，这恰好等价于 `this.client.closed`。但如果 `closed` 是方法（函数引用），`!this.client.closed` 永远为 `false`，条件永远为 `true`，导致即使连接正常也抛出 "FTP客户端未连接" 错误。

### 修复方案

改为 `if (this.client.closed)`，4 处全部替换。

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/main/services/ftp-client.ts` | 4 处运算符修复 |

---

## Bug 5：定时任务间隔模式输入框编辑后空白 + Tab 不切换

### 问题描述

编辑定时任务时，间隔模式的输入框显示空白，调度模式选项卡点击后不切换。

### 根因分析

**输入框空白**：`Form.Item` 包裹 `Space.Compact` 而非 `InputNumber`。`Space.Compact` 不转发 `value`/`onChange` 给子组件。

**Tab 不切换**：两个问题叠加：
1. `Form.Item` 的 `name="mode"` 向 Tabs 注入冲突的 `value`/`onChange` props
2. `form.getFieldValue('mode')` 是非响应式的，不触发 React 重渲染
3. `Form.useWatch('mode', form)` 依赖字段通过 `Form.Item` 注册，移除 `name` 后失效

### 修复方案

1. `intervalMinutes` 的 `Form.Item` 移入 `Space.Compact` 内部直接包裹 `InputNumber`
2. 移除 `Form.Item` 的 `name="mode"`
3. 使用 `useState` 管理 `activeMode`，完全绕过 form store

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/renderer/pages/ScheduleConfig.tsx` | Form.Item 移入 Space.Compact + useState 管理 Tab |

---

## Bug 6：文件监控防抖输入框编辑后空白

### 问题描述

编辑文件监控任务时，防抖时间输入框显示空白。

### 根因分析

与 Bug 5 相同 — `Form.Item` 包裹 `Space.Compact`，不转发 `value`/`onChange`。

### 修复方案

`Form.Item` 移入 `Space.Compact` 内部直接包裹 `InputNumber`。

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/renderer/pages/FileWatcher.tsx` | Form.Item 移入 Space.Compact |

---

## Bug 7：启动时恢复的未完成任务未处理

### 问题描述

应用重启后，之前未完成的传输任务显示在列表中但永远不会开始上传。

### 根因分析

应用重启时：
- `this.queue`（内存）为空
- `this.activeTasks`（内存）为空
- 但 `configStore.getTransfers()` 返回之前持久化的 `status: 'pending'` 任务
- 这些任务出现在 UI 中，但从未被重新加入内存队列

### 修复方案

1. 构造函数中调用 `recoverPendingTasks()` 从 configStore 恢复 pending/connecting 任务
2. `setMainWindow()` 中调用 `processQueue()` 处理恢复的任务
3. 构造函数中重置 `isPaused = false` + `activeTasks.clear()`

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/main/services/transfer-manager.ts` | recoverPendingTasks + setMainWindow 触发 processQueue |

---

## Bug 8：EventEmitter 内存泄漏警告

### 问题描述

控制台警告：`MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 transfer:started listeners added to [IpcRenderer]`。

### 根因分析

`preload/index.ts` 的 `on*` 方法每次调用都创建新的包装函数并注册到 `ipcRenderer.on`。当组件卸载后重新挂载（页面导航），新监听器被注册但旧的未被移除。`listenerWrappers` Map 使用回调引用作为 key，但新旧回调是不同的函数引用。

### 修复方案

`on*` 方法改为返回 cleanup 函数，组件在 useEffect cleanup 中调用：

```typescript
// preload
onTransferStarted: (callback) => {
  const wrapper = (_, data) => callback(data)
  ipcRenderer.on('transfer:started', wrapper)
  return () => ipcRenderer.removeListener('transfer:started', wrapper)
}

// 组件
const cleanup = window.electronAPI.onTransferStarted?.(handler)
return () => cleanup?.()
```

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/main/preload/index.ts` | on* 方法返回 cleanup 函数 |
| `src/renderer/pages/Dashboard.tsx` | 使用 cleanup 模式 |
| `src/renderer/pages/TransferList.tsx` | 使用 cleanup 模式 |
| `src/renderer/types/ipc.ts` | 更新接口返回类型 |

---

## Bug 9：传输队列状态不更新

### 问题描述

状态栏传输队列状态始终显示初始值（空闲/0），不随实际传输任务变化。

### 根因分析

preload 的 `contextBridge.exposeInMainWorld` 中缺少 `getQueueStatus` 方法。渲染进程每 2 秒轮询 `window.electronAPI.getQueueStatus?.()`，由于方法不存在，可选链返回 `undefined`，`if (status)` 跳过更新。

### 修复方案

在 preload 中添加 `getQueueStatus`、`pauseAll`、`resumeAll` 三个方法到接口定义和 contextBridge。

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/main/preload/index.ts` | 添加 3 个 IPC bridge 方法 |

---

## Bug 10：队列状态/事件计数器冲突

### 问题描述

传输模块 badge 数字和状态栏队列状态不准确。

### 根因分析

`AppLayout.tsx` 中事件计数器和轮询计数器冲突：
- 事件 `onStarted` 每次触发 `active + 1`（可能重复计数）
- 每 2 秒轮询 `getQueueStatus()` 用后端数据完全覆盖 state

### 修复方案

移除事件计数器，仅依赖 2 秒轮询（足够实时）。

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/renderer/components/Layout/AppLayout.tsx` | 移除事件监听，仅轮询 |

---

# 改动文件汇总

| 文件 | Bug1 | Bug2 | Bug3 | Bug4 | Bug5 | Bug6 | Bug7 | Bug8 | Bug9 | Bug10 |
|------|:----:|:----:|:----:|:----:|:----:|:----:|:----:|:----:|:----:|:-----:|
| TransferList.tsx | ✓ | | | | | | | ✓ | | |
| transfer-manager.ts | | ✓ | ✓ | | | | ✓ | | | |
| config-store.ts | | | ✓ | | | | | | | |
| AppSettings.tsx | | | ✓ | | | | | | | |
| ftp-client.ts | | | | ✓ | | | | | | |
| ScheduleConfig.tsx | | | | | ✓ | | | | | |
| FileWatcher.tsx | | | | | | ✓ | | | | |
| Dashboard.tsx | | | | | | | | ✓ | | |
| preload/index.ts | | | | | | | | ✓ | ✓ | |
| AppLayout.tsx | | | | | | | | | | ✓ |
| ipc.ts | | | | | | | | ✓ | | |

共 12 个文件，+147/-122 行。

---

# 验证

1. 上传文件 → 日志显示 processQueue 正常出队 → 任务从"等待中"变为"传输中"
2. 重启应用 → 之前未完成的任务自动恢复上传
3. 编辑定时任务 → 间隔模式输入框有值 → 调度模式 Tab 可切换 → 保存后重新编辑状态正确
4. 编辑文件监控 → 防抖输入框有值
5. 状态栏队列状态随实际传输任务实时变化
6. 控制台无 EventEmitter 内存泄漏警告
