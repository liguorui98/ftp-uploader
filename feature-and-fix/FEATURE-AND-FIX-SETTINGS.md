# 设置模块与状态栏问题修复

**日期**：2026-06-22

## 概述

本次开发修复了 11 个问题，涉及 10 个文件，+274/-156 行。分为两轮：第一轮修复 8 个 UI/功能问题，第二轮修复 3 个深层问题（IPC 桥接、监听器生命周期、Antd 警告）。

---

# 第一部分：8 项 Bug 修复（第一轮）

## Bug 1：概览和传输模块上传完成后自动刷新列表

### 问题描述

上传文件完成后，概览模块（Dashboard）和传输模块（TransferList）的列表不会自动刷新，需要手动点击刷新才能看到最新记录。

### 根因分析

`Dashboard.tsx` 和 `TransferList.tsx` 的 `onTransferComplete`/`onTransferError` handler 只做本地 state 更新（移除活跃传输、更新统计数字），但从未调用 `fetchData()`/`loadTransfers()` 从后端 store 重新获取持久化的数据。

### 修复方案

- `Dashboard.tsx` 的 `onTransferComplete` 和 `onTransferError` handler 末尾添加 `fetchData()` 调用
- `TransferList.tsx` 的 `onTransferComplete` 和 `onTransferError` handler 末尾添加 `loadTransfers()` 调用

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/renderer/pages/Dashboard.tsx` | complete/error handler 添加 `fetchData()` |
| `src/renderer/pages/TransferList.tsx` | complete/error handler 添加 `loadTransfers()` |

---

## Bug 2：标题改为"手动传输"，表格上方添加"传输历史"标题

### 问题描述

传输模块页面标题应为"手动传输"，传输列表表格上方应有"传输历史"小标题。

### 修复方案

- 页面 `<Title>` 从 "传输历史" 改为 "手动传输"
- 表格 `<Card>` 添加 `title="传输历史"` 属性

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/renderer/pages/TransferList.tsx` | 标题文字修改 + Card 添加 title |

---

## Bug 3：编辑定时任务未修改点保存无反应

### 问题描述

编辑定时任务时，不做任何修改直接点击保存，弹窗无反应，不会关闭也不会提示成功。

### 根因分析

`ScheduleConfig.tsx` 的 `handleEdit` 将 `schedule.sourcePaths`（`string[]` 数组）直接 set 到表单。TextArea 字段的底层值仍是数组。`handleSubmit` 中 `values.sourcePaths.split('\n')` 对数组调用 `.split()` 抛出 TypeError，被 catch 静默吞掉。

如果用户手动编辑了 TextArea，React 会将数组替换为字符串，`.split()` 就能正常工作。这就是"修改后能保存，不修改不能保存"的原因。

### 修复方案

1. `handleEdit` 中将 `sourcePaths` 数组转为换行分隔的字符串：`sourcePaths: schedule.sourcePaths.join('\n')`
2. catch block 添加 `message.error()` 提示用户保存失败

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/renderer/pages/ScheduleConfig.tsx` | sourcePaths 数组转字符串 + catch 添加错误提示 |

---

## Bug 4：编辑文件监控路径显示空白

### 问题描述

编辑已有的文件监控任务时，"监控文件夹路径"和"远程目标路径"两个字段显示为空白。

### 根因分析

`FileWatcher.tsx` 中 `watchPath` 和 `remotePath` 的 `<Form.Item>` 直接子元素是 `<Space.Compact>`。Ant Design 的 `Form.Item` 会向直接子元素注入 `value`/`onChange` props，但 `<Space.Compact>` 是布局组件，不转发这些 props 给内部的 `<Input>`。因此 Input 永远收不到表单 store 中的值。

### 修复方案

将 `<Space.Compact>` 移到 `<Form.Item>` 外面，用 `<Form.Item noStyle>` 包裹 Input：

```tsx
<Form.Item label="监控文件夹路径" required>
  <Space.Compact style={{ width: '100%' }}>
    <Form.Item name="watchPath" noStyle rules={[...]}>
      <Input placeholder="选择要监控的文件夹" />
    </Form.Item>
    <Button onClick={() => handleSelectFolder('watchPath')}>选择</Button>
  </Space.Compact>
