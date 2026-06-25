# @anvilkit/plugin-ai-copilot

> **Alpha（`0.1.8`）。** API 在 `1.0` 之前可能发生变化。该插件位于宿主的 LLM 适配器之后——没有任何凭据或模型标识符会越过插件边界。

面向 Anvilkit Studio 的无界面 AI copilot。该插件会缓存一份从宿主 Puck config 派生的、按会话计的 `AiGenerationContext`，调用宿主提供的 `generatePage(prompt, ctx)`（以及可选的 `generateSection`），使用 `@anvilkit/validator` 校验响应，并通过 `setData` 原子地分发结果。React UI 原语在 `/react` 下发布；用于测试和演示的确定性 mock 生成器在 `/mock` 下发布。

## 安装

```bash
pnpm add @anvilkit/plugin-ai-copilot @anvilkit/core react react-dom @puckeditor/core
```

非可选 peer：`react >=19.0.0`、`react-dom >=19.0.0`、`@puckeditor/core ^0.21.3`。`@anvilkit/ui` 是可选 peer——如果你使用 React 组件，请安装它。

子路径导入：

- `@anvilkit/plugin-ai-copilot` — 插件工厂函数、`applySectionPatch`、类型。
- `@anvilkit/plugin-ai-copilot/react` — React 组件以及 `useAiCopilot` Hook。
- `@anvilkit/plugin-ai-copilot/mock` — 用于 CI / 演示的确定性 fixture 与 mock 生成器。

## 快速开始

```ts
import { Studio } from "@anvilkit/core";
import { createAiCopilotPlugin } from "@anvilkit/plugin-ai-copilot";
import { puckConfig } from "./puck-config";

const aiCopilot = createAiCopilotPlugin({
  puckConfig,
  generatePage: (prompt, ctx) =>
    fetch("/api/ai/generate", {
      method: "POST",
      body: JSON.stringify({
        prompt,
        availableComponents: ctx.availableComponents,
      }),
    }).then((response) => response.json()),
  timeoutMs: 30_000,
});

<Studio puckConfig={puckConfig} plugins={[aiCopilot]} />;
```

宿主 UI 在提交时调用 `aiCopilot.runGeneration(prompt)`（或 `regenerateSelection(prompt, selection)`）——两者都是命令式的，因为它们由提示词驱动。订阅 `ai-copilot:error` 事件总线以获取带类型的失败信息。

## 核心特性

- **命令式生成 API** — `runGeneration(prompt)` 与 `regenerateSelection(prompt, selection)`，使宿主 UI 能够驱动进度状态、在运行中禁用输入并就地呈现错误。
- **严格的校验边界** — 在分发之前，每个 LLM 响应都会经过 `validateAiOutput`（整页流程）或 `validateAiSectionPatch`（区块流程）。
- **原子分发** — 每次成功生成对应单个 `setData` 操作；并发运行由一个单调递增的 `generationId` 跟踪，过期的 resolve 会被丢弃。
- **出站控制** — `forwardCurrentData` 默认为 `false`；配合 `sanitizeCurrentData` 在 LLM 看到画布之前剥离 PII。
- **可观测** — 同步的 `onTrace` Hook 在每个决策点触发，仅携带结构化元数据（没有任何被转发的数据越过该通道）。
- **区块级补丁** — Phase 6 / M9 流程会在不重建整页的情况下重新生成一段连续的选区。
- **确定性 mock** — `createMockGeneratePage` / `createMockGenerateSection` 为测试和演示提供由 fixture 支撑的生成器。
- **React 原语** — 无界面的 `useAiCopilot` Hook，外加 `AiCopilotPanel` / `CopilotChatPanel` / `CopilotComposer` / `CopilotModelMenu` 组件。

## API 参考

### 工厂函数

```ts
function createAiCopilotPlugin(
  options: AiCopilotOptions,
): AiCopilotPluginInstance;

interface AiCopilotPluginInstance extends StudioPlugin {
  runGeneration(prompt: string): Promise<void>;
  regenerateSelection(
    prompt: string,
    selection: AiSectionSelection,
    opts?: RegenerateSelectionOptions,
  ): Promise<void>;
}
```

### `AiCopilotOptions`

