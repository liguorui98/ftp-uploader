# Release v1.0.2-beta

**发布日期**：2026-06-22

---

## Bug 修复

### 1. 上传完成后列表自动刷新

概览模块和传输模块在文件上传完成或失败后，自动从后端 store 重新获取数据，确保列表始终显示最新记录。

### 2. 传输页面标题修正

页面标题从"传输历史"改为"手动传输"，传输列表表格上方新增"传输历史"小标题。

### 3. 编辑定时任务保存修复

修复编辑定时任务不做修改直接点击保存无反应的问题。根因是 `sourcePaths` 数组未正确转换为 TextArea 期望的字符串格式。

### 4. 编辑文件监控路径显示修复

修复编辑文件监控任务时"监控文件夹路径"和"远程目标路径"显示空白的问题。根因是 `Space.Compact` 作为 `Form.Item` 的直接子元素不转发 `value`/`onChange` 给内部 `Input`。

### 5. 设置页面保存功能修复

修复设置页面所有输入框、开关修改后保存无效的问题。涉及两层修复：
- 移除嵌套 `<Form>` 组件，确保字段注册到正确的 form 实例
- 在 preload 中补充缺失的 `getSettings`、`updateSettings`、`exportConfig`、`importConfig` IPC bridge 方法

### 6. 状态栏连接状态动态显示

服务器连接状态从硬编码"已连接"改为根据实际配置动态显示：有服务器时显示"已连接"，无服务器时显示"未配置"。

### 7. 状态栏队列状态实时更新

传输队列状态从仅轮询改为同时监听传输事件（`transfer:started`/`transfer:complete`/`transfer:error`），实现秒级实时更新。

### 8. 状态栏服务器数量显示

状态栏新增已配置服务器数量显示（如"服务器 3"），每 10 秒自动刷新。

### 9. 状态栏监听器生命周期修复

修复子组件（Dashboard、TransferList）卸载时 `removeAllListeners` 摧毁 AppLayout 监听器的问题。改用命名函数 + `removeListener` 精确移除，不影响其他组件。

### 10. Antd InputNumber addonAfter 废弃警告

将 `FileWatcher.tsx` 和 `ScheduleConfig.tsx` 中的 `addonAfter` prop 替换为 `Space.Compact` + `<span>` 组合。

### 11. Antd 静态 message API 警告

将 5 个页面组件从静态 `import { message }` 迁移到 `App.useApp()` 实例调用，支持动态主题。`main.tsx` 包裹 antd `<App>` 组件提供上下文。

---

## 改动文件清单

| 文件 | 改动说明 |
|------|---------|
| `src/main/preload/index.ts` | 新增 settings IPC bridge（4 个方法）+ `removeListener` 方法 |
| `src/renderer/main.tsx` | 包裹 antd `<App>` 组件 |
| `src/renderer/pages/Dashboard.tsx` | 命名 handler + removeListener + complete/error 后 fetchData |
| `src/renderer/pages/TransferList.tsx` | 命名 handler + removeListener + 标题修改 + complete/error 后 loadTransfers + App.useApp() |
| `src/renderer/pages/AppSettings.tsx` | 移除内层 Form + App.useApp() |
| `src/renderer/pages/ScheduleConfig.tsx` | sourcePaths 修复 + addonAfter 替换 + App.useApp() |
| `src/renderer/pages/FileWatcher.tsx` | Space.Compact 包裹调整 + addonAfter 替换 + App.useApp() |
| `src/renderer/pages/ServerSettings.tsx` | App.useApp() |
| `src/renderer/components/Layout/AppLayout.tsx` | 命名 handler + removeListener + serverCount 轮询 + 传输事件监听 |
| `src/renderer/components/Layout/StatusBar.tsx` | 接收 serverCount prop，动态显示连接状态和服务器数量 |

共 10 个文件，+274/-156 行。

---

## 技术细节

### 监听器生命周期管理

```
preload: listenerWrappers Map<callback, wrapper>
  onTransferComplete(callback) → 存储 wrapper → ipcRenderer.on(channel, wrapper)
  removeListener(channel, callback) → 查找 wrapper → ipcRenderer.removeListener(channel, wrapper)

页面组件:
  useEffect(() => {
    const handler = (data) => { ... }
    api.onTransferComplete(handler)
    return () => api.removeListener('transfer:complete', handler)  // 精确移除
  }, [])
```

### 设置 IPC 完整链路

```
AppSettings.tsx → form.validateFields()
  → window.electronAPI.updateSettings(values)
    → preload: ipcRenderer.invoke('config:update-settings', values)
      → ipc/index.ts: configStore.updateSettings(values)
        → config-store.ts: electron-store.set('settings', merged)
```
