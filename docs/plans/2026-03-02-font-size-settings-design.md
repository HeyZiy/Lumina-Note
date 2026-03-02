# 编辑器字体大小设置功能设计

## 概述

在设置面板中添加字体大小调节功能，允许用户通过滑块调整编辑器字体大小，并提供实时预览。

## 设计决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 作用范围 | 编辑器 + 预览 | 符合用户心智，界面字体保持一致 |
| 调节方式 | 滑块 (Slider) | 连续调节，所见即所得 |
| 取值范围 | 10px - 32px | 宽松范围，覆盖小屏精细阅读到大屏/视力辅助 |
| 预览方式 | 设置面板内嵌预览框 | 不干扰主编辑区，实现简洁 |
| 示例文本 | 中英混排 | 贴合笔记场景 |

## UI 设计

```
┌─────────────────────────────────────┐
│ 编辑器字体大小                        │
│                                     │
│  10 ───●─────────────────────── 32  │
│              18px                   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ The quick brown fox          │   │
│  │ 敏捷的棕色狐狸 123            │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

## 技术方案

### 1. 状态管理 (`useUIStore.ts`)

新增字段：
- `editorFontSize: number` — 默认 16px
- `setEditorFontSize: (size: number) => void`

状态持久化到 localStorage（已有 persist 中间件）。

### 2. 设置面板 (`SettingsModal.tsx`)

在「编辑器设置」section 中添加：
- 滑块组件（range input 或自定义 Slider）
- 当前值显示
- 预览框（应用实际字体大小）

### 3. 编辑器应用 (`CodeMirrorEditor.tsx`)

- 将硬编码的 `fontSize: "16px"` 改为动态读取 `editorFontSize`
- 使用 Compartment 实现运行时主题更新

### 4. 国际化 (`i18n/locales/*.ts`)

新增翻译 key：
- `settingsModal.editorFontSize`
- `settingsModal.editorFontSizeDesc`
- `settingsModal.fontPreview`

## 原子化提交计划

1. **feat(store): add editorFontSize to useUIStore**
2. **feat(i18n): add font size setting translations**
3. **feat(settings): add font size slider with preview**
4. **feat(editor): apply dynamic font size from store**
5. **test: add font size setting tests**