| 字段                  | 类型                                   | 默认值     | 用途                                                                                                                                 |
| --------------------- | -------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `generatePage`        | `GeneratePageFn`                       | _必填_     | 整页流程回调。`(prompt, ctx) => Promise<PageIR>`。                                                                                   |
| `generateSection`     | `GenerateSectionFn`                    | 无         | 区块流程回调。`(prompt, ctx) => Promise<AiSectionPatch>`。省略时，`regenerateSelection` 会以 `GENERATE_FAILED` 失败。 |
| `puckConfig`          | `Config`                               | _必填_     | 与传给 `<Studio>` 的相同的 Puck config。AI 安全 schema 会从它派生一次。                                                   |
| `timeoutMs`           | `number`                               | `30_000`   | 应用于每个宿主回调。                                                                                                       |
| `forwardCurrentData`  | `boolean`                              | `false`    | 为 `true` 时，当前画布会被包含进上下文（受 `sanitizeCurrentData` 约束）。                                       |
| `sanitizeCurrentData` | `(data: PuckData) => PuckData`         | 恒等函数   | 在转发前应用的同步净化器。请保持其开销低。                                                             |
| `onTrace`             | `(event: AiCopilotTraceEvent) => void` | 空操作     | 可观测性 Hook。抛出的异常会被捕获并通过 `ctx.log` 上报。                                                                    |

构造函数会执行同步的结构化校验，并在形状错误时抛出带 `[CONFIG_INVALID]` 标记的 `Error`。被抛出的 `Error.message` 携带失败码，因为此时尚不存在 Studio 上下文——一旦插件构造完成，错误将改为在 `ai-copilot:error` 事件总线上呈现。

### `AiErrorCode`

| 代码                | 触发条件                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| `VALIDATION_FAILED` | 宿主响应未通过 `validateAiOutput` / `validateAiSectionPatch`。携带 `issues[]`。                       |
| `TIMEOUT`           | 宿主回调未在 `timeoutMs` 内 resolve。                                                             |
| `GENERATE_FAILED`   | 宿主回调被 reject、抛出异常或缺失（例如，未提供 `generateSection` 就调用 `regenerateSelection`）。 |
| `APPLY_FAILED`      | 校验后的应用步骤失败（非连续的 `nodeIds`、缺失 zone 等）。                                            |
| `CONFIG_INVALID`    | 构造时的选项校验拒绝了输入。                                                        |

### `AiCopilotTraceEvent`

| `type`                  | 何时触发                                    | 额外字段                                                       |
| ----------------------- | ------------------------------------------- | -------------------------------------------------------------- |
| `generation-start`      | 运行开始                                    | `promptLength`                                                 |
| `generation-validated`  | 校验器接受了响应                            | —                                                              |
| `generation-dispatched` | `setData` 已分发                            | —                                                              |
| `generation-stale-drop` | 运行在一个更新的运行抢占之后才 resolve      | `stage: "after-generate" \| "after-validate" \| "after-apply"` |
| `generation-failed`     | 运行因错误而终止                            | `code: AiErrorCode`                                            |

每个事件还携带 `flow: "page" \| "section"` 和一个单调递增的 `generationId`。

### `AiCopilotErrorPayload`

```ts
interface AiCopilotErrorPayload {
  readonly code: AiErrorCode;
  readonly message: string;
  readonly issues?: readonly {
    readonly path: string;
    readonly message: string;
    readonly severity: "error" | "warn";
  }[];
}
```

在 `ai-copilot:error` 事件总线上发出。

### 辅助函数

```ts
function applySectionPatch(
  currentData: PuckData,
  patch: AiSectionPatch,
): PuckData;
```

将 `AiSectionPatch` 转换为与 Puck 兼容的 `setData` 载荷，并校验连续性和 zone 位置。该补丁的 `zoneId`（例如 `"root"`、`"root-zone"` 或 `"<parentId>:<slotName>"`）决定替换节点落在何处——无需单独的 `selection` 参数。

### React API（`./react`）

```ts
function useAiCopilot(
  plugin: AiCopilotPluginInstance,
  options?: UseAiCopilotOptions,
): UseAiCopilotResult;
```

`UseAiCopilotResult`（选取的字段）：

