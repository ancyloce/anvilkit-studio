# @anvilkit/plugin-version-history

> **Alpha（`0.1.7`）。** ヘッダーアクションと diff/apply エンジンは安定しています。このプラグインは、サポートされている `ctx.registerHistoryPanel` スロットを通じて StudioSidebar の `history` パネルを貢献することもできます —— `renderPanel` オプションを渡してください（[サイドバー履歴パネル](#sidebar-history-panel)を参照）。

Anvilkit Studio 向けのヘッドレスなバージョン履歴プラグイン。スナップショットの永続化はホストが提供する `SnapshotAdapter` に委譲されるため、プラグイン自体は I/O を一切同梱しません —— diff/apply エンジン、ヘッダーアクション、オプションの UI プリミティブ、テストとデモ用の参照アダプターのみです。

## インストール

```bash
pnpm add @anvilkit/plugin-version-history react react-dom @puckeditor/core
```

非オプションの peer：`react >=19.0.0`、`react-dom >=19.0.0`、`@puckeditor/core ^0.22.0`。トランスポートやストレージの依存関係はありません —— ホストが永続化をエンドツーエンドで所有します。

サブパスインポート：

- `@anvilkit/plugin-version-history` —— メインエントリ：プラグインファクトリ、参照アダプター、diff/apply エンジン、型。
- `@anvilkit/plugin-version-history/ui` —— オプションの React コンポーネント（`VersionHistoryUI`、`SaveSnapshotButton`、`SnapshotList`、`SnapshotHistoryModal`、`DiffView`）。
- `@anvilkit/plugin-version-history/testing` —— `runAdapterContract` 共有テストスイート。

## クイックスタート

```ts
import {
  createVersionHistoryPlugin,
  localStorageAdapter,
} from "@anvilkit/plugin-version-history";

const plugin = createVersionHistoryPlugin({
  adapter: localStorageAdapter({ namespace: "my-app-history" }),
  maxSnapshots: 50,
});

// Pass `plugin` alongside other Studio plugins.
```

このプラグインは 2 つのヘッダーアクション（`version-history:save` と `version-history:open`）を提供し、Studio イベントバス上で `version-history:save-requested` / `version-history:open-requested` を発行します。ホストは UI サーフェス（例：`/ui` サブパスの `<SnapshotHistoryModal>`）をマウントすることで open イベントを処理します。

## コア機能

- **アダプター駆動の永続化** —— プラグインが契約を定義し、ホストが `save` / `list` / `load` / `delete?`（加えて、バッチクリーンアップとポータビリティのためのオプションの `deleteMany?` / `exportAll?` / `importAll?`）を実装してストレージ（インメモリ、localStorage、Firestore、S3、……）を完全に制御します。
- **決定論的な diff/apply エンジン** —— `diffIR(a, b)` は凍結された `IRDiff` を生成し、`applyDiff(a, diff)` はラウンドトリップします。
- **オプションの UI** —— バッテリー同梱のバージョン履歴を望むホストのために `/ui` に 5 つのコンポーネントを用意。デフォルトエクスポートはそれらを一切インポートしないため、ヘッドレスな利用者は UI レンダリングのコストを負担しません。
- **FIFO エビクション** —— 容量に達すると `maxSnapshots` が最も古いスナップショットを自動的に削除します（`adapter.delete` が必要）。
- **参照アダプター** —— テスト用の `inMemoryAdapter()`、デモ用の `localStorageAdapter({ namespace })`。
- **アダプターテストスイート** —— `runAdapterContract` は参照アダプターが使用するのと同じ契約です。利用者は自身の実装をこれに対して検証できます。
- **バンドルバジェット** —— `scripts/check-bundle-budget.mjs` により CI で約 10 KB gzipped のエントリチャンクを強制します。

## API リファレンス

### ファクトリ

```ts
function createVersionHistoryPlugin(
  options: CreateVersionHistoryPluginOptions,
): StudioPlugin;

interface CreateVersionHistoryPluginOptions {
  readonly adapter: SnapshotAdapter;
  readonly maxSnapshots?: number;
  /** Puck `Data` → `PageIR` bridge so "Save snapshot" works in a real `<Studio>` session. */
  readonly buildIR?: (data: unknown) => PageIR | null | Promise<PageIR | null>;
  /** Render the StudioSidebar `history` panel body — see below. */
  readonly renderPanel?: () => ReactNode;
}
```

`VersionHistoryContribution` 能力を持つ型付きの `StudioPlugin` を返します（これにより下流の利用者は `InferPluginContributions` 経由で `adapter` / `snapshots` を回収できます）。

### サイドバー履歴パネル

`renderPanel` を渡して、StudioSidebar の `history` モジュール本体を貢献します。プラグインは `register()` の間に、コアのサポートされレンダリングされる `ctx.registerHistoryPanel` スロットを通じて `StudioHistoryPanel` を登録します。これにより `history` レールタブが表示され（`SidebarRail` は `historyPanel !== null` を条件にゲートします）、コアの `HistoryModule` を介してパネル内であなたのサンク（thunk）をレンダリングします。ランタイムは `<Studio>` のアンマウント時に登録を自動的に破棄します。`renderPanel` を省略すると、従来のヘッダーアクションのみの動作が維持されます —— サイドバーパネルなし、レールタブなしです。

```tsx
import { createVersionHistoryPlugin } from "@anvilkit/plugin-version-history";
import { VersionHistoryUI } from "@anvilkit/plugin-version-history/ui";

const plugin = createVersionHistoryPlugin({
  adapter,
  renderPanel: () => (
    <VersionHistoryUI
      adapter={adapter}
      currentIR={currentIR}
      onRestore={(ir) => puckApi.dispatch({ type: "setData", data: irToPuckData(ir) })}
    />
  ),
});
```

ホストは `currentIR` の読み取りと `onRestore` のディスパッチを所有します：プラグインのサブモジュールは実行時に独自の `@puckeditor/core` のコピーを解決する可能性があるため（dual-puck の危険性）、リアクティブな Puck の状態の読み取りはホストの React / Puck コンテキスト内で行う必要があります。`currentIR` は通常、ホストのリアクティブな Puck データに対する `puckDataToIR(data, puckConfig)`（`@anvilkit/ir`）から得られます。

### `SnapshotAdapter` 契約

```ts
interface SnapshotAdapter {
  save(
    ir: PageIR,
    meta: Partial<Omit<SnapshotMeta, "id" | "savedAt">>,
  ): MaybePromise<string>;
  list(): MaybePromise<readonly SnapshotMeta[]>;
  load(id: string): MaybePromise<PageIR>;
  delete?(id: string): MaybePromise<void>;
  deleteMany?(ids: readonly string[]): MaybePromise<void>;
  exportAll?(): MaybePromise<VersionHistoryExport>;
  importAll?(
    data: VersionHistoryExport,
    options?: { mode?: "replace" | "merge" },
  ): MaybePromise<void>;
  updateMeta?(id: string, patch: SnapshotMetaPatch): MaybePromise<void>;
  subscribe?(onUpdate: (ir: PageIR, peer?: PeerInfo) => void): Unsubscribe;
  presence?: SnapshotAdapterPresence;
}
```

| メソッド          | 必須？     | 目的                                                                            |
| ----------------- | ---------- | ------------------------------------------------------------------------------- |
| `save(ir, meta)`  | はい       | `PageIR` を永続化する。一意のスナップショット id を返す。                        |
| `list()`          | はい       | すべてのスナップショットを順序付きで返す（慣例として新しい順）。                 |
| `load(id)`        | はい       | id で水和する。ミス時には `VersionHistoryError("SNAPSHOT_NOT_FOUND")` を投げる。 |
| `delete(id)`      | オプション | `maxSnapshots` を設定する場合は必須。                                            |
| `deleteMany(ids)` | オプション | 管理者によるクリーンアップ用のバッチ削除。残りのスナップショットはロード可能なまま保たれる。 |
| `exportAll()`     | オプション | すべてのスナップショットをポータブルな `VersionHistoryExport` アーカイブとして実体化する。 |
| `importAll(data)` | オプション | `VersionHistoryExport` から復元する（既定は `"merge"`、または `"replace"`）。   |
| `updateMeta(id, patch)` | オプション | スナップショットの可変メタデータ（`SnapshotMetaPatch`）をその場でパッチする。ミス時には `SNAPSHOT_NOT_FOUND` を投げる。 |
| `subscribe(cb)`   | オプション | コラボレーションアダプター（例：`createYjsAdapter`）からの更新をプッシュする。   |
| `presence`        | オプション | マルチユーザーのカーソル / 選択チャネル。Yjs アダプターが実装する。              |

すべてのメソッドは同期でも非同期でもかまいません（`MaybePromise<T>`）。凍結された、構造的に等しい結果を返すことが推奨されます。

#### バッチ削除とポータビリティ

`deleteMany`、`exportAll`、`importAll` は追加的で、オプションで、後方互換です —— それらを省略するアダプターは影響を受けず、呼び出し側はそれらをフィーチャー検出する必要があります。インメモリと `localStorage` の参照アダプターは 3 つすべてを実装します。ヘッダーの `maxSnapshots` 保持パスは、`deleteMany` が存在する場合は自動的にそれを優先します。

```ts
const archive = await adapter.exportAll?.(); // { version: 1; snapshots: [{ meta, ir }] }

// Round-trips into a fresh adapter: imported snapshots keep their original
// ids/metadata and are stored as standalone keyframes, so each is loadable.
await fresh.importAll?.(archive, { mode: "replace" }); // or "merge" (default)
```

`exportAll` は各スナップショットの**完全な** `PageIR` を内部のデルタチェーンから再構築するため、アーカイブは自己完結的で JSON シリアライズ可能です（デルタチェーンのワイヤーフォーマットでは*ありません*）。`normalizeVersionHistoryExport(value)` は、アダプターが不正なアーカイブを変更前に `STORAGE_CORRUPT` `VersionHistoryError` で拒否するために使用する、エクスポートされた副作用のないバリデーターです —— 手作りまたはサードパーティのアーカイブを検証するには直接呼び出してください。

#### コラボレーション：`subscribe` と `presence`（ホスト所有）

`subscribe` と `presence` は**オプションで、ホスト / コラボレーションアダプターが所有します —— 同梱の参照アダプターによって提供されるものではありません。** インメモリと `localStorage` の参照アダプターはシングルユーザーであり、意図的にどちらも実装しません（`types.contract.test.ts` スイートは、それらの両方が `undefined` であることをアサートします）。そのため、呼び出し側は使用前にそれらをフィーチャー検出する必要があります。

実際の実装はコラボレーショントランスポートに存在します —— 例えば Yjs アダプター `@anvilkit/plugin-collab-yjs`（`YjsSnapshotAdapter`）は、この契約の上に `subscribe`（リモート変更のプッシュ）と `presence`（ライブカーソル / 選択）を重ねます。存在する場合：

- `subscribe(onUpdate)` は、リモートのピアが共有ドキュメントを変更するたびに `onUpdate(ir, peer?)` を発火し、更新の受信を停止するために呼び出す `Unsubscribe`（冪等）を返します。
- `presence` は、ローカルピアを公開するための `update(state)` と、リモートの名簿を観測するための `onPeerChange(cb)` を公開します（`SnapshotAdapterPresence` を参照）。

独自のコラボレーションアダプターを書く場合は、これら 2 つのメンバーを実装してください。シングルユーザーの永続化だけが必要な場合は、それらを省略すると、プラグインはライブ同期のないヘッダーアクションスナップショットにデグレードします。

### `SnapshotMeta`

```ts
interface SnapshotMeta {
  // Identity / provenance — immutable:
  readonly id: string;
  readonly savedAt: string;
  readonly pageIRHash: string;
  readonly delta?: IRDiff;
  // Host-curated, patchable metadata — all optional, backward compatible:
  readonly label?: string;
  readonly tags?: readonly string[];
  readonly milestone?: boolean;
  readonly protected?: boolean;
  readonly author?: string;
  readonly notes?: string;
}
```

`delta` はオプションです。オプトインしたアダプター（`createYjsAdapter({ computeDelta: true })`）は、前のスナップショットからの構造的な diff でそれを埋めます。古いまたはよりシンプルなアダプターはそれを省略します。

アイデンティティ / 来歴のフィールド（`id`、`savedAt`、`pageIRHash`、`delta`）は不変です —— それらは*何が*、そして*いつ*キャプチャされたかを表し、スナップショットが書き込まれた後は決して変わりません。残りはホストがキュレーションするメタデータで、各フィールドはオプションかつ後方互換です（フィールドが存在する前に書き込まれたレコードは、単にそれを省略します）：

- `label` —— 履歴リストに表示される、短く人間が読める名前。
- `tags` —— グループ化、フィルタリング、検索のためのラベル（例：`["release", "qa"]`）。
- `milestone` —— 通常の自動保存とは異なり、履歴 UI で目立たせるべき名前付きチェックポイントを示す。
- `protected` —— スナップショットを自動的な保持から除外する：`planRetention` は、経過時間や件数の圧力にかかわらず、保護されたスナップショットを削除プランに含めることは決してありません。
- `author` —— 監査証跡のための不透明なアクター帰属（ユーザー id、メール、または表示名）。パッケージによって解析されることはありません。
- `notes` —— 短い `label` よりも長い、自由形式のコンテキスト。

これらは保存時に `save(ir, meta)` を介して設定するか、後で `adapter.updateMeta?.(id, patch)` で修正します。パッチの型は `SnapshotMetaPatch` です —— ちょうどこの可変サブセット（`label` / `tags` / `milestone` / `protected` / `author` / `notes`）であり、省略されたフィールドは変更されないまま残され、アイデンティティのフィールドはパッチできません。

### Diff エンジン

| エクスポート     | シグネチャ                            | 目的                                                                     |
| ---------------- | ------------------------------------- | ------------------------------------------------------------------------ |
| `diffIR`         | `(a: PageIR, b: PageIR) => IRDiff`    | 決定論的で凍結された diff を計算する。                                     |
| `applyDiff`      | `(a: PageIR, diff: IRDiff) => PageIR` | diff を適用する。`applyDiff(a, diffIR(a, b))` は `b` と構造的に等しい。    |
| `summarizeDiff`  | `(diff: IRDiff) => IRDiffSummary`     | `{ added, removed, moved, changed, metaChanged?, description }`。         |
| `DiffApplyError` | `class extends Error`                 | `applyDiff` が diff を入力 IR と調整できないときに投げられる。             |

### `IRDiffOp`（判別可能なユニオン型）

```ts
type IRDiffOp =
  | { kind: "add-node"; path: string; node: PageIRNode }
  | { kind: "remove-node"; path: string; nodeId: string }
  | { kind: "move-node"; from: string; to: string; nodeId: string }
  | {
      kind: "change-prop";
      path: string;
      key: string;
      before: unknown;
      after: unknown;
    }
  | {
      kind: "change-children";
      path: string;
      before: readonly string[];
      after: readonly string[];
    }
  | {
      kind: "meta-changed";
      path: string;
      key: "locked" | "owner" | "version" | "notes";
      before: unknown;
      after: unknown;
    };
```

### 参照アダプター

| アダプター                           | ユースケース            | 備考                                                                                                                                                                                                                                                                          |
| ------------------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `inMemoryAdapter()`                  | テスト                  | 保存される IR をディープフリーズする。リロードでデータを失う。                                                                                                                                                                                                                 |
| `localStorageAdapter({ namespace })` | デモ、シングルユーザー SPA | ストレージキー：`<namespace>:snapshots:<id>`（ペイロード）、`<namespace>:snapshots:index`（メタデータ配列）。約 5～10 MB のクォータに収めるため delta チェーンエンコーディングを使用する。`STORAGE_UNAVAILABLE`、`STORAGE_CORRUPT`、`STORAGE_QUOTA_EXCEEDED` のいずれかで `VersionHistoryError` を投げる。 |

### エラー

```ts
class VersionHistoryError extends Error {
  readonly code: VersionHistoryErrorCode;
}

type VersionHistoryErrorCode =
  | "CONFLICT" // optimistic-concurrency: doc changed under a planned restore
  | "PERMISSION_DENIED" // host/adapter rejected the op on authorization grounds
  | "SNAPSHOT_NOT_FOUND"
  | "STORAGE_CORRUPT"
  | "STORAGE_QUOTA_EXCEEDED"
  | "STORAGE_UNAVAILABLE";
```

リモートおよびコラボレーションアダプターは、認可されていない `save`/`load`/`list`/`delete`/`restore` の呼び出しを、`PERMISSION_DENIED` エラーを投げることで拒否します。便利なコンストラクター `createPermissionDeniedError(operation, detail?)` を使用するか、`new VersionHistoryError("PERMISSION_DENIED", message)` を直接投げてください：

```ts
import { createPermissionDeniedError } from "@anvilkit/plugin-version-history";

async function load(id: string) {
  if (!viewer.canRead(roomId)) {
    throw createPermissionDeniedError("load", `viewer ${viewer.id} lacks read access`);
  }
  // …
}
```

### オプションの UI（`./ui`）

| コンポーネント         | 主要な props                                            |
| ---------------------- | ------------------------------------------------------- |
| `VersionHistoryUI`     | `{ adapter, currentIR, onRestore }`                     |
| `SaveSnapshotButton`   | `{ adapter, currentIR, getLabel? }`                     |
| `SnapshotList`         | `{ snapshots, onSelect, currentId? }`                   |
| `SnapshotHistoryModal` | `{ open, onOpenChange, adapter, currentIR, onRestore }` |
| `DiffView`             | `{ diff, before?, after? }`                             |

`/ui` サブパスは独立したエントリポイントです —— そこからインポートしてもパッケージの残りの部分はトリガーされません。デフォルトのプラグインエクスポートはこれらのコンポーネントを参照しません。

### テスト（`./testing`）

```ts
runAdapterContract(
  adapterFactory: () => SnapshotAdapter,
  hooks: { describe; expect; it },
): void;
```

テストランナーのプリミティブを渡すことで、パッケージを特定のフレームワークに結合させることなくスイートを注入できます。

## 使用例

### シングルユーザー SPA 向けの LocalStorage アダプター

```ts
import {
  createVersionHistoryPlugin,
  localStorageAdapter,
} from "@anvilkit/plugin-version-history";

const versionHistory = createVersionHistoryPlugin({
  adapter: localStorageAdapter({ namespace: "marketing-cms" }),
  maxSnapshots: 100,
});
```

### カスタム Firestore アダプター

```ts
import type {
  PageIR,
  SnapshotAdapter,
  SnapshotMeta,
} from "@anvilkit/plugin-version-history";
import { VersionHistoryError } from "@anvilkit/plugin-version-history";
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  getDocs,
  collection,
  query,
  orderBy,
} from "firebase/firestore";

export function firestoreAdapter(roomId: string): SnapshotAdapter {
  const col = collection(db, "rooms", roomId, "snapshots");
  return {
    async save(ir, meta) {
      const id = crypto.randomUUID();
      const savedAt = new Date().toISOString();
      await setDoc(doc(col, id), { ir, meta: { ...meta, id, savedAt } });
      return id;
    },
    async list() {
      const snaps = await getDocs(query(col, orderBy("meta.savedAt", "desc")));
      return snaps.docs.map((d) => d.data().meta as SnapshotMeta);
    },
    async load(id) {
      const snap = await getDoc(doc(col, id));
      if (!snap.exists()) {
        throw new VersionHistoryError(
          "SNAPSHOT_NOT_FOUND",
          `snapshot ${id} not found`,
        );
      }
      return snap.data().ir as PageIR;
    },
    async delete(id) {
      await deleteDoc(doc(col, id));
    },
  };
}
```

### カスタムアダプターの検証

```ts
import { runAdapterContract } from "@anvilkit/plugin-version-history/testing";
import { describe, expect, it } from "vitest";

import { firestoreAdapter } from "./firestore-adapter.js";

runAdapterContract(() => firestoreAdapter("test-room"), {
  describe,
  expect,
  it,
});
```

### diff ビューのレンダリング

```tsx
import { useEffect, useState } from "react";
import {
  diffIR,
  summarizeDiff,
  type IRDiff,
  type PageIR,
  type SnapshotAdapter,
} from "@anvilkit/plugin-version-history";
import { DiffView } from "@anvilkit/plugin-version-history/ui";

function HistoryEntry({
  adapter,
  fromId,
  toId,
}: {
  adapter: SnapshotAdapter;
  fromId: string;
  toId: string;
}) {
  const [diff, setDiff] = useState<IRDiff | null>(null);

  useEffect(() => {
    Promise.all([adapter.load(fromId), adapter.load(toId)]).then(([a, b]) => {
      setDiff(diffIR(a, b));
    });
  }, [adapter, fromId, toId]);

  if (!diff) return null;
  const summary = summarizeDiff(diff);
  return (
    <div>
      <p>{summary.description}</p>
      <DiffView diff={diff} />
    </div>
  );
}
```

## 備考と FAQ

### ストレージは意図的にプラグイン可能

プラグインは `localStorage`、IndexedDB、あるいはいかなるバックエンドからも直接読み取りません。アダプターが唯一の永続化境界です —— セッション共有、マルチテナント、または監査準拠のストレージが必要な場合は、アダプターを書き、型付きの契約の内側にとどまってください。

### `move-node` は情報提供用

`applyDiff` は `move-node` オペレーションを検証しますが、それらだけでは親の再設定を**実行しません**。影響を受ける親の `change-children` が、権威ある再設定 / 並べ替えのシグナルです。表示やロギングのために `IRDiff` を検査する利用者は `move-node` をプレゼンテーションに使用してかまいませんが、リプレイの正確性をそれに依存しないでください。

### `maxSnapshots` には `delete` が必要

FIFO エビクションパスは、数が上限を超えそうになると最も古いスナップショットを削除します —— `adapter.deleteMany(ids)`（単一のストア変更）を優先し、id ごとの `adapter.delete(oldestId)` にフォールバックします。`deleteMany` と `delete` の両方を省略したアダプターは `maxSnapshots` を満たせません。どちらか一方を実装するか、`maxSnapshots` を省略してください。

### バンドルバジェット

公開されたエントリチャンクには約 10 KB gzipped のバジェットがあり、`scripts/check-bundle-budget.mjs` によって CI で強制されます。加えて `dist/index.js` に対する補完的な `.size-limit.json` のバジェットもあります。ワークスペース依存（`@anvilkit/*`）と peer（`react`、`react-dom`、`@puckeditor/core`）は外部として扱われます。

### オプションの UI は設計上オプトイン

`@anvilkit/plugin-version-history` からのインポートは `/ui` コンポーネントを決して引き込みません —— それらは別のエントリに存在します。これにより、ヘッドレスな利用者（スナップショットと監査履歴だけを望むが自前の UI を同梱する CMS）が公開されたバンドルバジェット内にとどまります。

### アダプターの凍結を推奨

参照アダプターは保存される IR をディープフリーズして、意図しない変更を早期に捕捉します。カスタムアダプターは凍結を要求されませんが、そうすることで「保存後に履歴スナップショットが変更された」という、さもなければ見逃しやすい一連のバグを排除できます。

### プラグイン間の型

`SnapshotAdapter`、`PeerInfo`、`PresenceState` などは、ここで唯一の信頼できる情報源として再エクスポートされています —— `@anvilkit/plugin-collab-yjs` は `SnapshotAdapter` を `YjsSnapshotAdapter` で拡張し、競合 / ステータス / メトリクスのサーフェスを追加します。両方のプラグインにまたがる共有抽象を作成する際には、このパッケージの型を使用してください。
