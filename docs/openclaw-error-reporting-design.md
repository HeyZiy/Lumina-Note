# OpenClaw 插件错误上报机制设计方案

## 问题分析

### 当前问题

1. **错误被静默吞噬**：插件代码中的 `try-catch` 块仅使用 `console.error` 打印错误，用户无法感知
2. **缺乏细粒度错误分类**：所有错误都被混为一谈，无法区分严重程度
3. **开发者调试困难**：没有结构化的错误日志，难以定位问题根因
4. **用户体验差**：操作失败时没有明确的错误提示和恢复建议

### 现有代码问题示例

```javascript
// 当前代码 - 错误被静默处理
try {
  await api.workspace.listOpenClawCronJobs();
} catch (err) {
  console.error('[OpenClaw Cron] Failed to load cron jobs:', err);
  api.ui.notify(t('openClawCronLoadError', { error: errorMessage }));
  return [];
}
```

**问题**：
- `console.error` 在 production 环境可能不可见
- `api.ui.notify` 是临时通知，容易被忽略
- 没有错误级别分类
- 没有错误上下文信息
- 没有错误堆栈追踪

## 设计方案

### 设计原则

1. **用户可见**：所有影响用户操作的错误必须明确提示
2. **分级处理**：根据错误严重程度采用不同的上报策略
3. **上下文完整**：记录错误发生时的完整上下文
4. **开发者友好**：提供结构化的错误日志便于调试
5. **性能无感**：错误上报不应影响正常操作流程

### 错误分级

| 级别 | 名称 | 描述 | 用户提示 | 日志记录 | 示例 |
|------|------|------|----------|----------|------|
| `critical` | 致命错误 | 系统无法继续运行 | 强提示（弹窗） | 完整堆栈 + 上下文 | 文件系统损坏、核心 API 失效 |
| `error` | 严重错误 | 操作失败但可继续 | 明显提示（Toast） | 完整堆栈 + 上下文 | 网络请求失败、文件读写失败 |
| `warning` | 警告 | 非致命问题 | 轻微提示（状态栏） | 简化日志 | 配置缺失、降级处理 |
| `info` | 信息 | 正常但值得注意 | 不提示 | 简要日志 | 功能触发、状态变更 |

### 错误上报 API 设计

#### 核心接口

```typescript
interface PluginErrorReporter {
  /**
   * 报告错误 - 主要入口
   */
  report(error: PluginErrorInput): string;
  
  /**
   * 报告操作失败 - 便捷方法
   */
  reportOperation<T>(
    operation: () => Promise<T>,
    context: ErrorContext
  ): Promise<T>;
  
  /**
   * 包装异步函数自动错误上报
   */
  wrap<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    context: ErrorContext
  ): T;
}

interface PluginErrorInput {
  /** 错误唯一标识（可选，用于去重） */
  id?: string;
  
  /** 错误来源模块 */
  source: string;
  
  /** 错误类型分类 */
  category: 'filesystem' | 'network' | 'validation' | 'runtime' | 'ui' | 'unknown';
  
  /** 错误严重程度 */
  level: 'critical' | 'error' | 'warning' | 'info';
  
  /** 用户可见的错误消息 */
  userMessage: string;
  
  /** 开发者可见的详细消息 */
  detail?: string;
  
  /** 原始错误对象 */
  error: unknown;
  
  /** 错误发生时的上下文 */
  context?: Record<string, unknown>;
  
  /** 建议的恢复操作 */
  recoverySuggestion?: string;
  
  /** 是否显示堆栈追踪（默认 false） */
  showStack?: boolean;
}

interface ErrorContext {
  /** 操作名称 */
  operation: string;
  
  /** 相关参数 */
  parameters?: Record<string, unknown>;
  
  /** 当前状态 */
  currentState?: Record<string, unknown>;
  
  /** 时间戳（可选，默认当前时间） */
  timestamp?: number;
}
```

### 实现方案

