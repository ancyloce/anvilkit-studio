# @anvilkit/plugin-asset-manager

> **Alpha（`0.1.10`）。** 在 `v1.0` 之前公共接口仍可能变动。CI 中强制执行的包体积预算：headless 入口 ≤ 8 KB gzip，UI 子路径 ≤ 12 KB gzip，Unsplash 子路径 ≤ 4 KB gzip。

面向 Anvilkit Studio 的无界面资源管理器插件。宿主提供上传后端；插件负责校验、注册、搜索、IR 时解析、CSP 指引，以及（可选地）用于上传 + 浏览体验的 React UI。专为可插拔的生产后端（S3、GCS、自定义 HTTP）设计，并对每个适配器响应都强制执行严格的信任边界。

## 安装

```bash
pnpm add @anvilkit/plugin-asset-manager @anvilkit/core react react-dom @puckeditor/core
```

非可选的 peer：`react >=19.2.0`、`react-dom >=19.2.0`、`@puckeditor/core ^0.22.0`。

子路径导入：

- `@anvilkit/plugin-asset-manager` — 插件工厂函数、校验、适配器、CSP 顾问、错误。
- `@anvilkit/plugin-asset-manager/ui` — React UI 组件（浏览器 + 文件夹 + Unsplash 面板）。
- `@anvilkit/plugin-asset-manager/retry` — 通用的 `RetryableError` + `withRetry()`。
- `@anvilkit/plugin-asset-manager/adapters/s3` — 生产级 `s3PresignedAdapter`。
- `@anvilkit/plugin-asset-manager/providers/unsplash` — 延迟加载、无依赖的 Unsplash provider。
- `@anvilkit/plugin-asset-manager/testing` — 供下游插件测试使用的 fixtures。

## 快速上手

```ts
import { createAssetManagerPlugin } from "@anvilkit/plugin-asset-manager";
import { Studio } from "@anvilkit/core";

// Zero-config: an in-memory library with folders enabled. Every option is optional.
const assetManager = createAssetManagerPlugin();

<Studio puckConfig={puckConfig} plugins={[assetManager]} />;
```

要使用真实上传，请传入 `uploader`。`dataUrlUploader` 仅供开发使用——文件会被转换为内存中的 `data:` URL（默认上限 1 MB）。对于生产环境，请换用 `s3PresignedAdapter` 或自定义的 `UploadAdapter`。默认 Studio 侧边栏的 **Images** 导轨会渲染资源库、文件夹面包屑/树、来源标签页，以及（在配置后）Unsplash 选择器，无需额外接线。

## 核心功能