</Form.Item>
```

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/renderer/pages/FileWatcher.tsx` | watchPath 和 remotePath 字段的 Space.Compact 包裹结构调整 |

---

## Bug 5：设置页面所有输入框保存无效（初次修复）

### 问题描述

设置页面所有输入框、开关等控件修改后点击保存，重启应用后设置恢复原样。

### 根因分析（初次发现）

`AppSettings.tsx` 外层 `<Form form={form}>` 内嵌 `<Tabs>`，每个 tab 的 children 用独立的 `<Form layout="vertical">` 包裹。Ant Design 中，没有 `form` prop 的 `<Form>` 会创建自己的隐式 form store。所有 `<Form.Item>` 注册到内部隐式 store 而非外层 `form`。`form.validateFields()` 返回空对象。

### 修复方案

移除三个 tab 中的内层 `<Form layout="vertical">` 包裹，改为 `<div>`。外层 `<Form form={form}>` 已提供 form context，子元素中的 `<Form.Item>` 可以直接注册。

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/renderer/pages/AppSettings.tsx` | 3 处内层 `<Form>` 改为 `<div>` |

---

## Bug 6：左下角服务器连接状态始终"已连接"

### 问题描述

左下角状态栏的服务器连接状态始终显示绿色 "已连接"，即使没有配置任何服务器。

### 根因分析

`StatusBar.tsx` 连接状态硬编码为绿色 Badge + "已连接" 文字，无真实连接检测逻辑。

### 修复方案

连接状态基于 `serverCount` prop 动态显示：
- `serverCount > 0` → 绿色 Badge + "已连接"
- `serverCount === 0` → 灰色 Badge + "未配置"

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/renderer/components/Layout/StatusBar.tsx` | 接收 serverCount prop，动态显示连接状态 |

---

## Bug 7：左下角传输队列状态始终"空闲"

### 问题描述

传输文件时，左下角状态栏队列状态仍然显示"空闲"。

### 根因分析

`AppLayout.tsx` 通过 `getQueueStatus()` 每 2 秒轮询获取队列状态，但轮询结果可能不及时或 handler 返回值不正确。

### 修复方案

`AppLayout.tsx` 添加 `transfer:started`/`transfer:complete`/`transfer:error` 事件监听，在事件回调中主动更新 `queueStatus`，确保状态实时反映。保留 2 秒轮询作为兜底。

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/renderer/components/Layout/AppLayout.tsx` | 添加传输事件监听，实时更新队列状态 |

---

## Bug 8：左下角已配置服务器数量未显示

### 问题描述

左下角状态栏只显示"服务器"文字，没有显示已配置的服务器数量。

### 根因分析

`StatusBar.tsx` 服务器信息硬编码为图标 + "服务器" 文字，无数量显示。

### 修复方案

- `AppLayout.tsx` 获取服务器列表，将 `serverCount` 传递给 StatusBar
- StatusBar 显示 "服务器 N"（N 为实际数量）

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/renderer/components/Layout/AppLayout.tsx` | 获取服务器列表，传递 serverCount |
| `src/renderer/components/Layout/StatusBar.tsx` | 接收并显示 serverCount |

---

# 第二部分：3 项 Bug 修复（第二轮）

## Bug 9：设置页面保存无效（深层根因）

### 问题描述

第一轮修复了嵌套 Form 问题后，设置页面仍然无法保存。输入框和开关修改后保存无变化。

### 根因分析

第一轮修复（移除内层 Form）解决了表单字段注册问题，但设置页面仍然无法工作，因为 **preload 脚本从未暴露 settings 相关的 IPC bridge 方法**。

`src/main/preload/index.ts` 的 `contextBridge.exposeInMainWorld('electronAPI', {...})` 中缺少以下 4 个方法：
- `getSettings`
- `updateSettings`
- `exportConfig`
- `importConfig`

后端 IPC handler 已就绪（`ipc/index.ts` 中注册了 `config:get-settings`、`config:update-settings`、`config:export`、`config:import`），但 preload 从未将它们暴露给渲染进程。

