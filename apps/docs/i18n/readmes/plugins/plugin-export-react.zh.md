# @anvilkit/plugin-export-react

> **Alpha（`0.1.6`）。** 该接口已实现并经过测试；在 `1.0.0` 之前，发出的 JSX 契约仍可能演进。

Anvilkit Studio 的 React（`.tsx` / `.jsx`）导出插件。将规范化的 `PageIR` 转换为可直接拖入使用的 React 源码：从 `@anvilkit/<slug>` 包导入组件、带有序列化属性的 JSX，以及——可选地——为任何被引用的本地资源生成 `import` 语句，以便 Vite / Next 能够对其进行哈希与指纹处理。当你同时还需要独立的 HTML 输出时，请搭配 [`@anvilkit/plugin-export-html`](../plugin-export-html/README.md) 使用。

## 安装

```bash
pnpm add @anvilkit/plugin-export-react @anvilkit/core react @puckeditor/core
```

非可选对等依赖：`react >=19.0.0`、`@puckeditor/core ^0.21.3`、`@anvilkit/core ^0.1.4`。不需要 `react-dom`——该插件发出的是源码，而非渲染后的 DOM。

## 快速开始

```ts
import { Studio } from "@anvilkit/core";
import { createHtmlExportPlugin } from "@anvilkit/plugin-export-html";
import { createReactExportPlugin } from "@anvilkit/plugin-export-react";
import { puckDataToIR } from "@anvilkit/ir";
import { puckConfig } from "./puck-config";

const htmlExport = createHtmlExportPlugin({ inlineStyles: true });
const reactExport = createReactExportPlugin({
  syntax: "tsx",
  assetStrategy: "static-import",
  buildIR: (ctx) => puckDataToIR(ctx.getData(), puckConfig),
});

<Studio puckConfig={puckConfig} plugins={[htmlExport, reactExport]} />;
```

当提供了 `buildIR` 时，点击 “Export React” 会端到端运行，并通过 `anvilkit:export:ready` 广播 `page.tsx` 的内容；宿主监听该事件并触发下载。如果没有提供 `buildIR`，该操作会改为广播 `anvilkit:export:request`。

## 核心特性

- **TSX 或 JSX 输出**——`syntax: "tsx"` 保留返回类型注解；`"jsx"` 会将其去除。
- **ESM 或 CJS 模块系统**——`moduleResolution: "esm"`（默认）发出 `import`/`export default`；`"cjs"` 发出 `require`/`module.exports`。
- **两种资源策略**——`url-prop` 将资源 URL 保留为字符串；`static-import` 将本地相对路径重写为文件顶部的 ES 导入，以便打包器对其进行哈希与指纹处理。
- **确定性导入**——`collectImports` 遍历 IR，将 `PascalCase` 组件类型映射到 `@anvilkit/<slug>` 包，并对清单进行排序以获得字节稳定的输出。
- **AST 快照测试**——输出通过 `@typescript-eslint/typescript-estree` 解析，因此测试套件能够捕获形状变化，同时忽略空白字符的扰动。
- **严格的属性序列化**——只有可 JSON 序列化的值才能通过；函数、`Date`、`Map`、`Set`、`RegExp`、`Promise`、`symbol`、`bigint` 以及 `undefined` 会被拒绝并伴随 `NON_SERIALIZABLE_PROP` 警告。
- **8 码警告通道**——针对发出时可能出错的八种情况提供带类型、可由宿主设为致命的警告。

## API 参考

### 插件工厂函数

```ts
function createReactExportPlugin(opts?: ReactExportOptions): StudioPlugin;
```

返回一个 `StudioPlugin`，它注册一种导出格式（`id: "react"`）和一个顶栏操作（`id: "export-react"`）。插件元信息：

| Field         | Value                          |
| ------------- | ------------------------------ |
| `id`          | `anvilkit-plugin-export-react` |
| `name`        | `React Export`                 |
| `coreVersion` | `^0.1.3`                       |