- **可插拔的上传适配器** — `dataUrlUploader`、`inMemoryUploader` 与 `s3PresignedAdapter` 开箱即用；自定义适配器实现 `UploadAdapter` 函数签名即可。
- **严格的信任模型** — 每个适配器响应都会经由 `validateUploadResult` 校验：scheme 白名单、路径穿越防护、IDN 同形字防护。`javascript:` / `vbscript:` 被硬性拦截。`data:` 需主动启用。
- **内存资源注册表** — 搜索（`query` / `kinds` / `tags`）、不透明游标分页、自动派生标签、重命名 / 重打标签 / 替换 / 删除。
- **零必需配置** — `createAssetManagerPlugin()`（无参数）即可生成一个可用的、带文件夹的内存资源库；只需接入你需要的 `dataSource` 操作。
- **文件夹** — 树形管理（创建 / 重命名 / 移动 / 删除，支持重新挂载父级或级联删除）；归属关系是资源库元数据，绝不进入 IR，因此移动操作绝不会改变已渲染的页面。
- **宿主支持的数据源** — 可选的异步 `AssetDataSource`（list 返回资源 + 文件夹树）；对未实现的方法按平面逐项回退到内存默认实现。
- **Unsplash** — 内置、延迟加载、代理优先的来源，支持多种主题、署名 + 强制的下载触发；绝不进入 headless chunk。
- **分类与分面筛选** — kind / tags / folder / source 轴（以 AND 方式组合），外加宿主定义的分类与分面；通过复合游标在多个来源间联合查询。
- **IR 时解析** — `createIRAssetResolver` + `resolveAssets` 在导出 / 渲染时将 `asset://<id>` 引用转换为经校验的 URL。
- **CSP 顾问** — `getRequiredCsp` 计算已配置适配器所需的最小 `connect-src` / `img-src` / `media-src` 指令。
- **生产就绪的 S3 适配器** — `s3PresignedAdapter` 先 POST 后 PUT，对 5xx + 网络故障进行指数退避重试（4xx 快速失败）。
- **可恢复 / 分片上传** — 可选的 `resumable` 选项对大型媒体分块、按片重试，并在重新加载后恢复中断的上传；`s3MultipartAdapter` 开箱即用（`./adapters/s3-multipart`）。参见 [可恢复 / 分片上传](#resumable--multipart-upload)。
- **资源变换** — 无需处理字节的变换接缝：声明式的 `AssetTransform` 搭载于 `asset://<id>?w=…&fm=…` 引用上，宿主的 `transformResolver` 将其映射为派生 URL（你的图片 CDN）；`createQueryParamTransformResolver` 开箱即用（`./transform`）。参见 [资源变换 / 变体](#asset-transformations--variants)。
- **可选的 React UI** — `UploadButton`、`AssetBrowser`、`AssetCommandPalette`、`MetadataPanel`、`ReplaceAssetDialog`、`DeleteAssetDialog`，以及复合的 `AssetManagerUI`。
- **批量上传控制** — `StudioAssetSource.upload(files)` 遵循 `maxConcurrentUploads`（默认 3）与 `AbortSignal`。

## API 参考

### 插件工厂函数

```ts
function createAssetManagerPlugin(options: AssetManagerOptions): StudioPlugin;
```

| 字段                        | 类型                                           | 默认值    | 用途                                                                          |
| --------------------------- | ---------------------------------------------- | --------- | ---------------------------------------------------------------------------- |
| `uploader`                  | `UploadAdapter`                                | in-memory | 二进制摄取后端（可选；默认为内存上传器）。                                    |
| `resumable`                 | `ResumableUploadConfig`                        | none      | 针对大文件的、可选启用的分块/可恢复上传（`{ adapter, partSize?, threshold?, sessionStore? }`）。 |
| `dataSource`                | `AssetDataSource`                              | in-memory | 宿主支持的目录（list / remove / replace / rename / move + 文件夹）。          |
| `folders`                   | `boolean \| FolderOptions`                     | `true`    | 文件夹管理；`false` 表示平面资源库，或 `{ maxDepth, allowMove }`。            |
| `providers`                 | `readonly AssetSourceProvider[]`               | `[]`      | 额外的只读来源，与本地资源库一起联合查询。                                    |
| `unsplash`                  | `UnsplashSourceOptions`                        | none      | 内置 Unsplash 来源（代理优先；不捆绑密钥）。                                  |
| `categories`                | `readonly AssetCategory[]`                     | none      | 位于 kind 筛选器旁的保存视图标签。                                            |
| `facets`                    | `readonly AssetFacetDefinition[]`              | none      | 自定义分面筛选器（本地 `valueOf` 或远程）。                                   |
| `maxFileSize`               | `number`                                       | none      | 字节数。在适配器运行前强制执行。                                              |
| `acceptedMimeTypes`         | `readonly string[]`                            | none      | 白名单。在适配器运行前强制执行。                                              |
| `acceptedFileExtensions`    | `readonly string[]`                            | none      | 扩展名白名单（`".png"` 或 `"png"`）。在适配器运行前强制执行。                 |
| `dataUrlAllowlistOptIn`     | `boolean`                                      | `false`   | 为 `true` 时，`data:` URL 是有效输出。                                        |
| `allowMixedScriptHostnames` | `boolean`                                      | `false`   | 为 `true` 时，允许将拉丁文与易混淆脚本混用的主机名。                          |
| `getThumbnail`              | `(entry: UploadResult) => string \| undefined` | none      | 对所显示缩略图的可选覆盖。                                                    |
| `transformResolver`         | `TransformResolver`                            | none      | 将 `AssetTransform` 映射为派生 URL（你的图片 CDN）。参见 [资源变换](#asset-transformations--variants)。 |
| `dedupe`                    | `boolean`                                      | `false`   | 为 `true` 时，对上传进行哈希（SHA-256），并复用内容相同的已有资源而非重新上传。 |
| `sniffContent`              | `boolean`                                      | `false`   | 为 `true` 时，拒绝其魔数字节内容与所声明 `file.type` 相矛盾的文件（在 MIME/扩展名之上的纵深防御）。 |
| `onAssetDeleted`            | `(asset: UploadResult) => void \| Promise<void>` | none    | 当资源经由默认来源被删除时触发的生命周期 hook；在此释放后端对象（`blob:` URL 会被自动撤销）。 |

### 插件上下文上的命令式 API

| 函数                   | 签名                                            | 用途                                                       |
| ---------------------- | ----------------------------------------------- | ---------------------------------------------------------- |
| `uploadAsset`          | `(ctx, file, signal?) => Promise<UploadResult>` | 校验文件 → 运行上传器 → 校验结果 → 注册。                   |
| `getAssetRegistry`     | `(ctx) => AssetRegistry \| undefined`           | 在 `onInit` 之后读取运行时注册表。                         |
| `createAssetReference` | `(id) => string`                                | 为 IR 生成稳定的 `asset://<id>` 引用。                     |

运行时事件：

| 事件常量 | 事件名称 | 负载 |
| -------------- | ---------- | ------- |
| `ASSET_MANAGER_UPLOADED_EVENT` | `asset-manager:uploaded` | `AssetManagerUploadedEvent` — 校验并插入注册表后的 `{ asset, reference }`。 |
| `ASSET_MANAGER_ERROR_EVENT` | `asset-manager:error` | `AssetManagerErrorEvent` — 针对上传校验或适配器故障的 `{ code, message }`。 |

### `UploadAdapter`

```ts
type UploadAdapter = (
  file: File,
  options?: UploadAdapterOptions, // { signal?: AbortSignal }
) => Promise<UploadResult>;

interface UploadResult {
  readonly url: string;
  readonly id: string;
  readonly name?: string;
  readonly meta?: AssetMeta; // { size?, mimeType?, width?, height? }
  readonly tags?: readonly string[];
}
```

### 参考适配器

| 适配器                     | 使用场景   | 说明                                                                                                 |
| -------------------------- | ---------- | ---------------------------------------------------------------------------------------------------- |
| `dataUrlUploader(opts?)`   | 开发、演示 | `maxBytes` 默认 1 MB——限定的是**原始**文件；产出的 base64 `data:` URL 约大 ~33%，会保存在内存中并内联嵌入到 IR/导出中。会提取图片尺寸。 |
| `inMemoryUploader()`       | 测试       | 在内存中以 `blob:` URL 存储文件。这些对象 URL **永不被撤销**（无删除 hook），因此长时间的上传/删除波动会泄漏——仅供开发/测试。 |
| `s3PresignedAdapter(opts)` | 生产       | 向 `presignEndpoint` POST `{ name, type, size }`；将文件 PUT 到返回的 `url`。对 5xx + 网络故障重试。 |

`s3PresignedAdapter` 选项：

| 字段              | 默认值                | 用途                                                           |
| ----------------- | --------------------- | -------------------------------------------------------------- |
| `presignEndpoint` | _必填_                | 返回 `{ url, publicUrl?, headers?, id? }` 的 URL。             |
| `fetch`           | `globalThis.fetch`    | 可注入的 fetch 实现（用于测试 / 插桩）。                       |
| `region`          | none                  | 仅记录到日志；不做校验。                                       |
| `retry`           | `{ maxRetries: 3 }`   | 转发给 `withRetry()`，用于两个阶段。                           |
| `signal`          | none                  | 中止进行中的 presign + PUT + 任何重试休眠。                    |
| `headers`         | none                  | presign POST 上的额外请求头（例如鉴权）。                      |
| `idGenerator`     | `crypto.randomUUID()` | 资源 id 覆盖。                                                 |

### 可恢复 / 分片上传

大型媒体可分片上传、按片重试，并在中断（刷新、网络断开）后恢复。通过 `resumable` 选项启用；达到或超过阈值的文件走可恢复路径，其余仍走单次上传。

```ts
import { createAssetManagerPlugin } from "@anvilkit/plugin-asset-manager";
import { s3PresignedAdapter } from "@anvilkit/plugin-asset-manager/adapters/s3";
import { s3MultipartAdapter } from "@anvilkit/plugin-asset-manager/adapters/s3-multipart";

createAssetManagerPlugin({
	uploader: s3PresignedAdapter({ presignEndpoint: "/api/sign" }), // small files
	resumable: {
		adapter: s3MultipartAdapter({ endpoint: "/api/s3-multipart" }),
		partSize: 8 * 1024 * 1024, // bytes/part (clamped up to S3's 5 MiB min)
		threshold: 16 * 1024 * 1024, // route files ≥ this through multipart
		// sessionStore defaults to localStorage (in-memory fallback)
	},
});
```

`ResumableUploadConfig`：

| 字段           | 默认值             | 用途                                                                                      |
| -------------- | ------------------ | ---------------------------------------------------------------------------------------- |
| `adapter`      | _必填_             | 一个 `ResumableUploadAdapter`（`begin` / `uploadPart` / `complete` / `abort`）。         |
| `partSize`     | 8 MiB              | 每片的字节数。                                                                            |
| `threshold`    | `partSize`         | 走可恢复路径的最小文件大小；更小的文件使用 `uploader`。                                   |
| `sessionStore` | localStorage 存储  | 进行中会话持久化的位置（`createUploadSessionStore`，或自定义实现）。                      |

当有持久化会话存储可用时，**恢复是自动的**。进度会经由会话存储持久化（以 name + size + last-modified 组成的稳定文件指纹作为键）；重新选择同一个被中断的文件时会与后端核对，并跳过已被接受的分片——无需显式的“恢复”操作。默认存储使用 `localStorage`；在其不可用之处（SSR、隐私模式）会回退到内存存储，此时恢复仅在同一页面会话内有效。

**`s3MultipartAdapter`（`./adapters/s3-multipart`）** 无依赖——与 `s3PresignedAdapter` 一样，它绝不捆绑 AWS SDK。它通过一个宿主 `endpoint` 来中转每个 S3 操作，所 POST 的 JSON 以 `action` 区分：

| `action`     | 宿主执行                   | 返回                             |
| ------------ | -------------------------- | -------------------------------- |
| `create`     | `CreateMultipartUpload`    | `{ uploadId, key?, partSize? }`  |
| `sign-part`  | 对一个 `UploadPart` 预签名 | `{ url, headers? }`              |
| `complete`   | `CompleteMultipartUpload`  | `{ url, publicUrl?, id? }`       |
| `abort`      | `AbortMultipartUpload`     | —                                |
| `list-parts` | `ListParts`（恢复）        | `{ parts, key? }`（404 ⇒ 已失效） |

分片 PUT 必须向浏览器暴露其 `ETag`——设置 S3 CORS `ExposeHeaders: ["ETag"]`。对于 CSP，向 `getRequiredCsp` 传入 `s3Multipart: { endpoint, bucketHost, publicHost? }`。

### `AssetRegistry`

```ts
interface AssetRegistry {
  register(asset: UploadResult): UploadResult;
  get(id: string): UploadResult | undefined;
  list(): readonly UploadResult[];
  delete(id: string): boolean;
  rename(id: string, name: string): UploadResult | undefined;
  replace(id: string, next: UploadResult): UploadResult | undefined;
  setTags(id: string, tags: readonly string[]): UploadResult | undefined;
  search(options?: AssetSearchOptions): AssetSearchPage;
  subscribe(listener: AssetRegistryListener): () => void;
}

interface AssetSearchOptions {
  readonly query?: string; // matches id, name, MIME prefix, tags (case-insensitive)
  readonly kinds?: readonly AssetKind[];
  readonly tags?: readonly string[]; // AND semantics
  readonly cursor?: string;
  readonly limit?: number;
}

interface AssetSearchPage {
  readonly items: readonly UploadResult[];
  readonly total: number;
  readonly nextCursor: string | undefined;
}
```

`AssetKind` 是 `"image" | "video" | "audio" | "font" | "document" | "other"` 之一——通过 `inferAssetKind(mimeType)` 从 MIME 推断。

### 侧边栏来源桥接

```ts
function createStudioAssetSource(
  options: CreateStudioAssetSourceOptions,
): StudioAssetSource;

interface CreateStudioAssetSourceOptions {
  readonly registry: AssetRegistry;
  readonly upload: (
    file: File,
    options?: UploadAdapterOptions,
  ) => Promise<UploadResult>;
  readonly getThumbnail?: (entry: UploadResult) => string | undefined;
  readonly maxConcurrentUploads?: number; // default 3
}
```

侧边栏消费方也可以直接调用 `inferStudioAssetKind(entry)`。

### IR 解析

| 导出项                  | 签名                                                      | 用途                                                     |
| ----------------------- | --------------------------------------------------------- | -------------------------------------------------------- |
| `createIRAssetResolver` | `(opts: CreateIRAssetResolverOptions) => IRAssetResolver` | 将 `asset://<id>` 引用对照注册表进行解析。               |
| `resolveAssets`         | `(ir: PageIR, resolver) => PageIR`                        | 遍历 IR 树并重写资源引用。                               |

```ts
interface CreateIRAssetResolverOptions {
  readonly registry: AssetRegistry;
  readonly dataUrlAllowlistOptIn?: boolean;
  readonly allowMixedScriptHostnames?: boolean;
  readonly transformResolver?: TransformResolver; // see Asset transformations
}
```

### 资源变换 / 变体

请求派生渲染（缩放 / 裁剪 / 格式 / 质量），而插件无需处理任何字节——变换是搭载于引用上的声明式 `AssetTransform`（`asset://<id>?w=800&fm=webp`），宿主的 `transformResolver` 将其映射为由你的图片 CDN / 服务产出的派生 URL。IR 解析器会在导出 / 渲染时应用它，并对派生 URL **重新校验**，经过与任何资源 URL 相同的信任边界（恶意的派生会被拒绝）。当未请求变换，或解析器返回 `undefined` 时，使用原始 URL。

```ts
import { createAssetManagerPlugin, createAssetReference } from "@anvilkit/plugin-asset-manager";
import { createQueryParamTransformResolver } from "@anvilkit/plugin-asset-manager/transform";

createAssetManagerPlugin({
  // Built-in query-param mapping (imgix-style w/h/fit/fm/q/dpr by default;
  // param names + fit/format vocab are configurable for other CDNs).
  transformResolver: createQueryParamTransformResolver(),
});

// A component stores a transform-bearing reference:
createAssetReference("asset-1", { width: 800, format: "webp" });
// → "asset://asset-1?w=800&fm=webp"  → resolves to e.g. "https://cdn/asset-1.png?w=800&fm=webp"
```

`AssetTransform` 字段：`width` / `height`（正整数）、`fit`（`cover` \| `contain` \| `fill` \| `inside` \| `outside`）、`format`（`webp` \| `avif` \| `jpeg` \| `png` \| `auto`）、`quality`（1–100）、`dpr`。

| 导出项（`./transform`）               | 用途                                                                    |
| ------------------------------------- | ----------------------------------------------------------------------- |
| `createQueryParamTransformResolver`   | 构建一个向资源 URL 追加查询参数的 `TransformResolver`。                  |
| `deriveVariantUrl(asset, t, resolver)`| 实时（非 IR）解析派生 URL，回退到原始 URL。                             |

派生项的尺寸元数据归宿主所有，因此解析器会从解析结果中丢弃过时的 `width`/`height`/`size`，同时保留 `attribution`（必需的署名在缩放后依然保留）。

### 校验与安全

```ts
function validateUploadResult(
  result: UploadResult,
  options?: ValidateUploadResultOptions,
): UploadResult;
```

在输入有误时抛出 `AssetValidationError`。始终强制执行：

- 默认 scheme 集合：`http`、`https`、`blob`。
- 硬性拦截：`javascript:`、`vbscript:`。
- 路径穿越：在 `http`/`https`/`blob` URL 上拒绝 `../` 及其百分号编码变体（`%2e%2e/`、`%2e%2e%2f`）。
- IDN 同形字：除非设置 `allowMixedScriptHostnames: true`，否则拒绝将拉丁文与西里尔文或希腊文混用的主机名。单一脚本的 IDN 主机（`münchen.de`、`日本.jp`、`россия.рф`）始终被允许。

所选文件会在适配器运行前对照 `maxFileSize`、`acceptedMimeTypes` 和 `acceptedFileExtensions` 进行检查。由于浏览器 `file.type` 由宿主设置，且常常为空或可被伪造，**`sniffContent: true`** 增加了魔数字节检查：其检测到的类型与所声明的、具体的 `file.type` 相矛盾的文件会被拒绝（`CONTENT_TYPE_MISMATCH`）。这是一种纵深防御——无法签名的类型和泛化声明会通过，后端仍应独立校验。

### CSP 顾问

```ts
function getRequiredCsp(options: RequiredCspOptions): RequiredCsp;
```

| 适配器               | `connect-src`                 | `img-src`               | `media-src`             |
| -------------------- | ----------------------------- | ----------------------- | ----------------------- |
| `dataUrlUploader`    | _（无）_                      | `data:`                 | `data:`                 |
| `inMemoryUploader`   | _（无）_                      | `blob:`                 | `blob:`                 |
| `s3PresignedAdapter` | presign 源 + `publicHost`     | `publicHost` ?? presign | `publicHost` ?? presign |
| `s3MultipartAdapter` | `endpoint` + `bucketHost` + `publicHost` | `publicHost` ?? `bucketHost` | `publicHost` ?? `bucketHost` |

将 `s3Multipart: { endpoint, bucketHost?, publicHost? }`（单个或数组）与 `dataUrl` / `inMemory` / `s3` 一起传入。

### React UI（`./ui`）

| 组件                  | 关键 props                                    |
| --------------------- | --------------------------------------------- |
| `UploadButton`        | `{ onUpload, onProgress?, disabled? }`        |
| `AssetBrowser`        | `{ registry, onSelect, maxWidth? }`           |
| `AssetCommandPalette` | `{ registry, onSelect }`                      |
| `MetadataPanel`       | `{ asset, registry, onClose }`                |
| `ReplaceAssetDialog`  | `{ asset, onReplace, onCancel }`              |
| `DeleteAssetDialog`   | `{ asset, onDelete, onCancel }`               |
| `AssetManagerUI`      | `{ registry, plugin, maxWidth? }`（复合）     |

`UploadProgressSnapshot` 为 `{ inFlight: number; completed: number }`。

### 重试辅助工具（`./retry`）

```ts
class RetryableError extends Error {
  readonly retryAfterMs?: number;
}

interface RetryOptions {
  readonly maxRetries?: number; // default 3
  readonly baseDelayMs?: number; // default 250
  readonly maxDelayMs?: number; // default 8000
  readonly signal?: AbortSignal;
  readonly jitter?: () => number; // default Math.random
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options?: RetryOptions,
): Promise<T>;
```

全抖动指数退避；`RetryableError` 上可选的 `retryAfterMs` 会覆盖计算出的延迟（在服务器返回了 `Retry-After` 头时使用）。

### 错误

`AssetValidationError.code`：

| 错误码                         | 来源                        |
| ------------------------------ | --------------------------- |
| `FILE_TOO_LARGE`               | 上传前文件校验              |
| `UNSUPPORTED_MIME_TYPE`        | 上传前文件校验              |
| `UNSUPPORTED_FILE_EXTENSION`   | 上传前文件校验              |
| `INVALID_UPLOAD_ID`            | `validateUploadResult`      |
| `EMPTY_UPLOAD_URL`             | `validateUploadResult`      |
| `UNSCHEMED_UPLOAD_URL`         | `validateUploadResult`      |
| `DISALLOWED_UPLOAD_URL_SCHEME` | `validateUploadResult`      |
| `PATH_TRAVERSAL_URL`           | `validateUploadResult`      |
| `MIXED_SCRIPT_HOSTNAME`        | `validateUploadResult`      |
| `DATA_URL_FILE_TOO_LARGE`      | `dataUrlUploader`           |
| `DATA_URL_READ_FAILED`         | `dataUrlUploader`           |
| `UPLOAD_FAILED`                | `uploadAsset` 兜底包装      |

`AssetResolutionError.code`：

| 错误码                    | 含义                                               |
| ------------------------- | -------------------------------------------------- |
| `ASSET_NOT_FOUND`         | 注册表中没有该资源 id 的条目。                     |
| `ASSET_URL_REJECTED`      | 所存储的 URL 未通过白名单或信任门禁。              |
| `ASSET_VALIDATION_FAILED` | 解析器意外失败的兜底情形。                         |

## 使用示例

### 用于本地开发的 Data-URL 适配器

```ts
createAssetManagerPlugin({
  uploader: dataUrlUploader({ maxBytes: 2_000_000 }),
  dataUrlAllowlistOptIn: true,
});
```

### 生产 S3 接线

```ts
import {
  createAssetManagerPlugin,
  getRequiredCsp,
} from "@anvilkit/plugin-asset-manager";
import { s3PresignedAdapter } from "@anvilkit/plugin-asset-manager/adapters/s3";

const uploader = s3PresignedAdapter({
  presignEndpoint: "/api/assets/sign",
  headers: { Authorization: `Bearer ${apiKey}` },
  retry: { maxRetries: 3 },
});

const plugin = createAssetManagerPlugin({ uploader });

const csp = getRequiredCsp({
  s3: {
    presignEndpoint: "/api/assets/sign",
    publicHost: "https://cdn.example.com",
  },
});

response.setHeader(
  "Content-Security-Policy",
  [
    `default-src 'self'`,
    `connect-src 'self' ${csp.connectSrc.join(" ")}`,
    `img-src 'self' ${csp.imgSrc.join(" ")}`,
    `media-src 'self' ${csp.mediaSrc.join(" ")}`,
  ].join("; "),
);
```

### 自定义上传适配器

```ts
import type { UploadAdapter } from "@anvilkit/plugin-asset-manager";
import {
  RetryableError,
  withRetry,
} from "@anvilkit/plugin-asset-manager/retry";

const myCdnUploader: UploadAdapter = async (file, { signal } = {}) =>
  withRetry(
    async () => {
      const response = await fetch("/api/cdn", {
        method: "POST",
        body: file,
        headers: { "Content-Type": file.type, "X-Filename": file.name },
        signal,
      });
      if (response.status >= 500) {
        throw new RetryableError(`CDN ${response.status}`);
      }
      if (!response.ok) {
        throw new Error(`CDN ${response.status}: ${await response.text()}`);
      }
      const { url, id } = await response.json();
      return {
        id,
        url,
        name: file.name,
        meta: { size: file.size, mimeType: file.type },
      };
    },
    { signal, maxRetries: 2 },
  );
```

### 在导出时解析资源

```ts
import {
  createAssetRegistry,
  createIRAssetResolver,
  resolveAssets,
} from "@anvilkit/plugin-asset-manager";

const registry = createAssetRegistry();
registry.register({
  id: "logo",
  url: "https://cdn.example.com/logo.svg",
  name: "logo.svg",
});

const resolver = createIRAssetResolver({ registry });
const resolved = resolveAssets(ir, resolver);
// `asset://logo` references inside `ir` are now full URLs.
```

## 注意事项与常见问题

### 信任模型默认严格

`UploadAdapter.url` 被视为不可信输入。默认 scheme 集合为 `http`、`https`、`blob`。`data:` **默认关闭**——通过 `dataUrlAllowlistOptIn: true` 启用。除非设置 `allowMixedScriptHostnames: true`，否则拒绝混合脚本主机名。在任何配置下，插件都不会让适配器把 `javascript:` URL 偷渡进注册表。

### 从 alpha 时期的 `urlAllowlist` 字段迁移

alpha 时期的 `urlAllowlist?: readonly string[]` 字段已被移除。

| Alpha                                             | 替代方案                                                                            |
| ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `urlAllowlist: ["http", "https", "blob"]`         | _（默认——删除该字段）_                                                              |
| `urlAllowlist: ["http", "https", "blob", "data"]` | `dataUrlAllowlistOptIn: true`                                                       |
| `urlAllowlist: ["http", "https", "blob", "ftp"]`  | _不支持——包装 `validateUploadResult` 并直接调用 `registry.register`_                |

理由：在边界处允许的每个 scheme 都需要其自身的 CSP / 净化方案。带类型的标志会强制让该决定显式化。

### 批量上传行为

`StudioAssetSource.upload(files)` 会并行运行至多 `maxConcurrentUploads`（默认 3）个上传。单文件失败会经由监听器以 `error` 信封形式呈现；返回的 promise 以成功的子集 resolve，并**不会抛出**。需要快速失败语义的宿主可传入 `maxConcurrentUploads: 1`。来自适配器的 `AbortError` 会中止整个批次——待处理的文件不会被调度。

### 持久化归宿主所有

插件按每次 Studio 挂载在内存中保存注册表状态。如需跨会话复用资源，宿主应在服务端存储 `publicUrl`，并在启动时经由 `registry.register(...)` 重新填充注册表。

### S3 适配器绝不记录文件内容

仅 `name`、`size` 和 `mimeType` 被视为可安全记录。如果你的宿主端点与 S3 不兼容（无覆盖语义），请传入 `retry: { maxRetries: 0 }` 以禁用重试，避免出现重复上传的小概率。

### 生产检查清单

1. **选对适配器。** `dataUrlUploader` 仅供开发。`s3PresignedAdapter` 是生产默认；将其接到你的 presign 端点并设置 `retry: { maxRetries: 3 }`。
2. **显式设置信任标志。** 决定你的宿主是否需要 `dataUrlAllowlistOptIn: true`（仅当你的流程端到端嵌入 `data:` URL 时）。除非有明确记录的业务需求，否则保持 `allowMixedScriptHostnames` 关闭。
3. **接线 CSP。** 调用 `getRequiredCsp(...)` 并将结果合并到你的 `connect-src` / `img-src` / `media-src` 构建器中。增删适配器时重新运行。
4. **选择持久化方案。** 插件状态在内存中；宿主在服务端存储 `publicUrl` 并在启动时重新填充。
5. **监控。** 订阅 `asset-manager:error` 事件总线信封以捕获上传失败，并从你的导出流水线记录 `AssetResolutionError.code`，使 `ASSET_NOT_FOUND` / `ASSET_URL_REJECTED` / `ASSET_VALIDATION_FAILED` 得到各自独立的告警。
6. **锁定包体积。** `.size-limit.json` 将 headless 入口保持在 8 KB gzip 以下、UI 子路径在 12 KB 以下。CI 对两者都设置门禁。

### 可选 UI 是独立入口

从 `@anvilkit/plugin-asset-manager` 导入绝不会拉入 `/ui` 组件。自带浏览器/上传 UI 的宿主无需承担任何 UI 渲染成本。
