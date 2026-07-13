# @anvilkit/plugin-ai-image

> **Alpha（`0.1.4`）。** API は `1.0` 以前に変更される可能性があります。このプラグインは
> AI サービスと直接通信することはありません——すべてのジョブはホストが提供する
> `AiImageProvider` に委譲されるため、認証情報、モデル識別子、エンドポイントが
> プラグインの境界を越えることはありません。

AnvilKit **Canvas Studio** 向けの AI 画像生成プラグインです。ホストが提供する
`AiImageProvider` をラップし、エディターが 1 つの型付き契約を通じて text-to-image、variation、
inpaint、背景除去、アップスケールの各ジョブを発行できるようにします——さらに周辺のビルディングブロック
（中止/リトライ/ポーリング対応のジョブクライアント、mock provider、マスクエディター、
後処理パイプライン、キャンバスコミットヘルパー、そしてオプションの React サイドバーパネル）を、
それぞれ別個のサブパスエクスポートとして提供します。

> **ステータス。** イテレーション 1 のビルディングブロックはすべて出荷済みです：ジョブクライアント
> （`./` — `createAiJobClient`）、mock provider（`./mock`）、マスクエディター
> （`./mask`）、後処理パイプライン（`./post-process`）、コミットヘルパー（`./commit`）、
> および React サイドバーサーフェス（`./react`）。素の
> `createAiImagePlugin` ファクトリは provider を検証し、命令的な
> `submit()` メソッドを公開しますが、登録するのは空の Studio フックブロックです——それ自体ではまだ
> ライフサイクルフックや UI を提供しません。パネルは
> `@anvilkit/plugin-ai-image/react` 経由でマウントしてください（または `useAiImage` の上に独自の UI を組み込んでください）。

## インストール

```sh
pnpm add @anvilkit/plugin-ai-image react react-dom @puckeditor/core
```

peer 依存関係：`react >=19.0.0`、`react-dom >=19.0.0`、
`@puckeditor/core ^0.22.1`、`@anvilkit/ui`（React パネル用）、および
`konva ^10` + `react-konva ^19`（`./mask` と `./react` の Konva
サーフェス用）。ヘッドレスの `.` エントリ——ファクトリ、ジョブクライアント、後処理、コミット——は
Konva を必要としません。`@anvilkit/canvas-core` は直接依存関係として出荷され、
ワイヤーシェイプ型のソースオブトゥルースとなります。

サブパスインポート：

| サブパス                                  | エクスポート                                                                           |
| ---------------------------------------- | -------------------------------------------------------------------------------------- |
| `@anvilkit/plugin-ai-image`              | `createAiImagePlugin`、`createAiJobClient`、`RetryableError`、`commitImageReplace`、マスクエクスポーターユーティリティ、およびすべてのワイヤーシェイプ型。 |
| `@anvilkit/plugin-ai-image/react`        | `AiImagePanel`、`useAiImage`、`createAiImageSidebarPlugin`。                            |
| `@anvilkit/plugin-ai-image/mask`         | `MaskEditorLayer`、`useMaskStrokes`、マスク型。                                        |
| `@anvilkit/plugin-ai-image/post-process` | `createPostProcessPipeline` + 画像ヘルパー（`dataUrlToFile`、`sourceToFile`、`thumbnailDimensions`、`PostProcessError`）。 |
| `@anvilkit/plugin-ai-image/commit`       | `commitImageReplace`。                                                                 |
| `@anvilkit/plugin-ai-image/mock`         | テストとデモ用の `createMockAiImageProvider`。                                          |

## クイックスタート

```ts
import { createAiImagePlugin } from "@anvilkit/plugin-ai-image";
import type { AiImageProvider } from "@anvilkit/plugin-ai-image";

const provider: AiImageProvider = async (request, context, options) => {
  // Call your AI service of choice (Replicate, OpenAI, self-hosted SD, ...).
  // Honour `options?.signal` for cancellation and return an AiImageJobResult.
  const res = await fetch("/api/ai/image", {
    method: "POST",
    body: JSON.stringify({ request, context }),
    signal: options?.signal,
  });
  return res.json();
};

export const aiImage = createAiImagePlugin({ provider });

// Imperative submit (delegates straight to your provider):
const result = await aiImage.submit(
  { kind: "text-to-image", prompt: "a calm mountain lake at dawn" },
  { artboardId: "artboard-1" },
);
```

