# 传输历史操作按钮位置优化

**日期**：2026-06-25

## 概述

将传输模块的"刷新"和"清空"按钮从页面顶部"手动传输"标题处移到"传输历史"卡片标题右侧，使操作按钮更贴近其作用的表格区域。涉及 1 个文件。

---

## 优化：刷新/清空按钮位置调整

### 问题描述

"刷新"和"清空"按钮位于页面顶部"手动传输"标题右侧，与"传输历史"表格距离较远，用户需要滚动到页面底部才能操作，交互不够直观。

### 修复方案

1. 移除"手动传输"标题旁的按钮区域，简化为纯标题
2. 将"刷新"和"清空"按钮移到"传输历史"Card 的 `title` 属性中，使用 flex 布局让标题和按钮分别左右对齐
3. 按钮改为 `size="small"` 以保持与卡片标题的视觉协调

```tsx
// 修复前：按钮在页面顶部
<div style={{ display: 'flex', justifyContent: 'space-between' }}>
  <Title level={4}>手动传输</Title>
  <Space>
    <Button icon={<ReloadOutlined />}>刷新</Button>
    <Popconfirm><Button danger>清空</Button></Popconfirm>
  </Space>
</div>

// 修复后：按钮在传输历史标题右侧
<Card title={
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <span>传输历史</span>
    <Space>
      <Button size="small" icon={<ReloadOutlined />}>刷新</Button>
      <Popconfirm><Button size="small" danger>清空</Button></Popconfirm>
    </Space>
  </div>
}>
```

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/renderer/pages/TransferList.tsx` | 移除顶部按钮，移入传输历史 Card title |

---

## 验证

1. 页面顶部"手动传输"标题旁无按钮，仅显示标题
2. "传输历史"卡片标题右侧显示"刷新"和"清空"按钮
3. 点击"刷新"正常刷新传输列表
4. 点击"清空"弹出确认框，确认后清空历史记录