`AppSettings.tsx` 中所有调用都通过 `?.` 可选链（如 `window.electronAPI.getSettings?.()`），当方法不存在时静默返回 `undefined`，不报错。因此：
- `loadSettings` 获取到 `undefined`，表单不会被后端数据填充
- `handleSave` 的 `updateSettings` 调用静默跳过，数据从未发送到主进程
- 用户看到"设置已保存"的成功提示，但实际上什么都没发生

### 修复方案

在 `preload/index.ts` 中：
1. `ElectronAPI` 接口添加 4 个方法声明
2. `contextBridge` 对象添加 4 个 `ipcRenderer.invoke` 调用

```typescript
// 接口声明
getSettings: () => Promise<Record<string, unknown>>
updateSettings: (settings: Record<string, unknown>) => Promise<void>
exportConfig: () => Promise<string>
importConfig: (jsonStr: string) => Promise<boolean>

// contextBridge 实现
getSettings: () => ipcRenderer.invoke('config:get-settings'),
updateSettings: (settings) => ipcRenderer.invoke('config:update-settings', settings),
exportConfig: () => ipcRenderer.invoke('config:export'),
importConfig: (jsonStr) => ipcRenderer.invoke('config:import', jsonStr),
```

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/main/preload/index.ts` | ElectronAPI 接口 + contextBridge 添加 4 个 settings 方法 |

---

## Bug 10：状态栏不实时更新

### 问题描述

第一轮修复后，状态栏在初始状态下能正确显示，但用户导航离开再回来后，状态栏不再更新。

### 根因分析

这是一个 **监听器生命周期冲突** 问题。架构为：`AppLayout`（父布局）> `<Outlet />` > 子页面（Dashboard、TransferList 等）。

三个组件都监听相同的 IPC channel（`transfer:started`、`transfer:complete`、`transfer:error`）。问题出在子组件的 cleanup 函数：

```typescript
// Dashboard.tsx 和 TransferList.tsx 的 cleanup
window.electronAPI.removeAllListeners?.('transfer:started')
window.electronAPI.removeAllListeners?.('transfer:complete')
window.electronAPI.removeAllListeners?.('transfer:error')
```

`removeAllListeners` 使用 `ipcRenderer.removeAllListeners(channel)`，这会移除该 channel 上**所有**监听器——不仅仅是当前组件注册的，还包括 AppLayout 注册的。

事件链：
1. 用户在 Dashboard 页面，Dashboard 和 AppLayout 都注册了监听器
2. 用户导航到其他页面，Dashboard 卸载，cleanup 执行
3. `removeAllListeners` 移除了 `transfer:started` 等 channel 上的所有监听器
4. AppLayout 的监听器被摧毁，状态栏不再收到事件

### 修复方案

采用 **命名函数 + `removeListener`** 替代 `removeAllListeners`：

1. 在 preload 中新增 `removeListener` 方法，通过 `Map<Function, Function>` 追踪回调到包装函数的映射
2. 每个页面组件将事件 handler 提取为命名函数
3. cleanup 时用 `removeListener(channel, namedHandler)` 精确移除当前组件的监听器，不影响其他组件

```typescript
// preload 新增
const listenerWrappers = new Map<Function, Function>()

removeListener: (channel, callback) => {
  const wrapper = listenerWrappers.get(callback)
  if (wrapper) {
    ipcRenderer.removeListener(channel, wrapper)
    listenerWrappers.delete(callback)
  }
}

// 页面组件
const onComplete = (data) => { ... }
window.electronAPI.onTransferComplete?.(onComplete)
// cleanup
window.electronAPI.removeListener?.('transfer:complete', onComplete)
```

同时，`serverCount` 从只获取一次改为每 10 秒轮询，以反映服务器增删变化。

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/main/preload/index.ts` | 新增 `removeListener` 方法 + `listenerWrappers` Map |
| `src/renderer/pages/Dashboard.tsx` | 命名 handler + removeListener |
| `src/renderer/pages/TransferList.tsx` | 命名 handler + removeListener |
| `src/renderer/components/Layout/AppLayout.tsx` | 命名 handler + removeListener + serverCount 10s 轮询 |

---

## Bug 11：Antd 警告

### 问题描述

控制台出现两个 antd 相关警告：
1. `[antd: InputNumber] addonAfter is deprecated. Please use Space.Compact instead.`
2. `[antd: message] Static function can not consume context like dynamic theme. Please use App component instead.`