## コア機能

- **1 つの型付き provider 契約** — 5 つのジョブ種別（`text-to-image`、`variation`、
  `inpaint`、`bg-remove`、`upscale`）が単一の `AiImageProvider`
  コールバックを流れます。認証情報やモデル識別子がプラグインの境界を越えることはありません。
- **中止/リトライ/ポーリング対応のジョブクライアント** — `createAiJobClient` は provider をラップし、
  一時的な失敗に対するリトライ（指数バックオフ + ジッター）と、`status: "pending"` を返す
  非同期ジョブ向けのオプションのポーリングを提供します。
- **マスクエディター** — `MaskEditorLayer` + `useMaskStrokes` が Konva レイヤー上でブラシ
  ストロークをキャプチャし、エクスポーターがそれらを inpaint ジョブ用のマスクアセットへラスタライズします。
- **後処理パイプライン** — 正規化 → MIME 検証 → サイズ検証 →
  オプションの圧縮 → メインアセットの登録 → サムネイルの生成と登録。
- **キャンバスコミットヘルパー** — `commitImageReplace` がホストのキャンバスコマンドバス向けに型付きの
  `image.replace` コマンドを構築します。
- **React サイドバーパネル** — `AiImagePanel` と自己登録型の
  `createAiImageSidebarPlugin` が、生成 UI を Studio サイドバーの
  `copilot` モジュールに投入します。
- **決定論的な mock** — `createMockAiImageProvider` は、テストとデモ向けにレイテンシと
  種別ごとの結果（および強制失敗）をシミュレートします。

## API リファレンス

### ファクトリ

```ts
function createAiImagePlugin(
  opts: AiImagePluginOptions,
): StudioPlugin & AiImagePluginInstance;

interface AiImagePluginOptions {
  provider: AiImageProvider; // required — throws TypeError if not a function
}

interface AiImagePluginInstance {
  submit(
    request: AiImageJobRequest,
    context: AiLayerContext,
    options?: { signal?: AbortSignal },
  ): Promise<AiImageJobResult>;
}
```

`submit()` は設定済みの `provider` に直接委譲します。返されるオブジェクトは
同時に `StudioPlugin` でもあり、その `register()` は現在のところ空の `hooks` ブロックを返します。

### ワイヤーシェイプ型（`@anvilkit/canvas-core` から再エクスポート）

```ts
type AiImageJobRequest =
  | { kind: "text-to-image"; prompt: string; negativePrompt?: string; width?: number; height?: number; seed?: number }
  | { kind: "variation"; sourceAssetId: string; strength?: number; seed?: number }
  | { kind: "inpaint"; sourceAssetId: string; maskAssetId: string; prompt: string; seed?: number }
  | { kind: "bg-remove"; sourceAssetId: string }
  | { kind: "upscale"; sourceAssetId: string; scale?: number };

type AiImageJobKind = AiImageJobRequest["kind"];
type AiImageJobStatus = CanvasAiPlaceholderStatus | "cancelled";

interface AiImageJobResult {
  jobId: string;
  status: AiImageJobStatus;
  resultAssetId?: string;
  error?: { code: string; message: string };
  startedAt: number;
  finishedAt?: number;
}

interface AiLayerContext {
  artboardId: string;
  selectedNodeId?: string;
  bounds?: { x: number; y: number; width: number; height: number };
}

type AiImageProvider = (
  request: AiImageJobRequest,
  context: AiLayerContext,
  options?: { signal?: AbortSignal },
) => Promise<AiImageJobResult>;
```

これらは `@anvilkit/canvas-core` に存在するため、ヘッドレス IR とこのプラグインが
ワイヤーシェイプについて一致します。利便性のため、このパッケージはそれらを再エクスポートしています。

### ジョブクライアント（`.`）

```ts
function createAiJobClient(options: AiJobClientOptions): AiJobClient;

interface AiJobClient {
  run(
    request: AiImageJobRequest,
    context: AiLayerContext,
    options?: { signal?: AbortSignal },
  ): Promise<AiImageJobResult>;
}
```

