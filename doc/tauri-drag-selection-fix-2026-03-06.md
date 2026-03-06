# Tauri 桌面端编辑器拖拽选区跳变问题修复记录（2026-03-06）

## 背景

问题发生在真实 Tauri 桌面端的编辑器拖拽选区流程中。用户反馈的核心现象不是普通抖动，而是：

- 鼠标位于标题行右侧附近
- 向右下方做很小幅度移动
- 下方邻近空行较多
- 选区会突然跳到更多行，表现为闪烁、跳变或“选多很多行”

这类问题在新建简单文档中不稳定，但在用户真实笔记中更容易复现，说明它和真实内容结构、渲染环境以及 Tauri/WebKit 的实际行为有关。

## 约束

本次问题排查和验收遵循以下约束：

- 复现与验收必须来自真实 Tauri 桌面端
- 不能只用浏览器环境或纯 DOM 模拟宣称“已修好”
- 代码侧可以用单元测试锁定回归，但最终验收仍需真实桌面拖拽确认

## 事实与根因结论

在多轮 trace、代码回溯和真实用户反馈之后，可以确认的结论是：

1. 这不是单纯的蓝色选区渲染层闪烁问题，`EditorState.selection` 本身会在拖拽中被改写。
2. 在 Tauri WebKit 路径下，拖拽期间至少存在多条选区写入链路竞争：
   - 我们的手动坐标同步
   - CodeMirror 内建 `MouseSelection`
   - CodeMirror 基于 DOM `selectionchange` 的回写链路
3. 之前的 bridge/gap 装饰、工具栏命中、line clamp 等修复，能缓解部分表象，但不足以消除“多写者竞争”。
4. 真正需要解决的是 ownership：一旦进入 Tauri WebKit 的手动拖拽路径，必须让手动拖拽成为唯一有效写入者，至少不能继续和 CodeMirror 已启动的原生 `mouseSelection` 同时写状态。

## 本次落地修复

### 1. 拖拽期间保留自定义选区装饰

文件：`src/editor/CodeMirrorEditor.tsx`

在 Tauri WebKit 且 `drawSelection` 关闭的路径下，拖拽期间不再直接清空 selection bridge/gap 装饰，而是继续重建装饰，避免拖拽时完全退回原生高亮表现。

对应验证：

- `src/editor/CodeMirrorEditor.selectionRendering.test.tsx`

### 2. 拖拽期间隐藏浮动工具栏

文件：`src/components/toolbar/SelectionToolbar.tsx`

处理方式：

- 当容器内存在 `.cm-editor.cm-drag-selecting` 时，不显示选区工具栏
- 在 `mouseup` 后，如果选区仍有效，再重新计算并恢复显示

这样可以避免工具栏在拖拽过程中参与 hit-testing 或打断用户观察。

对应验证：

- `src/components/toolbar/SelectionToolbar.test.tsx`

### 3. 手动拖拽同步改为“接管 ownership”

文件：`src/editor/CodeMirrorEditor.tsx`

这是本次最关键的修复。

新增逻辑包括：

- `syncDragSelectionHeadFromCoords(...)`
  - 根据拖拽坐标用 `posAtCoords` 计算 head
  - 支持基于当前 hover 行做 line clamp
  - 对 from/to 完全相同的情形做 no-op，避免重复 dispatch
- `cancelNativeMouseSelectionForManualDrag(...)`
  - 在进入手动拖拽阈值后，主动取消 CodeMirror 已启动的原生 `mouseSelection`
- 在 Tauri WebKit 手动拖拽路径下：
  - 进入拖拽阈值时清空原生 DOM ranges
  - 阻止后续拖拽默认选择行为
  - 使用我们的坐标同步作为主写入路径

这一步的目标不是“让更多链路同时工作得更和谐”，而是尽量减少竞争，让拖拽状态尽快进入单写者模式。

对应验证：

- `src/editor/CodeMirrorEditor.dragSelectionSync.test.tsx`
- `src/editor/CodeMirrorEditor.dragSelectionState.test.tsx`

## 可观测性处理

本轮排查过程中曾经用过较重的调试/trace 手段帮助定位问题，包括：

- 拖拽帧采样
- `selectionchange` 期间日志
- 可视异常检查
- trace 导出到应用日志目录
- 手动快捷键导出

最终处理原则如下：

- **不保留自动导出到应用日志目录的行为**
- **不保留手动快捷键导出 trace 的行为**
- 保留少量对开发态有帮助、且不会在正式构建中产生额外文件副作用的调试能力

也就是说，本次提交没有把“自动落盘 JSON trace”这类临时脚手架带进正式交付版本。

## 提交说明

本次代码修复提交：

- `faf5092` `fix(editor): stabilize tauri drag selection`

该提交包含：

- 编辑器拖拽 ownership 修复
- Tauri WebKit 路径下选区装饰保留
- 选区工具栏拖拽隐藏与 `mouseup` 恢复
- 对应回归测试

## 验证记录

已执行的验证包括：

### 单元测试

```bash
npm run test:run -- src/editor/CodeMirrorEditor.dragSelectionState.test.tsx src/editor/CodeMirrorEditor.dragSelectionSync.test.tsx src/editor/CodeMirrorEditor.selectionRendering.test.tsx src/components/toolbar/SelectionToolbar.test.tsx
```

结果：4 个测试文件通过，10 个测试通过。

### 构建验证

```bash
npm run build
```

结果：构建成功。

构建过程中仍存在仓库原有的 Vite chunk warning 和 `baseline-browser-mapping` 提示，这些不是本次改动新增的问题。

## 真实桌面端验收建议

由于用户明确要求最终验收必须来自真实 Tauri 桌面端，建议按下面步骤确认：

1. 启动项目：`npm run tauri dev`
2. 打开用户可稳定复现的真实笔记
3. 找到类似 `### 1.2 LLM 职责` 的标题行
4. 将鼠标移动到标题文字右侧附近，而不是极端最右边
5. 向右下做小幅度拖拽，并确保下方邻近空行
6. 观察：
   - 是否仍出现“突然跨多行”的跳变
   - 是否只剩轻微渲染层变化，而非状态级跳选
   - 工具栏是否只在拖拽结束后重新出现

## 如果仍有问题，下一步怎么查

如果真实桌面端仍能稳定复现，下一步不要回到表面补丁，而应继续围绕 ownership 深挖：

1. 记录是否仍能看到 `selectionchange-while-dragging` 与状态改写紧邻发生
2. 确认 CodeMirror DOMObserver 回写链路是否仍在抢写
3. 评估是否需要在 Tauri WebKit 路径下进一步屏蔽/替换 CodeMirror 的默认 pointer selection 启动方式，而不是仅在阈值后取消它

## 结论

当前版本已经把排查结果收敛到了最关键的根因层：

- 问题核心是拖拽选区 ownership 竞争
- 本次修复已经让手动拖拽路径在进入阈值后主动接管控制权
- 同时保留了必要的可视修复（selection bridge/gap）和交互修复（SelectionToolbar 拖拽隐藏）
- 临时的重型 trace 导出脚手架没有进入正式提交

最终是否“彻底解决”，仍应以真实 Tauri 桌面端、真实用户笔记里的拖拽结果为准。