#### 1. 创建错误上报工具类

在插件内部创建 `ErrorReporter` 类：

```javascript
class ErrorReporter {
  constructor(api, pluginId) {
    this.api = api;
    this.pluginId = pluginId;
    this.errorLog = [];
    this.maxLogSize = 100;
  }

  /**
   * 标准化错误对象
   */
  normalizeError(error) {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack,
        raw: error,
      };
    }
    if (typeof error === 'string') {
      return { message: error, raw: error };
    }
    try {
      return { message: JSON.stringify(error), raw: error };
    } catch {
      return { message: String(error), raw: error };
    }
  }

  /**
   * 报告错误
   */
  report(input) {
    const {
      source,
      category = 'unknown',
      level = 'error',
      userMessage,
      detail,
      error,
      context = {},
      recoverySuggestion,
      showStack = false,
    } = input;

    const normalized = this.normalizeError(error);
    const timestamp = Date.now();
    const errorId = `err-${timestamp}-${Math.random().toString(36).slice(2, 8)}`;

    // 构建结构化错误日志
    const errorEntry = {
      id: errorId,
      pluginId: this.pluginId,
      source,
      category,
      level,
      userMessage,
      detail: detail || normalized.message,
      stack: showStack ? normalized.stack : undefined,
      context: {
        ...context,
        timestamp: new Date(timestamp).toISOString(),
        userAgent: navigator.userAgent,
      },
      recoverySuggestion,
      rawError: normalized,
    };

    // 记录到日志
    this.errorLog.push(errorEntry);
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog.shift();
    }

    // 根据级别处理
    this.handleByLevel(level, errorEntry);

    // 发送到主应用错误系统（如果可用）
    this.sendToHost(errorEntry);

    return errorId;
  }

  /**
   * 根据错误级别处理
   */
  handleByLevel(level, errorEntry) {
    switch (level) {
      case 'critical':
        // 强提示弹窗
        this.showCriticalAlert(errorEntry);
        break;
      case 'error':
        // Toast 通知
        this.api.ui.notify(errorEntry.userMessage);
        console.error(`[${this.pluginId}:${errorEntry.source}]`, errorEntry);
        break;
      case 'warning':
        // 轻微提示
        console.warn(`[${this.pluginId}:${errorEntry.source}]`, errorEntry.userMessage);
        break;
      case 'info':
        // 仅日志
        console.info(`[${this.pluginId}:${errorEntry.source}]`, errorEntry.userMessage);
        break;
    }
  }

  /**
   * 显示致命错误警告
   */
  showCriticalAlert(errorEntry) {
    const message = [
      errorEntry.userMessage,
      errorEntry.recoverySuggestion ? `\n\n建议：${errorEntry.recoverySuggestion}` : '',
      errorEntry.detail ? `\n\n详情：${errorEntry.detail}` : '',
    ].join('');
    
    // 使用原生 alert 作为最后手段
    alert(`[严重错误] ${message}`);
  }

  /**
   * 发送到主应用错误系统
   */
  sendToHost(errorEntry) {
    // 如果主应用提供了错误上报 API，调用它
    if (this.api.reportError) {
      this.api.reportError(errorEntry);
    }
  }

  /**
   * 包装异步函数自动错误上报
   */
  wrap(fn, context) {
    const self = this;
    return async function(...args) {
      try {
        return await fn.apply(this, args);
      } catch (error) {
        self.report({
          ...context,
          error,
          context: { ...context.context, arguments: args },
        });
        throw error; // 重新抛出让调用者知道失败
      }
    };
  }

  /**
   * 获取错误日志
   */
  getErrorLog(limit = 50) {
    return this.errorLog.slice(-limit);
  }

  /**
   * 清除错误日志
   */
  clearErrorLog() {
    this.errorLog = [];
  }
}
```

#### 2. 在 OpenClaw 插件中集成

修改 `src-tauri/resources/plugins/openclaw-workspace/index.js`：