| `AiJobClientOptions` フィールド | 型               | デフォルト  | 目的                                                                    |
| -------------------------- | ---------------- | ----------- | ----------------------------------------------------------------------- |
| `provider`                 | `AiImageProvider`| _必須_      | ホストが提供する provider。                                             |
| `poll`                     | `AiJobPollFn`    | なし        | 非同期ジョブ用のポーラー。provider が非終端の `pending` を返し `poll` が設定されている場合、クライアントは終端/中止/タイムアウトまでポーリングします。 |
| `pollIntervalMs`           | `number`         | `1000`      | ポーリング試行間の遅延。                                                |
| `pollTimeoutMs`            | `number`         | なし        | ポーリングループの実時間予算。超過時はコード `TIMEOUT` の `error` 結果に解決します。 |
| `maxRetries`               | `number`         | `3`         | 初回呼び出し後のリトライ回数（一時的な失敗のみ）。                       |
| `baseDelayMs`              | `number`         | `250`       | 基本バックオフ遅延。                                                    |
| `maxDelayMs`               | `number`         | `8000`      | ジッター前のバックオフ上限。                                            |
| `jitter` / `sleep` / `now` | 関数             | プラットフォーム | 決定論的テスト用の注入ポイント。                                    |

`options.signal` を中止すると `cancelled` 結果に解決します。provider から `RetryableError`
をスローすると、その失敗を一時的なものとしてマークし、バックオフループの対象とすることができます。

### マスク編集（`./mask`）

| エクスポート       | シグネチャ                                                  | 目的                                                 |
| ----------------- | ----------------------------------------------------------- | ---------------------------------------------------- |
| `MaskEditorLayer` | React（`react-konva`）コンポーネント                        | inpaint マスク用のブラシストロークキャプチャレイヤー。 |
| `useMaskStrokes`  | `(options?: UseMaskStrokesOptions) => UseMaskStrokesResult` | マスクレイヤーのストローク状態 + ポインターハンドラー。 |

### マスクエクスポート（ルートエントリ）

マスクのラスタライズ/アップロードヘルパーは、`./mask` サブパスではなくルートエントリ
（`@anvilkit/plugin-ai-image`）からエクスポートされます：

| エクスポート                  | シグネチャ                                                      | 目的                                                              |
| ---------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------ |
| `createMaskToAssetExporter`  | `(options: MaskToAssetExporterOptions) => MaskToAssetExporter`  | `.export(strokes, dimensions)` がラスタライズ + アップロードを行い、マスクアセット id に解決します。 |
| `drawMask`                   | `(ctx, strokes, options?) => void`                              | 2D context へのマスクの低レベルラスタライズ。                     |
| `rasterizeMaskToDataUrl`     | `(input: RasterizeMaskInput) => string`                         | ストロークを PNG data URL にレンダリングします。                  |
| `dataUrlToFile`              | `(dataUrl: string, filename: string) => File`                   | data URL をアップロード用の `File` に変換します。                |

### 後処理（`./post-process`）

```ts
function createPostProcessPipeline(
  options: PostProcessOptions,
): PostProcessPipeline; // .process(source) => Promise<PostProcessResult>
```

| `PostProcessOptions` フィールド | 型                        | デフォルト | 目的                                                            |
| -------------------------- | --------------------------- | ------- | ---------------------------------------------------------------- |
| `upload`                   | `PostProcessUpload`         | _必須_  | ホストのアップロード関数。メイン画像とサムネイルの両方に対して呼び出されます。 |
| `acceptedMimeTypes`        | `readonly string[]`         | なし    | MIME 許可リスト。一致しないソースは `PostProcessError` をスローします。 |
| `maxBytes`                 | `number`                    | なし    | サイズ上限。                                                    |
| `thumbnail`                | `{ maxEdge?; mimeType? }`   | `maxEdge: 256` | サムネイルの寸法/フォーマット（常に生成）。              |
| `compress`                 | `{ mimeType?; quality? }`   | なし    | オプトインの再エンコード（例：`image/webp` へ）。               |
| `createCanvas` / `decodeImage` | 関数                    | プラットフォーム | 非 DOM／テスト環境用の注入ポイント。                       |
| `filename`                 | `string`                    | なし    | アップロードされるアセットの基本ファイル名。                    |

`PostProcessResult` は `{ assetId, thumbnailAssetId, mimeType, bytes, width, height }` を返します。
ヘルパー `dataUrlToFile`、`sourceToFile`、`thumbnailDimensions`、および
`PostProcessError` クラスが併せてエクスポートされます。

### コミット（`./commit`）