| 字段              | 类型                                                          | 用途                                                              |
| ----------------- | ------------------------------------------------------------- | ------------------------------------------------------------------ |
| `prompt`          | `string`                                                      | 编辑器文本域的值。                                           |
| `onPromptChange`  | `(next: string) => void`                                      | 编辑器的 onChange。                                                 |
| `status`          | `"idle" \| "pending"`                                         | 生成生命周期。                                              |
| `error`           | `string \| null`                                              | 最近一次的错误信息。                                                |
| `issues`          | `readonly AiPromptPanelIssue[]`                               | 最近一次失败运行的校验器 issue。                         |
| `onGenerate`      | `(prompt: string) => void`                                    | 提交处理器——调用 `plugin.runGeneration`。                     |
| `onRegenerate`    | `(prompt: string, selection: AiPromptPanelSelection) => void` | 提交处理器——调用 `plugin.regenerateSelection`。               |
| `messages`        | `readonly CopilotMessage[]`                                   | 本地聊天历史。                                                |
| `toolCalls`       | `readonly CopilotToolCall[]`                                  | 以工具调用形式渲染的生成生命周期。                       |
| `selectedModelId` | `string \| undefined`                                         | 当前选中的模型（仅用于 UI——插件与模型无关）。 |
| `onModelChange`   | `(id: string) => void`                                        | 模型选择器处理器。                                            |
| `pushTrace`       | `(event: AiCopilotTraceEvent) => void`                        | 插件 trace 事件的接收端；将其接入 `onTrace`。          |

组件：

| 组件                   | 关键 props                                            |
| ---------------------- | ----------------------------------------------------- |
| `AiCopilotPanel`       | `{ plugin: AiCopilotPluginInstance }`                 |
| `CopilotComposer`      | `{ prompt, onPromptChange, onSubmit, status, error }` |
| `CopilotChatPanel`     | `{ messages, toolCalls }`                             |
| `CopilotMessageBubble` | `{ message, role }`                                   |
| `CopilotToolCallRow`   | `{ toolCall }`                                        |
| `CopilotModelMenu`     | `{ selectedId, models?, onSelect }`                   |

### Mock 生成器（`./mock`）

```ts
function createMockGeneratePage(
  options?: CreateMockGeneratePageOptions,
): GeneratePageFn;
function createMockGenerateSection(
  options?: CreateMockGenerateSectionOptions,
): GenerateSectionFn;

function matchPromptToFixture(prompt: string): Fixture | undefined;
const allFixtures: readonly Fixture[];
```

Fixture 与演示组件目录相匹配。`matchPromptToFixture` 执行部分提示词匹配——对于需要为某个已知短语得到确定性生成结果的 E2E 测试很有用。

## 用法示例

### 针对宿主后端的整页生成

```ts
createAiCopilotPlugin({
  puckConfig,
  generatePage: async (prompt, ctx) => {
    const response = await fetch("/api/ai/page", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, available: ctx.availableComponents }),
    });
    if (!response.ok) throw new Error(`AI backend ${response.status}`);
    return response.json();
  },
});
```

### 携带当前画布的区块级重新生成

```ts
createAiCopilotPlugin({
  puckConfig,
  generatePage,
  generateSection: async (prompt, ctx) => {
    return fetch("/api/ai/section", {
      method: "POST",
      body: JSON.stringify({
        prompt,
        selection: ctx.selection,
        availableComponents: ctx.availableComponents,
        currentSnapshot: ctx.currentData,
      }),
    }).then((response) => response.json());
  },
  forwardCurrentData: true,
  sanitizeCurrentData: stripInternalProps,
});

function stripInternalProps(data: PuckData): PuckData {
  return {
    ...data,
    content: data.content.map((item) => ({
      ...item,
      props: Object.fromEntries(
        Object.entries(item.props ?? {}).filter(([key]) => {
          if (key.startsWith("_")) return false;
          if (key === "email" || key === "phone") return false;
          return true;
        }),
      ),
    })),
  };
}
```

### 来自 `onTrace` 的 Sentry 面包屑

```ts
createAiCopilotPlugin({
  puckConfig,
  generatePage,
  onTrace: (event) => {
    Sentry.addBreadcrumb({
      category: "ai-copilot",
      level: event.type === "generation-failed" ? "error" : "info",
      message: event.type,
      data: event,
    });
  },
});
```