```javascript
module.exports = function setup(api) {
  // 创建错误上报器
  const errorReporter = new ErrorReporter(api, 'openclaw-workspace');

  // 包装现有函数
  const loadCronJobs = errorReporter.wrap(
    async () => {
      return await api.workspace.listOpenClawCronJobs();
    },
    {
      source: 'OpenClawCron',
      operation: 'loadCronJobs',
      category: 'filesystem',
      level: 'error',
      userMessage: t('openClawCronLoadError', { error: 'Failed to load cron jobs' }),
      detail: 'Failed to read OpenClaw cron jobs from ~/.openclaw/cron/jobs.json',
      recoverySuggestion: '请检查 ~/.openclaw/cron/jobs.json 文件是否存在且格式正确',
    }
  );

  // 或者手动报告
  const openCronEditor = async (jobId) => {
    try {
      let job = null;
      if (jobId) {
        const jobs = await loadCronJobs();
        job = jobs.find((j) => j.jobId === jobId) || null;
      }
      api.workspace.openRegisteredTab(CRON_EDITOR_TAB_TYPE, {
        html: renderCronForm(job),
        jobId: jobId || null,
      });
    } catch (error) {
      errorReporter.report({
        source: 'OpenClawCron',
        operation: 'openCronEditor',
        category: 'ui',
        level: 'error',
        userMessage: t('openClawCronEditorOpenError', { error: error.message }),
        detail: `Failed to open cron job editor for jobId: ${jobId}`,
        error,
        context: { jobId },
        recoverySuggestion: '请刷新页面后重试',
      });
    }
  };
};
```

#### 3. 添加错误日志查看面板

在插件 UI 中添加开发者调试面板：

```javascript
const renderErrorLog = (errors) => {
  const styles = {
    container: 'style="padding:16px;background:var(--background-secondary,#f5f5f5);border-radius:8px;max-height:400px;overflow-y:auto;"',
    item: 'style="padding:12px;margin-bottom:8px;background:var(--background,#fff);border-radius:6px;border-left:4px solid var(--error,#dc2626);"',
    header: 'style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;"',
    badge: 'style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;"',
  };

  if (!errors || errors.length === 0) {
    return `<div ${styles.container}><p style="text-align:center;color:var(--text-secondary,#999);">暂无错误日志</p></div>`;
  }

  const items = errors.map(err => {
    const levelColor = {
      critical: '#dc2626',
      error: '#ea580c',
      warning: '#ca8a04',
      info: '#2563eb',
    }[err.level] || '#6b7280';

    return `
      <div ${styles.item} style="border-left-color: ${levelColor};">
        <div ${styles.header}>
          <span style="font-weight:600;">${err.source}</span>
          <span ${styles.badge} style="background:${levelColor};color:#fff;">${err.level.toUpperCase()}</span>
        </div>
        <div style="font-size:13px;margin-bottom:8px;">${err.userMessage}</div>
        ${err.detail ? `<div style="font-size:12px;color:var(--text-secondary,#666);margin-bottom:8px;">${err.detail}</div>` : ''}
        <div style="font-size:11px;color:var(--text-tertiary,#999);">
          ${new Date(err.context.timestamp).toLocaleString()}
          ${err.context.operation ? ` | 操作：${err.context.operation}` : ''}
        </div>
      </div>
    `;
  }).join('');

  return `<div ${styles.container}>${items}</div>`;
};
```

### 使用示例

#### 示例 1：文件操作错误