```ts
function commitImageReplace<T = unknown>(
  options: CommitImageReplaceOptions<T>,
): T;

interface CommitImageReplaceOptions<T = unknown> {
  commit: (cmd: CanvasImageReplaceCommand) => T; // CommitCanvasCommandFn<T>
  nodeId: string;
  fromAssetId: string;
  toAssetId: string;
}
```

`image.replace` キャンバスコマンドを構築し、それをホストの `commit`
関数（例：`(cmd) => historyStore.getState().commit(currentIr, cmd)`）に渡し、
その関数が返すものをそのまま返します。

### React（`./react`）

```ts
function AiImagePanel(props: AiImagePanelProps): ReactElement;
function useAiImage(options: UseAiImageOptions): UseAiImageResult;
function createAiImageSidebarPlugin(
  options: CreateAiImageSidebarPluginOptions,
): StudioPlugin;
```

- **`AiImagePanel`** — 生成 UI（操作セレクター、プロンプトフィールド、実行/キャンセル）。
  `jobClient`、`getLayerContext` アクセサー、オプションの `defaultOp`、
  および注入可能な i18n `labels` によって駆動されます。
- **`useAiImage`** — フィールド値、変更
  ハンドラー、`onRun` / `onCancel` を返すヘッドレスなパネル状態フックです。`AiImagePanel` の
  クロムが合わない場合に、独自の UI に組み込んでください。
- **`createAiImageSidebarPlugin`** — `AiImagePanel` を Studio サイドバーの
  `copilot` モジュールにマウントする自己登録型プラグインです。オプション：

  | フィールド       | 型                                    | デフォルト       | 目的                                                              |
  | ---------------- | ------------------------------------- | ---------------- | ------------------------------------------------------------------ |
  | `jobClient`      | `AiJobClient`                         | _必須_           | ジョブを駆動します（推奨：`createAiJobClient` から）。            |
  | `getLayerContext`| `() => AiLayerContext \| null`        | `() => null`     | ライブのアクティブアートボード/選択アクセサー。`null` は Run を無効化します。 |
  | `defaultOp`      | `AiImageJobKind`                      | `"text-to-image"`| 初回レンダリング時に選択される操作。                              |
  | `labels`         | i18n コピー                           | なし             | `AiImagePanel` に転送されます。                                   |

  **単一占有に関する注意。** Core のサイドバーレジストリは単一の
  `copilotPanel` を保持します（後勝ち）。このパネルと `@anvilkit/plugin-ai-copilot` の
  パネルはどちらも `copilot` スロットを要求します——`<Studio>` マウントごとに 1 つだけ登録してください。
  実際には、これらは異なる Studio context に存在します（canvas エディターは
  Puck ページエディターとは別個にマウントされる兄弟モードです）。

### Mock（`./mock`）

```ts
function createMockAiImageProvider(
  opts?: CreateMockAiImageProviderOptions,
): AiImageProvider;
```

| フィールド      | 型                                              | デフォルト | 目的                                             |
| --------------- | ----------------------------------------------- | ------- | ------------------------------------------------ |
| `latencyMs`     | `number`                                        | `0`     | シミュレートされた（中止対応の）provider レイテンシ。 |
| `resultAssetId` | `string \| ((request) => string)`               | なし    | 決定論的な結果アセット id、またはリクエストごとの関数。 |
| 失敗オプション  | —                                               | なし    | エラーとリトライのパスを演習するために、一時的/終端の失敗を強制します。 |

## 注意事項と FAQ

### セキュリティモデル

プラグインが認証情報、エンドポイント、モデル識別子を見ることはありません——それらは
ホストの `AiImageProvider` に属します。provider はちょうど `(request, context,
options)` を受け取り、`AiImageJobResult` を返します。

### 中止シグナルを尊重する

`submit()` と `AiJobClient.run()` は `AbortSignal` を provider まで通します。
provider は `options.signal` を自身の `fetch`（または同等のもの）に渡すべきです。そうすればキャンセル、
リトライのスリープ、ポーリングループがすべて速やかに停止します。中止は例外をスローするのではなく
`cancelled` 結果に解決します。

### Konva はビジュアルサーフェスにのみ必要

ヘッドレスの `.` エントリ（ファクトリ、ジョブクライアント、後処理、コミット）には Konva
依存関係がありません。`konva` + `react-konva` が必須となるのは、`./mask`
エディターレイヤーまたは `./react` パネルをインポートするときだけです。

## ライセンス

MIT
