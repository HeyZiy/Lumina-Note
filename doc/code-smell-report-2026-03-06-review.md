# Lumina-Note 代码异味报告复审（反向检查）

- 复审对象: `doc/code-smell-report-2026-03-06.md`
- 复审时间: 2026-03-06
- 复审方式: 以“反向检查”为主，重点验证是否存在误报、漏报、定性偏差

## 一、复审结论（先给结论）

1. **原报告中的“异味指标数据基本可复现”**（`any`、`@ts-ignore`、Hook 禁用、TODO 计数、超大文件行数均匹配）。
2. **原报告不属于严格漏洞报告**：当前内容主要是可维护性/性能风险，不是利用路径、攻击面、CVSS 级别的安全漏洞分析。
3. **存在安全维度漏报**：复审补充执行 `npm audit --omit=dev` 发现 **5 个 moderate 级依赖漏洞**，原报告未覆盖。
4. **部分高风险表述偏“推断型”**：有合理性，但缺少对应故障复现、性能基准或安全 PoC 证据链。

## 二、反向核验明细

### 1) 指标可复现性（通过）

复算命令与结果：

- `rg '\\bany\\b|window as any' src | wc -l` -> `127`
- `rg '@ts-ignore|@ts-expect-error' src | wc -l` -> `1`
- `rg 'eslint-disable-next-line react-hooks/exhaustive-deps' src | wc -l` -> `8`
- `rg 'TODO|FIXME|HACK' src src-tauri server | wc -l` -> `26`
- Top5 大文件行数与原报告一致：
  - `src/editor/CodeMirrorEditor.tsx` -> `3271`
  - `src/stores/useFileStore.ts` -> `2358`
  - `src/components/layout/MainAIChatShell.tsx` -> `2342`
  - `src/stores/useRustAgentStore.ts` -> `2125`
  - `src/components/typesetting/TypesettingDocumentPane.tsx` -> `2110`

### 2) 证据引用准确性（通过）

抽样核对原报告引用位置，均可定位到对应模式：

- `src/editor/CodeMirrorEditor.tsx:3081/3090/3100` 为 `any` 事件参数。
- `src/App.tsx:547/632` 与 `src/components/layout/Sidebar.tsx:1242/1452` 等位置存在 `window.__lumina_drag_data` 全局可变态。
- `src/App.tsx:34` 静态导入 `@/lib/tauri`，`src/App.tsx:350` 动态导入同模块并存。

### 3) 构建与 clippy 结论（基本成立）

- `npm run -s build` 返回 `exit 0`，出现大量“动态导入与静态导入并存”及大 chunk 警告（含 `index-C3ABWy_X.js` `5119.42 kB`、`subset-shared.chunk-BC-Ni_Kw.js` `1823.57 kB`）。
- `cargo clippy --all-targets --all-features` 返回 `exit 0`，出现大量警告；输出中可见 `lib 38 warnings`、`bin 42 warnings`，与原报告口径一致。

## 三、重点反向发现（误差与遗漏）

### A. 定性偏差：标题与内容“漏洞”语义不一致

原文主题是“代码异味”，并未构建攻击路径（入口、利用条件、影响面、缓解方案优先级），因此不能等同“漏洞检查报告”。建议将“漏洞”与“可维护性异味”分开管理，避免误导修复优先级。

### B. 漏报：依赖安全漏洞未覆盖

复审补充执行 `npm audit --json --omit=dev`：

- 总计 `5` 个 `moderate` 漏洞（0 high/critical）
- 关键链路涉及：`dompurify`（XSS 相关公告）、`mermaid`（标签净化相关）、`nanoid`（可预测性问题）以及 `@excalidraw/*` 依赖链

这属于真正安全漏洞维度，应独立列入安全整改清单。

### C. 证据粒度不足：部分“高风险”判断缺乏验证工件

例如“并发交互更易出现偶发态问题”“首屏成本高”等判断方向正确，但需要补齐：

- 故障复现脚本或录屏（竞态/偶发态）
- 性能基准（首屏、交互时延、包体变化前后）
- 安全场景 PoC（若声称安全风险）

## 四、复审建议（按执行顺序）

1. **拆分报告类型**：
   - A 类: 代码异味/架构债务报告（当前文档保留）
   - B 类: 安全漏洞报告（依赖漏洞 + 攻击面评估）
2. **新增安全扫描最小基线**：
   - Node: `npm audit --omit=dev`（可配 CI 阈值）
   - Rust: 引入 `cargo-audit`（当前环境未安装）
   - 可选: secret scan（gitleaks/trufflehog）
3. **对“高优先级”条目加验收证据**：每项至少附一条可重复验证证据（测试、基准、PoC 之一）。

## 五、复审结果评级

- 数据准确性: **A-**（统计与引用总体可靠）
- 安全覆盖度: **C**（存在明确漏报）
- 可执行性: **B**（建议方向合理，但证据工件需加强）

