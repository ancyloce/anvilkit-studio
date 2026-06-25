# `@anvilkit/canvas-templates`

随 AnvilKit Canvas Studio 一同提供的十个起始 [`CanvasIR`](../../canvas/core/src/types.ts) 设计——海报、社交媒体格式、幻灯片以及印刷物料。每一个都是自包含的 `CanvasIR`（仅含 text / rect / ellipse / line 节点，无外部资源），因此加载时无需任何网络请求。

## 契约

`src/index.ts` 导出一个带类型的 `canvasTemplates` 注册表（slug → `{ slug, name, description, ir }`）以及 `canvasTemplateList`。每个 `ir` 都会针对 `@anvilkit/canvas-core` 提供的 `CanvasIRSchema` 进行校验——由 `src/__tests__/canvas-templates.test.ts` 强制保证。

```ts
import { canvasTemplates, canvasTemplateList } from "@anvilkit/canvas-templates";

const poster = canvasTemplates.poster.ir; // CanvasIR
```

## 布局

```
packages/templates/canvas/
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── index.ts                 # typed registry (default export per slug)
    ├── *.json                   # one committed CanvasIR per template
    └── __tests__/
        └── canvas-templates.test.ts
```

这些 `*.json` 文件由 [`../scripts/scaffold-canvas-irs.mjs`](../scripts/scaffold-canvas-irs.mjs) 生成并提交，以便 diff 可供审阅。重新运行 `pnpm --filter @anvilkit/templates-workspace scaffold:canvas-irs` 可从声明式表格重新生成它们。

## 构建

`tsc` 会将导入的 `*.json` 复制到 `dist/`（通过 `resolveJsonModule`），与此文件夹旁的 Puck `@anvilkit/template-*` 包保持一致。该目录被 `scripts/verify-templates.mjs`（用于校验 Puck `AnvilkitTemplate` 包）跳过，并由其自身的 Vitest 套件进行校验。