### `ReactExportOptions`

| Field              | Type                            | Default      | Purpose                                                                 |
| ------------------ | ------------------------------- | ------------ | ----------------------------------------------------------------------- |
| `syntax`           | `"tsx" \| "jsx"`                | `"tsx"`      | `"tsx"` 在页面组件上保留 TypeScript 返回类型注解。                       |
| `moduleResolution` | `"esm" \| "cjs"`                | `"esm"`      | 发出文件所针对的模块系统。                                               |
| `includeImports`   | `boolean`                       | `true`       | 如果下游打包器会注入自己的导入，则设为 `false`。                         |
| `assetStrategy`    | `"static-import" \| "url-prop"` | `"url-prop"` | 资源属性的渲染策略。                                                     |
| `buildIR`          | `IRBuilder`                     | none         | 提供后，顶栏操作将端到端运行。                                           |

`REACT_EXPORT_DEFAULTS` 为测试和快照暴露默认对象。`resolveReactExportOptions(partial)` 在应用默认值时进行输入校验（遇到无效枚举值会抛出 `TypeError`）。

### 直接访问格式

```ts
const reactFormat: ExportFormatDefinition<ReactExportOptions> = {
  id: "react",
  label: "React (.tsx)",
  extension: "tsx",
  mimeType: "text/plain",
  run: async (ir, options, runCtx) => ({ content, filename, warnings }),
};
```

`filename` 根据 `syntax` 为 `page.tsx` 或 `page.jsx`。

### 顶栏操作

| Export                                           | Purpose                                                                      |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| `createExportReactHeaderAction(format, options)` | 构建一个绑定到已配置格式的顶栏操作。                                          |
| `exportReactHeaderAction`                        | 默认的未绑定操作；发出 `anvilkit:export:request` 供宿主处理。                 |

顶栏操作元数据：`id: "export-react"`、`label: "Export React"`、`icon: "code"`、`order: 110`。

### 底层发射器

```ts
function emitReact(ir: PageIR, options?: ReactExportOptions): EmitReactResult;

interface EmitReactResult {
  readonly code: string;
  readonly imports: ImportManifest;
  readonly warnings: readonly ExportWarning[];
}
```

在发出之前校验 IR 版本（`"1"`）与根节点类型（`"__root__"`）。标签名与属性名由正则保护——无效的标识符会回退为带警告的注释占位符，而不是发出损坏的 JSX。

### 导入收集

```ts
function collectImports(ir: PageIR): ImportManifest;
function componentTypeToPackageSlug(type: string): string;

interface ImportRecord {
  readonly binding: string;
  readonly source: string;
  readonly kind: "named" | "default";
}

interface ImportManifest {
  readonly imports: readonly ImportRecord[];
}
```

`componentTypeToPackageSlug("Hero")` → `"@anvilkit/hero"`。该清单按 `(kind, source, binding)` 排序，以获得字节稳定的输出。

### 资源规划

```ts
function collectReactAssets(
  ir: PageIR,
  strategy: "static-import" | "url-prop",
  resolvers?: readonly IRAssetResolver[],
): AssetPlan;

interface AssetPlan {
  readonly imports: readonly ImportRecord[];
  readonly rewrites: readonly AssetRewrite[];
}

interface AssetRewrite {
  readonly url: string;
  readonly binding: string;
  readonly importPath?: string;
}
```

可检测到的资源属性键：`src`、`imageUrl`、`imageSrc`、`url`、`videoUrl`、`videoSrc`、`fontUrl`、`scriptUrl`、`styleUrl`、`backgroundSrc`、`backgroundImage`、`poster`、`thumbnailSrc`。

### 属性序列化

```ts
function serializeProp(
  value: unknown,
  context: SerializeContext,
): SerializedProp;

interface SerializedProp {
  readonly value: string;
  readonly warnings: readonly ExportWarning[];
}
```

接受基本类型、普通对象和数组。拒绝函数、`Date`、`Map`、`Set`、`RegExp`、`Promise`、`symbol`、`bigint` 以及 `undefined`。