### 警告 11a：`addonAfter` 已废弃

**根因：** `FileWatcher.tsx` 和 `ScheduleConfig.tsx` 中的 `InputNumber` 使用了 `addonAfter` prop，该 prop 在新版 antd 中已废弃。

**修复：** 用 `Space.Compact` 包裹 `InputNumber` + `<span>` 替代：

```tsx
// 之前
<InputNumber addonAfter="毫秒" />

// 之后
<Space.Compact style={{ width: '100%' }}>
  <InputNumber style={{ flex: 1 }} />
  <span style={{ padding: '0 11px', lineHeight: '30px', background: '#fafafa', border: '1px solid #d9d9d9', borderLeft: 0, borderRadius: '0 6px 6px 0' }}>毫秒</span>
</Space.Compact>
```

**改动文件：** `FileWatcher.tsx`、`ScheduleConfig.tsx`

### 警告 11b：静态 `message` API

**根因：** 5 个页面组件直接 `import { message } from 'antd'` 使用静态方法。在 antd v5 中，静态 `message` API 无法消费动态主题上下文（ConfigProvider 的 theme 配置）。需要改用 `App.useApp()` 获取实例。

**修复方案（两步）：**

1. `main.tsx` — 在路由树外包裹 antd `<App>` 组件（提供 useApp 上下文）
2. 5 个页面组件 — 将 `import { message }` 改为 `import { App }`，组件内添加 `const { message } = App.useApp()`

```tsx
// main.tsx
import { ConfigProvider, App as AntApp, theme } from 'antd'
<ConfigProvider ...>
  <AntApp>
    <App />
  </AntApp>
</ConfigProvider>

// 页面组件
import { App } from 'antd'
const MyComponent: React.FC = () => {
  const { message } = App.useApp()
  // ... 使用 message.success() 等
}
```

**改动文件：** `main.tsx`、`AppSettings.tsx`、`ScheduleConfig.tsx`、`FileWatcher.tsx`、`TransferList.tsx`、`ServerSettings.tsx`

### 关于 Electron mach port 警告

`Electron[22785:5145114] error messaging the mach port for IMKCFRunLoopWakeUpReliable` 是 macOS Electron 框架层面的系统警告，与应用代码无关，无法修复。

---

# 改动文件汇总

| 文件 | Bug1 | Bug2 | Bug3 | Bug4 | Bug5 | Bug6 | Bug7 | Bug8 | Bug9 | Bug10 | Bug11 |
|------|:----:|:----:|:----:|:----:|:----:|:----:|:----:|:----:|:----:|:-----:|:-----:|
| Dashboard.tsx | ✓ | | | | | | | | | ✓ | |
| TransferList.tsx | ✓ | ✓ | | | | | | | | ✓ | ✓ |
| ScheduleConfig.tsx | | | ✓ | | | | | | | | ✓ |
| FileWatcher.tsx | | | | ✓ | | | | | | | ✓ |
| AppSettings.tsx | | | | | ✓ | | | | | | ✓ |
| ServerSettings.tsx | | | | | | | | | | | ✓ |
| StatusBar.tsx | | | | | | ✓ | | ✓ | | | |
| AppLayout.tsx | | | | | | | ✓ | ✓ | | ✓ | |
| preload/index.ts | | | | | | | | | ✓ | ✓ | |
| main.tsx | | | | | | | | | | | ✓ |

共 10 个文件，+274/-156 行。

---

# 验证

1. **自动刷新**：上传文件完成后，概览和传输列表自动显示最新记录
2. **标题**：传输页面标题为"手动传输"，表格上方显示"传输历史"
3. **定时任务编辑**：不修改直接保存 → 成功关闭弹窗
4. **文件监控编辑**：编辑时路径正确显示
5. **设置保存**：修改语言/主题/并发数 → 保存 → 重启应用 → 设置仍然生效
6. **状态栏连接**：有服务器时显示"已连接"，无服务器时显示"未配置"
7. **状态栏队列**：传输文件时实时显示"传输中 N"
8. **状态栏服务器数**：添加/删除服务器后数量实时更新
9. **控制台**：无 `addonAfter` 和 `message` 相关警告