### 测试中的确定性 mock 生成器

```ts
import { createMockGeneratePage } from "@anvilkit/plugin-ai-copilot/mock";
import { createAiCopilotPlugin } from "@anvilkit/plugin-ai-copilot";

const aiCopilot = createAiCopilotPlugin({
  puckConfig,
  generatePage: createMockGeneratePage(),
});

await aiCopilot.runGeneration(
  "a marketing landing page with a hero and pricing grid",
);
```

### React UI 面板

```tsx
import { AiCopilotPanel } from "@anvilkit/plugin-ai-copilot/react";

function Sidebar({ aiCopilot }: { aiCopilot: AiCopilotPluginInstance }) {
  return <AiCopilotPanel plugin={aiCopilot} />;
}
```

## 注意事项与 FAQ

### 为什么是命令式而非声明式？

兄弟插件（`@anvilkit/plugin-export-html` 等）会注册声明式的 `exportFormats` / `headerActions` 映射，供宿主 UI 拉取。AI copilot 之所以改为返回命令式方法，是因为它由提示词驱动：宿主 UI 通常会渲染一个文本域 + 提交按钮，并且必须 `await` 该次运行，以驱动进度状态、在生成中禁用输入并就地呈现错误。声明式的 `aiActions` 映射在调用点仍会要求宿主侧执行 `await invoke()`，因此我们直接暴露这些方法。完整的长篇理由见 `docs/decisions/005-ai-copilot-imperative-api.md`。

### 安全模型

- 该插件**永远看不到凭据**。API 密钥、鉴权头和端点都属于宿主后端。
- `generatePage` 和 `generateSection` 恰好接收 `(prompt, ctx)`——没有全局状态，没有隐式数据。
- 每个 LLM 响应在任何画布变更之前都会经过校验。
- 分发是原子的：每次成功生成对应单个 `setData` 操作，因此不可能出现部分 / 交错的更新。

### `forwardCurrentData` 需要显式启用并搭配净化

当 `forwardCurrentData: true` 时，整个 Puck 画布——组件 props、资源 URL、嵌入文本——会在每次提示时进入宿主的 LLM 适配器。这能切实提升重新生成的质量，但如果任何组件 props 可能包含 PII、签名资源 URL、嵌入的密钥或内部客户标识符，请为该标志搭配 `sanitizeCurrentData`，以剥离一切不得离开应用的内容。见 `docs/decisions/004-ai-copilot-data-egress.md`。

### 过期丢弃语义

每次调用都会递增内部的 `generationId`。如果某个较早开始的较慢运行在某个较晚开始的较快运行已经分发之后才 resolve，那么较早的结果会被丢弃，并触发 `generation-stale-drop`，附带该次丢弃发生时所处的 `stage`（`after-generate` / `after-validate` / `after-apply`）。画布始终只反映最近被接受的那次生成。

### `onTrace` 载荷绝不包含被转发的数据

只有结构化元数据会流经 trace 通道：flow（`"page"` / `"section"`）、`generationId`、`promptLength`、错误码、过期丢弃 stage。可以把它接入 Sentry 面包屑、OpenTelemetry span 事件或 `console.debug`，而无需担心密钥泄露。

### 构造错误会同步抛出

错误的选项形状会以带 `[CONFIG_INVALID]` 标记的 `Error` 快速失败。`CONFIG_INVALID` 代码是 `AiErrorCode` 联合类型的一部分，但它通过构造函数抛出的 `Error.message` 呈现，而非通过事件总线——因为构造时尚不存在 Studio 上下文。

### Mock 与生产生成器对比

Mock 生成器发出的 `PageIR` 文档是按演示组件目录塑形的。如果你的宿主组件与演示集合存在差异，请编写自定义 mock 或扩展 `allFixtures`，而不要原封不动地依赖捆绑的 fixture。

### 架构背景

完整的包目录与信任边界讨论，参见 Anvilkit 文档站上的 `anvilkit-architecture` AI 上下文文档。AI 生成流程完全经过本插件边界运行——除了 `AiGenerationContext` 类型之外，`@anvilkit/core` 不暴露任何第一方 AI 原语。