### 警告码

| Code                         | Trigger                                                                                                        | Remediation                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `NON_SERIALIZABLE_PROP`      | 属性本身是或包含函数、`Date`、`Map`、`Set`、`RegExp`、`Promise`、`symbol`、`bigint` 或 `undefined`。            | 在源头转换为与 JSON 兼容的值。                                                             |
| `INVALID_PROP_NAME`          | 属性键不是有效的 JSX 属性名。                                                                                  | 在 IR 中净化该键。发射器会丢弃该违规属性。                                                 |
| `INVALID_NODE_TYPE`          | 组件类型不是有效的 JSX 标签（小写、含空格等）。                                                                | 使用 `PascalCase` 标识符。发射器会插入一个注释占位符。                                     |
| `CJS_REQUIRES_JSX`           | `syntax: "tsx"` + `moduleResolution: "cjs"`——Node 无法 `require` 一个 `.tsx`。                                  | 先通过 TypeScript 工具链编译，或切换到 ESM。                                               |
| `EXTERNAL_URL_STATIC_IMPORT` | 在 `static-import` 下，资源属性上出现外部 URL（`https://` / `//` / `data:` / `file:`）。                        | 将资源移入项目目录树，或接受逐属性的 `url-prop` 回退。                                     |
| `UNSAFE_ASSET_PATH`          | 在 `static-import` 下，资源 URL 含有 `..` 遍历或未知协议。                                                      | 净化资源 URL。逐属性回退为 `url-prop`。                                                    |
| `ASSET_UNRESOLVED`           | `asset://` 引用未被任何已注册的解析器解析。                                                                    | 注册该解析器，或移除未解析的资源。                                                         |
| `INVALID_OPTION_COMBINATION` | `static-import` + `includeImports: false`。                                                                    | 设置 `includeImports: true` 或使用 `url-prop`。发射器将以 `url-prop` 语义运行。            |

## 用法示例

### 用于 Next.js / Vite 的 TSX + static-import

```ts
createReactExportPlugin({
  syntax: "tsx",
  moduleResolution: "esm",
  assetStrategy: "static-import",
  buildIR: (ctx) => puckDataToIR(ctx.getData(), puckConfig),
});

// Emits:
//   import Hero from "@anvilkit/hero";
//   import asset_42 from "./hero.jpg";
//   export default function Page() {
//     return <Hero src={asset_42} ... />;
//   }
```

### 用于静态 React 应用的纯 JSX + url-prop

```ts
createReactExportPlugin({
  syntax: "jsx",
  moduleResolution: "esm",
  assetStrategy: "url-prop",
  buildIR: (ctx) => puckDataToIR(ctx.getData(), puckConfig),
});

// Emits:
//   import Hero from "@anvilkit/hero";
//   export default function Page() {
//     return <Hero src="./hero.jpg" ... />;
//   }
```

### 用于工具流水线的 CJS 输出

```ts
// `syntax: "tsx"` + `moduleResolution: "cjs"` emits a CJS_REQUIRES_JSX warning.
// Use jsx + cjs together if your downstream toolchain cannot read TSX.
createReactExportPlugin({
  syntax: "jsx",
  moduleResolution: "cjs",
  buildIR,
});

// Emits:
//   const Hero = require("@anvilkit/hero").default;
//   module.exports = function Page() {
//     return <Hero ... />;
//   };
```

### 通过事件总线进行宿主驱动的导出

```ts
const reactExport = createReactExportPlugin({
  /* no buildIR */
});

studio.eventBus.on("anvilkit:export:request", async ({ formatId, options }) => {
  if (formatId !== "react") return;
  const ir = puckDataToIR(latestPuckData, puckConfig);
  const result = await reactFormat.run(ir, options, { assetResolvers });
  saveAs(new Blob([result.content], { type: "text/plain" }), result.filename);
});
```

### 用于测试 / CLI 的无界面发射