```javascript
const readCronJobs = async () => {
  try {
    const cronPath = resolveOpenClawCronPath(workspacePath);
    if (!(await exists(cronPath))) {
      errorReporter.report({
        source: 'CronService',
        category: 'filesystem',
        level: 'warning',
        userMessage: 'Cron 配置文件不存在',
        detail: `文件路径：${cronPath}`,
        error: new Error('File not found'),
        context: { workspacePath, cronPath },
        recoverySuggestion: '首次使用会自动创建配置文件',
      });
      return [];
    }
    
    const raw = await readFile(cronPath);
    return JSON.parse(raw);
  } catch (error) {
    errorReporter.report({
      source: 'CronService',
      category: 'filesystem',
      level: 'error',
      userMessage: '读取 Cron 配置失败',
      detail: error.message,
      error,
      context: { workspacePath },
      recoverySuggestion: '请检查文件权限或重新创建配置文件',
    });
    throw error;
  }
};
```

#### 示例 2：网络请求错误

```javascript
const fetchGatewayData = async (endpoint) => {
  try {
    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    errorReporter.report({
      source: 'GatewayService',
      category: 'network',
      level: 'error',
      userMessage: '网关数据同步失败',
      detail: error.message,
      error,
      context: { endpoint },
      recoverySuggestion: '请检查网络连接或网关配置',
      showStack: true, // 网络错误显示堆栈便于调试
    });
    throw error;
  }
};
```

#### 示例 3：验证错误

```javascript
const validateCronExpression = (expr) => {
  const isValid = /^(\*|[0-9]+|\*\/[0-9]+|[0-9]+-[0-9]+)(,(\*|[0-9]+|\*\/[0-9]+|[0-9]+-[0-9]+))*$/.test(expr);
  
  if (!isValid) {
    errorReporter.report({
      source: 'CronValidator',
      category: 'validation',
      level: 'warning',
      userMessage: `Cron 表达式格式不正确：${expr}`,
      detail: 'Cron 表达式应为 5 或 6 个字段，用空格分隔',
      error: new Error('Invalid cron expression'),
      context: { expression: expr },
      recoverySuggestion: '请参考 cron 表达式语法：分 时 日 月 周',
    });
    return false;
  }
  
  return true;
};
```

## 实施步骤

### 第一阶段：基础错误上报（1 天）

1. ✅ 创建 `ErrorReporter` 类
2. ✅ 集成到 OpenClaw 插件
3. ✅ 替换现有 `console.error` 调用
4. ✅ 添加基本用户提示

### 第二阶段：错误日志面板（1-2 天）

1. ⏳ 在插件 UI 中添加错误日志查看器
2. ⏳ 支持按级别/时间筛选
3. ⏳ 支持导出错误日志
4. ⏳ 添加错误统计信息

### 第三阶段：高级功能（2-3 天）

1. ⏳ 错误聚合和去重
2. ⏳ 错误趋势分析
3. ⏳ 自动错误报告（用户授权后）
4. ⏳ 与主应用错误系统集成

## 验收标准

### 功能验收

- [ ] 所有错误操作都有用户提示
- [ ] 错误日志可查看、可筛选、可导出
- [ ] 致命错误有明确的恢复建议
- [ ] 开发者可以获取完整错误上下文

### 质量验收

- [ ] 错误上报不影响正常操作性能
- [ ] 错误消息清晰易懂，无技术术语堆砌
- [ ] 错误日志结构化，便于分析
- [ ] 支持 i18n 错误消息

### 用户体验验收

- [ ] 用户不会看到未处理的错误弹窗
- [ ] 错误提示不会频繁打扰用户
- [ ] 用户可以自主选择是否查看详细错误
- [ ] 开发者可以快速定位问题根因

## 技术注意事项

1. **内存管理**：错误日志需要限制大小，避免内存泄漏
2. **隐私保护**：错误上下文中不应包含敏感信息
3. **性能影响**：错误上报应异步执行，不阻塞主流程
4. **错误循环**：避免错误上报本身引发新的错误
5. **兼容性**：支持旧版本插件的降级处理

## 相关文件

- 插件运行时：`src/services/plugins/runtime.ts`
- 错误存储：`src/stores/useErrorStore.ts`
- 错误报告工具：`src/lib/reportError.ts`
- OpenClaw 插件：`src-tauri/resources/plugins/openclaw-workspace/index.js`
