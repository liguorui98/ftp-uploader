# Release v1.0.3-beta

**发布日期**：2026-06-23

---

## Bug 修复

### 1. 上传任务一直"等待中"

修复上传文件后任务永远卡在"等待中"无法开始的多层问题：
- `onStarted` handler 改为更新已有任务而非跳过
- `processQueue` 精确持久化变更字段到磁盘
- `maxConcurrency` 添加 fallback 默认值（防止 null 导致并发 guard 永久阻塞）
- `getSettings()` 与默认值合并（防止 electron-store 浅合并丢失字段）
- 设置页面 InputNumber 添加 required 规则（防止保存 null）

### 2. FTP 运算符优先级修复

修复 `!this.client.closed === false` 运算符优先级错误，改为 `if (this.client.closed)`。

### 3. 定时任务表单字段修复

- 间隔模式输入框：`Form.Item` 移入 `Space.Compact` 内部直接包裹 `InputNumber`
- 调度模式 Tab：改用 `useState` 管理活跃 Tab，解决 `form.getFieldValue` 非响应式问题

### 4. 文件监控防抖输入框修复

`Form.Item` 移入 `Space.Compact` 内部直接包裹 `InputNumber`，解决编辑时输入框空白问题。

### 5. 启动时恢复未完成任务

应用重启后自动恢复之前未完成的 pending/connecting 传输任务。构造函数中重置暂停状态和活跃任务缓存。

### 6. EventEmitter 内存泄漏修复

`on*` 事件监听方法改为返回 cleanup 函数，组件卸载时精确移除自己的监听器，避免累积超过 MaxListeners 限制。

### 7. 传输队列状态实时更新

在 preload 中补充缺失的 `getQueueStatus`、`pauseAll`、`resumeAll` IPC bridge 方法，状态栏队列状态每 2 秒轮询更新。

### 8. 队列状态计数器修复

移除事件计数器与轮询计数器的冲突，仅依赖 2 秒轮询获取准确的队列状态。

---

## 改动文件清单

| 文件 | 改动说明 |
|------|---------|
| `src/main/preload/index.ts` | on* 返回 cleanup + 添加 getQueueStatus/pauseAll/resumeAll |
| `src/main/services/transfer-manager.ts` | maxConcurrency fallback + recoverPendingTasks + 精确状态持久化 + 日志 |
| `src/main/services/config-store.ts` | getSettings 合并默认值 |
| `src/main/services/ftp-client.ts` | 修复运算符优先级 bug |
| `src/renderer/pages/TransferList.tsx` | onStarted 更新已有任务 + cleanup 模式 |
| `src/renderer/pages/ScheduleConfig.tsx` | Form.Item 移入 Space.Compact + useState 管理 Tab |
| `src/renderer/pages/FileWatcher.tsx` | Form.Item 移入 Space.Compact |
| `src/renderer/pages/AppSettings.tsx` | InputNumber 添加 required 规则 |
| `src/renderer/pages/Dashboard.tsx` | cleanup 模式 |
| `src/renderer/components/Layout/AppLayout.tsx` | 移除事件计数器，仅轮询 |
| `src/renderer/types/ipc.ts` | on* 返回类型更新 |

共 12 个文件，+147/-122 行。

---

## 技术细节

### maxConcurrency null 问题链

```
electron-store 浅合并 → settings 字段丢失 → maxConcurrency = undefined
AppSettings InputNumber 无 required → 清空后保存 null
JavaScript: 0 >= null → true → processQueue guard 永久阻塞
```

### 修复防御层

```
1. config-store: getSettings() = { ...defaultConfig.settings, ...stored }
2. transfer-manager: this.maxConcurrency = settings.maxConcurrency || 3
3. AppSettings: InputNumber rules={[{ required: true }]}
```

### 监听器 cleanup 模式

```
preload: onXxx(callback) → ipcRenderer.on(channel, wrapper) → return cleanup
组件: const cleanup = api.onXxx(handler) → useEffect return () => cleanup()
```