```ts
import { emitReact } from "@anvilkit/plugin-export-react";

const { code, imports, warnings } = emitReact(ir, {
  syntax: "tsx",
  assetStrategy: "url-prop",
});

if (warnings.length > 0)
  throw new Error(`emit warnings: ${JSON.stringify(warnings)}`);
console.log(code);
```

## 注意事项与 FAQ

### `static-import` 对比 `url-prop`

- **`url-prop`**（默认）——资源完全按其在 IR 中出现的样子，保留为字符串 URL。最适合快速的一次性快照，以及无需打包器重写的远程 CDN URL。
- **`static-import`**——每个 URL 为相对路径的资源都会变成一个 ES 模块 `import` 绑定，并且 JSX 属性会被重写为引用该绑定。Vite 和 Next 会把这些导入视为打包输入，因此资源会被哈希、预加载，并被指纹化以实现缓存失效。在 `static-import` 下，外部 `https://…` URL 会发出 `EXTERNAL_URL_STATIC_IMPORT`，并对该单个属性回退为 `url-prop` 行为。

### 属性序列化是严格的

只有与 JSON 兼容的值才能进入发出的 JSX。如果你的组件接收一个 `new Date(...)`、一个 `RegExp` 或一个类实例，请在 IR 边界处将其转换为普通对象 / 字符串——发射器拒绝对其进行编码。这是有意为之：发出的源码必须能往返穿过一个无法复活类实例的构建流水线。

### 组件命名契约

该插件假定遵循 Anvilkit 组件命名约定：IR 中的 `PascalCase` 组件类型 → `kebab-case` 的 `@anvilkit/<slug>` 包。`Hero` → `@anvilkit/hero`；`PricingMinimal` → `@anvilkit/pricing-minimal`。位于 Anvilkit 命名约定之外的自定义组件仍会被发出，但其导入路径可能不对应真实的 npm 包。可通过对发出的代码进行后处理，或在 IR 中预先重写组件类型来覆盖。

### 更新 AST 快照

发射器的输出通过 `@typescript-eslint/typescript-estree` 解析，并与位于 `src/__tests__/__snapshots__/ast-contract.test.ts.snap` 的 AST 快照进行比较。空白字符的扰动对套件不可见，但形状扰动（缺失一个 `ImportDeclaration`、新增一个 `JSXAttribute`）会显著失败。在一次有意的发射器变更之后：

```bash
pnpm --filter @anvilkit/plugin-export-react test -- -u
```

在 PR 中审查快照差异——它应当看起来像 JSX（`ImportDeclaration`、`ExportDefaultDeclaration`、`JSXElement` 子节点）。

### Alpha JSX 契约

发出的 JSX 形状（属性顺序、格式化器的怪癖、注释位置）尚不是稳定性契约。需要跨版本对导出源码做差异比较的使用者，应当对两侧都重新格式化，或通过 AST 比较语义形状。

### 打包预算与 `version.ts`

主包受 **8 KB gzip** 预算约束（`.size-limit.json`，在 CI 中强制执行）。为了保持在预算之内，该插件的版本字符串存放在手动维护的 `src/version.ts` 常量中，而不是导入 `package.json`（那样会把整个 JSON 对象内联进来）。如果 `version.ts` 与 `package.json` 不同步，`plugin.metadata-drift.test.ts` 守卫会失败，所以发布时请同时更新两者。

### 为什么用 `text/plain` MIME 类型？

浏览器在下载时无法有意义地渲染 `.tsx` 源码——发出的文件用于将代码交接给构建流水线的开发者，而非直接渲染。`text/plain` 确保在每个浏览器中都能触发下载，而不会被 “以 HTML 预览” 拦截。

### 另请参阅

- [`@anvilkit/plugin-export-html`](../plugin-export-html/README.md)——针对同一 `PageIR` 的独立 HTML 输出。
- Anvilkit 文档站点上的 `export-pipeline` 架构文档——共享的导出插件契约。
