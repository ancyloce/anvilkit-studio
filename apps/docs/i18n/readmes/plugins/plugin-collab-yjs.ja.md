# @anvilkit/plugin-collab-yjs

> **リリース候補（`0.10.x`）。** `@next` npm dist-tag で公開されています。ノード単位の CRDT マージ（`useNativeTree`）が現在のデフォルトになりました。GA のタイムラインについては `docs/policies/lts.md` を参照してください。

`SnapshotAdapter` v2 契約が、Core や Puck をフォークすることなく Puck と並んでライブ CRDT 状態をホストできることを実証する、ファーストパーティの Anvilkit Studio プラグインです。[Yjs](https://github.com/yjs/yjs) と [`y-protocols/awareness`](https://github.com/yjs/y-protocols) の上に構築されており、データレイヤーのみを提供します。React の表示レイヤーには `@anvilkit/collab-ui` と組み合わせるか、公開フックの上に独自の UI を組み立ててください。

## スコープ / 共有型のサポート

**これは PageIR 専用の Yjs アダプターであり、汎用的な Yjs バインディングではありません。** 単一のドメインモデル——Puck の `PageIR`——をフラットアドレス指定の `Y.Map` ツリーへとミラーリングします：

- ノードごとに 1 つの `Y.Map`（キーは `node:<id>`）で、そのノードのスカラーフィールドを保持します。
- 順序付き構造のための、親ごとの `Y.Array<string>` の `childIds` リスト。
- **JSON エンコードされたプロップ値**——各プロップはノードごとの `Y.Map` 内に `JSON.stringify` された文字列として格納されるため、プロップは CRDT にとって不透明であり、文字単位ではなくキー単位（LWW）でマージされます。

したがって、バインドする Yjs 共有型は `Y.Map` と `Y.Array` の **2 つだけ** です。ネイティブの `Y.Text`、`Y.XmlElement`、`Y.XmlFragment`、および**サブドキュメント**は**スコープ外**です——これらの型の内部での共同編集を Puck エディターへ投影する公開バインディングは存在しません。（特に、リッチテキストのプロップは文字レベルの CRDT マージを得られません。プロップ値は保存のたびに丸ごと置き換えられます。）

この契約はエクスポートされており、機械的にチェック可能です。そのため、ホストは散文を読む代わりにそれを使って分岐できます：

```ts
import {
  SHARED_TYPE_SUPPORT,
  isManagedSharedType,
  getHostSharedRoot,
} from "@anvilkit/plugin-collab-yjs";

SHARED_TYPE_SUPPORT.model; // "page-ir"
SHARED_TYPE_SUPPORT.managed; // ["Y.Map", "Y.Array"]
SHARED_TYPE_SUPPORT.unsupported; // ["Y.Text", "Y.XmlElement", "Y.XmlFragment", "Y.Doc"]
SHARED_TYPE_SUPPORT.propEncoding; // "json-string"

isManagedSharedType("Y.Array"); // true
isManagedSharedType("Y.Text"); // false
```

**エスケープハッチ。** ページと並んでネイティブの共有型が本当に必要な場合（`Y.Text` のコメントスレッド、`Y.XmlFragment` のフィールド、サブドキュメントなど）、`getHostSharedRoot(doc, namespace)` は **同一の** `Y.Doc` 上のトップレベルの `Y.Map` を返します。これは `` `${mapName}:host:${namespace}` `` の下に名前空間化されているため、アダプターが管理する 2 つのルート（レガシー blob ルートの `mapName` とネイティブツリールートの `` `${mapName}:tree` ``）と衝突することは決してありません。アダプターはそのマップを読みも書きもしません——その内容は投影された `PageIR`、スナップショット、アンドゥ、競合検出には現れません——しかし共有ドキュメント上に存在するため、Yjs は依然としてそれをレプリケートします（そしてオプトインの永続化/トランスポートも依然としてそれを運びます）。それを解釈してレンダリングするのは、完全にホストの責任です。

```ts
import { getHostSharedRoot } from "@anvilkit/plugin-collab-yjs";
import * as Y from "yjs";

// Host-owned, adapter-ignored — safe to attach any native shared type.
const comments = getHostSharedRoot(doc, "comments");
const thread = new Y.Text();
comments.set("hero-1", thread);
```

## インストール

```bash
pnpm add @anvilkit/plugin-collab-yjs yjs y-protocols react react-dom @puckeditor/core
```

`yjs` と `y-protocols` は直接のランタイム依存関係です。`react`、`react-dom`、`@puckeditor/core` は、これが「データのみ」のレイヤーであっても**任意ではない** peer です。このパッケージは React フック（例：`usePuckSelection`）をエクスポートし、そのプラグインファクトリは React ベースの Studio シェル内で実行されるため、React は本当に必要です。React フリーのエントリポイントには分割されていません。トランスポートには、`y-websocket`（デモ用）をインストールするか、独自のプロバイダー（Hocuspocus、カスタム WebRTC など）を接続してください。

## クイックスタート

```ts
import {
  createCollabDataPlugin,
  createDebouncedAdapter,
  createYjsAdapter,
} from "@anvilkit/plugin-collab-yjs";
import { Doc as YDoc } from "yjs";
import { WebsocketProvider } from "y-websocket";

const doc = new YDoc();
const provider = new WebsocketProvider(
  "ws://localhost:21234",
  "demo-room",
  doc,
);

const adapter = createYjsAdapter({
  doc,
  awareness: provider.awareness,
  peer: { id: "alice", displayName: "Alice", color: "#f43f5e" },
});

const debounced = createDebouncedAdapter(adapter, { ms: 150 });

registerPlugins([
  createCollabDataPlugin({
    adapter: debounced,
    puckConfig: myPuckConfig,
    localPeer: { id: "alice", displayName: "Alice", color: "#f43f5e" },
  }),
]);
```

単一のファクトリ呼び出しで完全なデータ + UI バンドルを得るには、代わりに `@anvilkit/collab-ui` から `createCollabPlugin` をインポートしてください。

## コア機能

- **デフォルトでノード単位の CRDT マージ** —— `PageIR` はフラットアドレス指定の `Y.Map` ツリーとしてミラーリングされるため、互いに素なノードへの同時編集は、全文書 LWW のもとで互いを上書きすることなく、どちらも残ります。
- **スナップショット履歴** —— `save()` のたびにライブエンコーディングと `snapshotMeta:<id>` + `snapshotPayload:<id>` のペアの両方が書き込まれ、どのエンコーディングがライブであるかにかかわらず `SnapshotAdapter` 履歴契約を満たします。
- **競合診断** —— リモート更新が `staleAfterMs`（デフォルト 2000 ミリ秒）以内にローカルの進行中の編集の上に着地すると `onConflict(event)` が発火します。
- **接続状態契約** —— 5 つのバリアントを持つ `ConnectionStatus`（`connecting`/`synced`/`offline`/`reconnecting`/`error`）により、ホストはプロバイダー固有のフィールドを読むことなく統一された同期インジケーターをレンダリングできます。
- **可観測性** —— `metrics()` はレイテンシのパーセンタイル、awareness のチャーン（5 分間のスライディングウィンドウ）、検証失敗カウント、そしてテレメトリシンク向けのメインスレッドのホットパスタイミングを返します。
- **タブ間の永続化** —— オプトインの IndexedDB キュー + 同一オリジンの `BroadcastChannel` リレー。短い切断を生き延び、トランスポートを往復することなく同じアプリの 2 つのタブを同期します。
- **多層防御のプレゼンスセキュリティ** —— 厳格なカラー許可リスト、表示名に対する制御文字の除去、awareness のレート制限、そして敵対的なピアの拒否のための `validateRemoteIR` フック。
- **強制再同期** —— `adapter.forceResync()` は未保存のローカル編集を破棄し、最新の権威あるスナップショットを再発行して、ホストの「破棄して再読み込み」アフォーダンスを実現します。

## API リファレンス

### ファクトリ関数

| 関数                     | シグネチャ                                                                      | 目的                                                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createYjsAdapter`       | `(opts: CreateYjsAdapterOptions) => YjsSnapshotAdapter`                         | Yjs の `Doc` とオプションの `Awareness` から CRDT で支えられた `SnapshotAdapter` を構築します。                                                                  |
| `createCollabDataPlugin` | `(opts: CreateCollabPluginOptions) => StudioPlugin`                             | アダプターを Studio プラグインにラップします（データ同期のみ——UI なし）。                                                                              |
| `createDebouncedAdapter` | `(adapter, opts?: CreateDebouncedAdapterOptions) => SnapshotAdapterWithMetrics` | 高速な `save()` 呼び出しをデバウンスウィンドウ（デフォルト 150 ミリ秒）ごとに 1 回のトランスポート書き込みへとまとめます。アンマウント時に呼び出す必要がある `destroy()` メソッドを持つアダプターを返します。 |
| `createCollabPlugin`     | _`createCollabDataPlugin` の非推奨エイリアス_                                  | マイナーリリース 1 回分のあいだ保持されます。最初の呼び出し時に 1 回限りの `console.warn` をログ出力します。バンドル済みの UI ファクトリには `@anvilkit/collab-ui` から `createCollabPlugin` をインポートしてください。                |

### `CreateYjsAdapterOptions`

| フィールド           | 型                          | デフォルト             | 目的                                                                                                                                                                        |
| -------------------- | --------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `doc`                | `YDoc`                      | _必須_             | Yjs ドキュメント。ホストが所有します。アダプターが自身のものを構築することはありません。                                                                       |
| `awareness`          | `Awareness`                 | 自動作成           | プレゼンスチャネル。省略した場合、アダプターが内部で 1 つ作成します。                                                                                       |
| `peer`               | `PeerInfo`                  | エフェメラル        | ローカルアイデンティティ。省略すると `local-<uuid>` の id を生成し、警告ログを出力します。本番環境では安定した id を指定してください。                                              |
| `mapName`            | `string`                    | `"default"`            | ルート `Y.Map` のキー。                                                                                                                                                     |
| `staleAfterMs`       | `number`                    | `2000`                 | ローカルで編集されたノードに触れるリモート更新がオーバーラップとしてカウントされるウィンドウ。                                                       |
| `useNativeTree`      | `boolean`                   | `true`                 | ノード単位の CRDT マージ。レガシーな JSON-blob ルームに対してのみ `false` を設定してください——異なるモードのレプリカは `Y.Doc` を共有できません。                          |
| `connectionSource`   | `ConnectionSource`          | なし                 | ホストのトランスポートイベントソース。プロバイダーの接続状態が変化すると、ホストが `emit(status)` を呼び出します。                                          |
| `computeDelta`       | `boolean`                   | `false`                | `true` の場合、`save()` のたびに構造的な `IRDiff` が `SnapshotMeta.delta` に添付されます。                                                                           |
| `maxSnapshots`       | `number`                    | `200`                  | 共有 `Y.Doc` 内で保持されるスナップショットの厳格な上限。古い payload+meta のペアは書き込みと同じトランザクションで退避されます。無効にするには `<= 0` を設定します（非推奨）。 |
| `awarenessRateLimit` | `AwarenessRateLimitOptions` | `{ maxPerSecond: 30 }` | アウトバウンドの `presence.update` に対するトークンバケットリミッター。無効にするには `maxPerSecond: Infinity` を設定します。                                                                                  |
| `persistence`        | `PersistenceOptions`        | なし                 | オプトインの IndexedDB キューと `BroadcastChannel` リレー。各バックエンドは機能検出を行い、SSR や古いブラウザでは静かにデグレードします。                             |

### `CreateCollabPluginOptions`

| フィールド              | 型                                     | デフォルト | 目的                                                                                                                                           |
| ----------------------- | -------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `adapter`               | `SnapshotAdapter`                      | _必須_ | CRDT アダプター（通常は `createYjsAdapter` から、必要に応じて `createDebouncedAdapter` でラップ）。                                            |
| `puckConfig`            | `Config`                               | なし       | アウトバウンド同期（Puck → IR）に必須。読み取り専用ビューアーでは省略します。                                                                            |
| `localPeer`             | `PeerInfo`                             | エフェメラル | 競合の帰属、ポリシーチェック、プレゼンスカーソルに使用されるアイデンティティ。省略すると警告をログ出力し、インスタンスごとのエフェメラル id を生成します。 |
| `validateRemoteIR`      | `(ir: PageIR) => PageIR \| null`       | なし       | 多層防御の検証フック。`null` を返すか例外をスローすると更新が拒否されます。                                                                             |
| `onValidationFailure`   | `(failure: ValidationFailure) => void` | なし       | 拒否されたリモート IR に対するホスト側オブザーバー（トースト、テレメトリ）。                                                                                 |
| `onSaveError`           | `(error: unknown) => void`             | なし       | アウトバウンドのトランスポート失敗オブザーバー。これがないと、ネットワークの 5xx エラーは `unhandledRejection` として表面化します。                                           |
| `policy`                | `CollabPolicy`                         | なし       | 対称的な RBAC ブリッジ。`canEdit(node, peer)` はインバウンドとアウトバウンドの両方で参照されます。                                                                       |
| `onPolicyViolation`     | `(violation: PolicyViolation) => void` | なし       | `policy.canEdit` が拒否したときに発火します。                                                                                                           |
| `inboundScheduler`      | `InboundSchedulerHandleScheduler`      | `requestAnimationFrame` / `setTimeout` | （H1）インバウンドの合体スケジューラーをオーバーライドします。ブラウザではデフォルトで `requestAnimationFrame`、SSR/Node では `setTimeout` になります。決定論的テスト向けです——本番環境では設定しないでください。 |
| `inboundBudgetMs`       | `number`                               | `16`       | （H1）`requestAnimationFrame` が利用できない場合に使用される、フォールバックのインバウンドフラッシュ間隔（ミリ秒）。                                                   |
| `replaceBatchThreshold` | `number`                               | `50`       | このしきい値を下回るとノード単位の `replace` をディスパッチします。上回るとプラグインは単一の `setData` 呼び出しにフォールバックします。                                 |

### `YjsSnapshotAdapter`

`SnapshotAdapter`（`@anvilkit/plugin-version-history` から）を以下で拡張します：

| メンバー         | シグネチャ                                                | 目的                                                                                                                                       |
| ---------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `onConflict`     | `(cb: (event: ConflictEvent) => void) => Unsubscribe`     | オーバーラップ診断。                                                                                                                        |
| `onStatusChange` | `(cb: (status: ConnectionStatus) => void) => Unsubscribe` | 接続状態ストリーム。登録時に現在の状態で同期的に呼び出されます。                                                                     |
| `getStatus`      | `() => ConnectionStatus`                                  | 最新状態の同期読み取り。React では `useSyncExternalStore` 内で `onStatusChange` を使うことを推奨します。                                             |
| `forceResync`    | `() => Promise<PageIR \| null>`                           | 未保存のローカル編集を破棄し、最新の権威あるスナップショットを再発行します。スナップショットが存在しない場合は `null` に解決します。                        |
| `metrics`        | `() => MetricsSnapshot`                                   | 時点ごとの可観測性スナップショット。秒単位のポーリングで呼び出すコストは安価です。                                                              |
| `destroy`        | `() => void`                                              | 内部サブスクリプションを解放します。Studio プラグインの `onDestroy` によって自動的に呼び出されます——カスタムのプラグインラッパーを構築する場合にのみ必要です。 |

### `ConnectionStatus`（判別共用体）

```ts
type ConnectionStatus =
  | { kind: "connecting" }
  | { kind: "synced"; since: string }
  | { kind: "offline"; since: string; queuedEdits: number }
  | { kind: "reconnecting"; attempt: number; backoffMs: number }
  | { kind: "error"; message: string; recoverable: boolean };
```

`queuedEdits` はアダプターが内部カウンターから設定します。ホストが渡す値は無視されます。

### `ConflictEvent`

```ts
interface ConflictEvent {
  kind: "overlap";
  localPeer: PeerInfo;
  remotePeer?: PeerInfo;
  nodeIds: readonly string[];
  at: string;
}
```

### `MetricsSnapshot`（抜粋フィールド）

| フィールド                                                                                                      | 意味                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `saveCount`、`transportWrites`、`saveCoalescingRatio`                                                            | 保存トラフィックとデバウンサーの有効性。                                                                                   |
| `syncLatencyP50Ms`、`syncLatencyP95Ms`、`syncLatencySamples`                                                     | 直近 200 サンプルにわたるエンドツーエンドのレイテンシパーセンタイル。                                                              |
| `awarenessChurn`、`presenceValidationFailures`                                                                   | プレゼンスの健全性——高いチャーンや非ゼロの失敗は、行儀の悪いピアを指し示します。                                                         |
| `inboundCoalesced`、`inboundQueueDelayP50Ms`                                                                     | インバウンド合体器のアクティビティ。非ゼロの `inboundCoalesced` は、アダプターがリモートのバーストからエディターを保護したことを意味します。                     |
| `conversionTimeP50Ms`、`dispatchTimeP50Ms`、`saveEncodeTimeP50Ms`、`nativeApplyTimeP50Ms`、`nativeReadTimeP50Ms` | メインスレッドのホットパスタイミング（P1）。                                                                                                     |
| `degraded`、`degradedReasons`                                                                                    | アダプターがネイティブツリーからレガシー blob へフォールバックしたかどうか、およびそのトリップ理由（`cycle`/`max-depth`/`max-nodes`/`decode-failure`）。 |
| `dispatchFailures`                                                                                               | 例外をスローしたリモート `subscribe` コールバックの呼び出し回数。                                                                         |

### エンコーディングユーティリティとスナップショット差分

| エクスポート                      | 目的                                                  |
| --------------------------------- | ----------------------------------------------------- |
| `encodeIR(ir)` / `decodeIR(json)` | スナップショット payload に使用される安定した JSON エンコーディング。      |
| `hashIR(encoded)`                 | `SnapshotMeta.pageIRHash` が使用するコンテンツハッシュ。       |
| `diffSnapshots(prev, next)`       | 2 つの `PageIR` 値間の構造的なノード単位の差分。 |

### プレゼンス検証

| エクスポート                                                                            | 目的                                                                                    |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `sanitizeDisplayName(value)`                                                            | `U+0000`–`U+001F` / `U+007F` を除去し、`MAX_DISPLAY_NAME_LENGTH`（64 文字）に切り詰めます。 |
| `validatePeerInfo(value)`                                                               | 厳格な検証。カラーは許可リストに一致する必要があり、拒否はピアレコード全体を破棄します。 |
| `validatePresenceState(value)` / `validatePresenceCursor` / `validatePresenceSelection` | アダプターが使用するインバウンドの awareness バリデーター。ホスト側の多層防御のためにエクスポートされています。 |
| `MAX_DISPLAY_NAME_LENGTH`                                                               | `64`。                                                                                      |

### エラー

- `SnapshotCorruptedError`、`SnapshotNotFoundError`、`SnapshotPrunedError` —— `load(id)` からスローされる型付きエラー。
- `DebouncedAdapterDestroyedError` —— `destroy()` の後に `createDebouncedAdapter` インスタンスでメソッドが呼び出されたときにスローされます。

### React ブリッジ

- `usePuckSelection()` —— Puck の選択されたコンポーネントをアウトバウンドの awareness 更新のための `PresenceSelection` にマッピングします。`<Puck>` 内にマウントされたホストコンポーネント内で使用してください。

## 使用例

### インメモリのテストハーネス

```ts
import { Awareness } from "y-protocols/awareness";
import { Doc as YDoc } from "yjs";
import { createYjsAdapter } from "@anvilkit/plugin-collab-yjs";

const doc = new YDoc();
const awareness = new Awareness(doc);
const adapter = createYjsAdapter({
  doc,
  awareness,
  peer: { id: "test-user", displayName: "Test" },
});

// In tests, the adapter starts in `connecting` and flips to `synced`
// on the first subscribe() registration, so no transport plumbing is
// needed for unit tests.
adapter.subscribe((ir) => {
  console.log("emitted IR", ir);
});
```

### ホスト駆動の接続状態

```ts
import type { ConnectionSource } from "@anvilkit/plugin-collab-yjs";
import { WebsocketProvider } from "y-websocket";

let queuedEdits = 0;

const connectionSource: ConnectionSource = (emit) => {
  const onStatus = (e: { status: string }) => {
    if (e.status === "connected") emit({ kind: "connecting" });
    if (e.status === "disconnected") {
      emit({
        kind: "offline",
        since: new Date().toISOString(),
        queuedEdits,
      });
    }
  };
  const onSync = (synced: boolean) => {
    if (synced) emit({ kind: "synced", since: new Date().toISOString() });
  };
  provider.on("status", onStatus);
  provider.on("sync", onSync);
  return () => {
    provider.off("status", onStatus);
    provider.off("sync", onSync);
  };
};

createYjsAdapter({ doc, awareness, connectionSource });
```

### 強制再同期フロー

```ts
const forceResync = async () => {
  const restored = await adapter.forceResync();
  if (restored === null) {
    toast.warn("No snapshot to restore from.");
    return;
  }
  toast.success("Reloaded the latest collaborative snapshot.");
};
```

### ポリシー + 検証フック

```ts
import type {
  CollabPolicy,
  ValidateRemoteIR,
} from "@anvilkit/plugin-collab-yjs";

const policy: CollabPolicy = {
  canEdit: (node, peer) => {
    if (node.props?.locked === true) return peer.id === node.props.lockedBy;
    return true;
  },
};

const validateRemoteIR: ValidateRemoteIR = (ir) => {
  if (!ir.root || typeof ir.root !== "object") return null;
  if (ir.version !== "1") return null;
  return ir;
};

createCollabDataPlugin({
  adapter,
  puckConfig,
  localPeer,
  policy,
  validateRemoteIR,
  onPolicyViolation: (v) => telemetry.warn("policy-violation", v),
  onValidationFailure: (f) => telemetry.warn("validation-failure", f),
});
```

## 備考と FAQ

### ネイティブツリー vs レガシー JSON-blob

ネイティブツリー（`useNativeTree: true`、デフォルト）は、ライブの `PageIR` をフラットアドレス指定の `Y.Map` ツリーとしてミラーリングします——ノードごとに 1 つの `Y.Map`、加えて親ごとに 1 つの `childIds` `Y.Array`。同一ノードへの編集は依然としてキー単位の LWW にフォールバックしますが、異なるノードへの編集はクリーンにマージされます。

単一の `pageIR` キーの下にある、レガシーな全文書 JSON-blob エンコーディングはフォールバックとして保持されます。`save()` は両方の表現を書き込むため、ツリー対応のアダプターと blob 対応のアダプターは同じスナップショットを読めます。**1 つの `Y.Doc` 内でエンコーディングを混在させることはできません**——ルームごとに 1 つのモードを選んでください。

**マイグレーションは自動です。** レガシー blob のみを持ち（ネイティブツリー状態を持たない）`Y.Doc` 上で構築されたアダプターは、構築時に blob からツリーをハイドレートします。このマイグレーションは 1 回限りで、トランザクショナルかつ冪等です——後続のアダプターはショートサーキットします。`0.10` より前のバージョンからアップグレードするホストは、別個のマイグレーション手順なしで新しいアダプターをロールアウトできます。

### プレゼンスは信頼できない入力である

アダプターはすべてのインバウンドの `PresenceState` を `validatePresenceState` を通じて検証します。具体的な 2 つの強化があります：

- **`color` 許可リスト。** `#rgb` / `#rrggbb` / `#rrggbbaa`、`rgb(...)`、`rgba(...)`、または名前付きカラーのセットに一致しないものはすべて拒否されます——`javascript:`、`expression(...)`、`<script>`、任意の文字列を含みます。拒否はピアレコード全体を破棄するため、悪意あるピアは安全な部分だけを含む payload を密輸入することはできません。
- **`displayName` のサニタイズ。** `sanitizeDisplayName` は ASCII 制御文字を除去し、64 文字に切り詰めます。HTML エスケープは**行いません**——UI が `innerHTML` 経由で名前を注入する場合は、レンダリング境界でエスケープしてください。

`MetricsSnapshot.presenceValidationFailures` は拒否されたピアをカウントするため、ホストは個々の payload を検査することなく、ノイズの多いルームや敵対的なルームについてアラートを出せます。

### `createDebouncedAdapter` には `destroy()` が必要

このラッパーは保留中のタイマー参照を保持します。アンマウント時に `destroy()` を呼び出して、保留中のタイマーをキャンセルし、ラップされたアダプターへティアダウンを転送してください。`destroy()` の後に呼び出されたメソッドは `DebouncedAdapterDestroyedError` をスローします。

### 参照トランスポートと本番デプロイ

最小限のリレーがこのリポジトリの `examples/y-websocket-server.mjs` の下にあります（ソースのみで、公開された npm パッケージには含まれません）：

```bash
# Defaults to ws://127.0.0.1:21234
node packages/plugins/plugin-collab-yjs/examples/y-websocket-server.mjs

# Override the port (positional arg or COLLAB_RELAY_PORT), or bind a
# non-loopback host with COLLAB_RELAY_HOST:
node packages/plugins/plugin-collab-yjs/examples/y-websocket-server.mjs 21300
```

このリレーは**デフォルトでポート 21234 をリッスンします**（Windows/WSL2 が予約しているため 1234 と 11234 は回避されています）。`y-websocket@3` がバンドルされたサーバー（`y-websocket/bin/utils`）を削除し、`@y/websocket-server` は互換性のない `yjs-14` 系列を対象としているため、このリレーは**`yjs-13` スタックに対してクラシックな `y-protocols` の同期/awareness サーバーをインラインでベンダリングしています**——デモの `y-websocket@3` クライアントとワイヤ互換であり、`y-websocket` のサーバーパッケージングからは独立しています。これはテストとデモのための参照であり、本番サーバーではありません。

本番デプロイ——認証、永続的な Postgres による永続化、[Hocuspocus](https://tiptap.dev/hocuspocus) による Redis を裏付けとした水平スケールアウト——については、[`docs/hocuspocus-deployment.md`](./docs/hocuspocus-deployment.md) のレシピに従ってください。

### 本番デプロイと認可

認可は**2 層**であり、プラグインは両方を信頼できる情報源として扱います——どちらも他方を置き換えるものではありません：

1. **リレーレベルの認証（誰が接続してよいか）。** websocket のアップグレード自体はリレーによってゲートされます。[Hocuspocus](https://tiptap.dev/hocuspocus) では、これは `onAuthenticate({ token })` フックです——接続を拒否するには例外をスローします（ソケットをクローズします）。トークンはプロバイダーの `token` オプション（または `createManagedTransport({ token })`）を介してクライアントから転送されます。認証付きの `server.mjs` と、それに対応するクライアントの配線については [`docs/hocuspocus-deployment.md`](./docs/hocuspocus-deployment.md) を参照してください。

2. **アプリケーションレベルの認可（誰が何を編集してよいか）。** ノード単位の編集権限は、[`policy.canEdit(node, peer)`](#policy--validation-hooks) フックを通じて**クライアント側で対称的に**強制されます——すべての `save()` の前にアウトバウンドで、`validateRemoteIR` の後にインバウンドで。拒否は変更を破棄し、`onPolicyViolation` を発火します。クライアントをバイパスするピアが認可されていない更新をポリシーをすり抜けて密輸入できないよう、リレーの `onChange` フック（サーバー側の多層防御）でも同じチェックをミラーリングしてください。

**リレーの認証失敗は、第一級の、区別可能な接続エラーです。** マネージドトランスポートの Hocuspocus プロバイダーが `authenticationFailed` を発行すると、それは型付きの `ConnectionStatus` として表面化します：

```ts
import type { ConnectionStatus } from "@anvilkit/plugin-collab-yjs";

function onStatus(status: ConnectionStatus) {
  if (status.kind === "error" && status.reason === "auth") {
    // Non-recoverable without new credentials (status.recoverable === false).
    // Prompt re-authentication rather than a blind retry.
    promptReauth();
  }
}
```

`error` バリアントは、オプションの `reason: "auth" | "transport"` 判別子を持ちます（存在しない場合 ⇒ `"transport"`）。認証失敗（`reason: "auth"`）は `recoverable: false` で発行されるため、ホストは一時的な再接続インジケーターを表示する代わりに、新しい認証情報を求めるプロンプトを表示できます。それ以外のすべての接続レベルの障害は `reason: "transport"` のままです。生の `HocuspocusProvider` に対して独自の `connectionSource` を構築するホストは、その `authenticationFailed` イベントを `{ kind: "error", reason: "auth", recoverable: false }` にマッピングすることで同じ UX を得られます——[`docs/hocuspocus-deployment.md`](./docs/hocuspocus-deployment.md) のクライアント配線の例を参照してください。

### パフォーマンス特性

- **リモート編集——インクリメンタル。** リモートのプロップ編集は、触れられたノードのみを再読み込みします。並べ替え/挿入/削除は構造化されたリリンクデルタを発行するため、ライブ IR キャッシュは影響を受けた親 + 追加されたノードのみをリリンクし、触れられていないすべてのノードのすでに解析済みのプロップを再利用します。本物の全文書変更は依然として完全なガード付き再構築にフォールバックします——これは正確性のバックストップです。
- **ローカル `save()`——O(変更分) の適用、O(文書) の下限。** Y.Doc の適用は変更/追加されたノードのみを書き込み、削除されたノードを削除します。残余の O(文書) コストは、保存のたびに書き込まれる `encodeIR(ir)` スナップショット payload 文字列です。`SnapshotMeta.pageIRHash` はその `hashIR(encodeIR(ir))` の定義を維持します。
- **残余の末尾コスト。** 保存ごとのスナップショット meta の再スキャンは O(`maxSnapshots`)、アクティブなタイピング中にインターリーブされたリモートバーストのもとでの保留中インデックスの再構築は O(文書)、`onConflict` リスナーがアタッチされている場合のリモートフラッシュごとの競合オーバーラップは O(文書)、そして数千の子を持つ親に対する幅広い子リストの調整は O(n²) です。すべて `pnpm bench:collab-highload` によってゲートされています。

予算ガイダンス：デフォルトの `maxSnapshots` のもとで、最大で数千ノードのページは余裕をもってフレーム予算内に収まります。

### タブ間の永続化はオプトイン

`persistence.indexedDb` と `persistence.broadcastChannel` はどちらもデフォルトで `false` です。有効にすると、各バックエンドは構築時に機能検出を行い、その API が利用できない場合（SSR、古いブラウザ、特定のテストランナー）は静かにデグレードします。クォータやスキーマの障害について知るには `persistence.onFault` を使用してください——アダプターが永続化から `Y.Doc` オブザーバーチェーンへ例外をスローすることは決してありません。

### サーバーグレードのスナップショット永続化はプラグイン可能

スナップショットレベルの永続化（`Y.Doc` 内の境界のある `maxSnapshots` ウィンドウよりも長く存続する、永続的な完全状態ダンプ——高速なタブブートストラップやサーバー側の履歴ストアのため）は、組み込みのバックエンドではなく、**オプションのインジェクションポイント** です。`createYjsAdapter` に `snapshotPersistence: { adapter }` を渡します。ここで `adapter` は `SnapshotPersistenceAdapter` インターフェースを実装します：

```ts
import {
  createYjsAdapter,
  type SnapshotPersistenceAdapter,
} from "@anvilkit/plugin-collab-yjs";

const backend: SnapshotPersistenceAdapter = {
  saveSnapshot: (meta, payload) => db.put(meta.id, { meta, payload }),
  loadSnapshot: (id) => db.get(id).then((r) => r?.payload),
  listSnapshots: () => db.all(),
  deleteSnapshot: (id) => db.delete(id),
};

const adapter = createYjsAdapter({
  doc,
  snapshotPersistence: {
    adapter: backend,
    // Encryption-at-rest seam — supply a real cipher pair. `decode(encode(x)) === x`.
    encode: (payload) => cipher.encrypt(payload),
    decode: (payload) => cipher.decrypt(payload),
    onFault: (op, err) => telemetry.warn("snapshot-persistence", { op, err }),
  },
});

// Hydrate the durable, full-state snapshot independently of the bounded in-Y.Doc window:
const ir = await adapter.loadPersistedSnapshot(id);
```

`Y.Doc` 内のスナップショットストアは依然として**信頼できる情報源かつデフォルト**です——`snapshotPersistence` を指定すると、各 `save()`（自己完結型の payload + `SnapshotMeta`）と各明示的な `delete()` をバックエンドに*ミラーリングする*だけです。ミラーリングはベストエフォートです：バックエンドのスロー/リジェクトは `onFault` を通じて表面化し、`Y.Doc` 内の書き込みをブロックしたり拒否したりすることは決してありません。保持の退避（`maxSnapshots`）は意図的に**ミラーリングされません**。そのため、永続ストアは CRDT が刈り取った履歴を保持できます。`encode`/`decode` のペアは、文書化された**保存時暗号化**のシーム（アダプター自身は暗号機能を一切搭載していません）です。

クロスオリジン / iframe の永続化は明示的にスコープ外です——`BroadcastChannel` は同一オリジンであり、それがエディターにとって正しい境界です。

### 関連項目

- Anvilkit ドキュメントサイト上の `realtime-collab` アーキテクチャドキュメント——完全な設計と脅威モデル。
- [CHANGELOG.md](./CHANGELOG.md) —— リリースごとのノート。
- [`@anvilkit/collab-ui`](../plugin-collab-ui/README.md) —— React 表示レイヤー + 統合された `createCollabPlugin` ファクトリ。
