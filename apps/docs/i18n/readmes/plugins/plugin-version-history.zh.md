# @anvilkit/plugin-version-history

> **Alpha（`0.1.7`）。** 顶栏操作以及 diff/apply 引擎已稳定。该插件还可以通过受支持的 `ctx.registerHistoryPanel` 插槽贡献 StudioSidebar 的 `history` 面板 —— 传入 `renderPanel` 选项（参见[侧边栏历史面板](#sidebar-history-panel)）。

Anvilkit Studio 的无界面版本历史插件。快照持久化被委托给宿主提供的 `SnapshotAdapter`，因此插件本身不附带任何 I/O —— 只有 diff/apply 引擎、顶栏操作、可选的 UI 基元，以及用于测试和演示的参考适配器。

## 安装

```bash
pnpm add @anvilkit/plugin-version-history react react-dom @puckeditor/core
```

非可选对等依赖：`react >=19.0.0`、`react-dom >=19.0.0`、`@puckeditor/core ^0.22.0`。无传输层或存储依赖 —— 宿主端到端地掌控持久化。

子路径导入：

- `@anvilkit/plugin-version-history` —— 主入口：插件工厂函数、参考适配器、diff/apply 引擎、类型。
- `@anvilkit/plugin-version-history/ui` —— 可选的 React 组件（`VersionHistoryUI`、`SaveSnapshotButton`、`SnapshotList`、`SnapshotHistoryModal`、`DiffView`）。
- `@anvilkit/plugin-version-history/testing` —— `runAdapterContract` 共享测试套件。

## 快速开始

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

该插件贡献两个顶栏操作（`version-history:save` 和 `version-history:open`），并在 Studio 事件总线上发出 `version-history:save-requested` / `version-history:open-requested`。宿主通过挂载一个 UI 界面（例如来自 `/ui` 子路径的 `<SnapshotHistoryModal>`）来处理 open 事件。

## 核心特性

- **适配器驱动的持久化** —— 插件定义契约；宿主实现 `save` / `list` / `load` / `delete?`（外加可选的 `deleteMany?` / `exportAll?` / `importAll?`，用于批量清理与可移植性），并完全掌控存储（内存、localStorage、Firestore、S3，……）。
- **确定性 diff/apply 引擎** —— `diffIR(a, b)` 产生一个冻结的 `IRDiff`；`applyDiff(a, diff)` 可以往返还原。
- **可选 UI** —— `/ui` 上提供五个组件，供希望获得开箱即用版本历史的宿主使用。默认导出不会导入它们中的任何一个，因此无界面消费者无需为 UI 渲染付出任何成本。
- **FIFO 淘汰** —— 当达到容量上限时，`maxSnapshots` 会自动删除最旧的快照（需要 `adapter.delete`）。
- **参考适配器** —— `inMemoryAdapter()` 用于测试，`localStorageAdapter({ namespace })` 用于演示。
- **适配器测试套件** —— `runAdapterContract` 与参考适配器使用的契约相同；消费者可以据此校验自己的实现。
- **打包预算** —— 通过 `scripts/check-bundle-budget.mjs` 在 CI 中强制执行约 10 KB gzipped 的入口块预算。

## API 参考

### 工厂函数

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

返回一个带类型的 `StudioPlugin`，携带 `VersionHistoryContribution` 能力（这样下游消费者就能通过 `InferPluginContributions` 恢复 `adapter` / `snapshots`）。

### 侧边栏历史面板

传入 `renderPanel` 即可贡献 StudioSidebar 的 `history` 模块主体。该插件会在 `register()` 期间，通过 core 受支持的、可渲染的 `ctx.registerHistoryPanel` 插槽注册一个 `StudioHistoryPanel`；这会让 `history` 侧轨标签出现（`SidebarRail` 以 `historyPanel !== null` 作为门控条件），并通过 core 的 `HistoryModule` 在面板内渲染你的 thunk。运行时会在 `<Studio>` 卸载时自动拆除该注册。省略 `renderPanel` 则保持此前仅有顶栏操作的行为 —— 没有侧边栏面板，也没有侧轨标签。

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

宿主拥有 `currentIR` 的读取与 `onRestore` 的派发：插件子模块可能在运行时解析出它自己的 `@puckeditor/core` 副本（双 Puck 隐患），因此读取响应式 Puck 状态必须发生在宿主的 React/Puck 上下文中。`currentIR` 通常来自针对宿主响应式 Puck 数据调用的 `puckDataToIR(data, puckConfig)`（`@anvilkit/ir`）。

### `SnapshotAdapter` 契约

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

| 方法              | 必需？    | 用途                                                                       |
| ----------------- | --------- | ------------------------------------------------------------------------- |
| `save(ir, meta)`  | 是        | 持久化一个 `PageIR`。返回唯一的快照 id。                                    |
| `list()`          | 是        | 按顺序返回所有快照（按约定最新优先）。                                       |
| `load(id)`        | 是        | 按 id 水合。未命中时抛出 `VersionHistoryError("SNAPSHOT_NOT_FOUND")`。      |
| `delete(id)`      | 可选      | 设置了 `maxSnapshots` 时必需。                                              |
| `deleteMany(ids)` | 可选      | 供管理端清理的批量删除；保持其余快照仍可加载。                               |
| `exportAll()`     | 可选      | 将所有快照物化为可移植的 `VersionHistoryExport` 归档。                       |
| `importAll(data)` | 可选      | 从 `VersionHistoryExport` 恢复（默认 `"merge"`，或 `"replace"`）。          |
| `updateMeta(id, patch)` | 可选 | 就地修补快照的可变元数据（`SnapshotMetaPatch`）；未命中时抛出 `SNAPSHOT_NOT_FOUND`。 |
| `subscribe(cb)`   | 可选      | 从协作适配器（例如 `createYjsAdapter`）推送更新。                            |
| `presence`        | 可选      | 多用户光标 / 选择通道。由 Yjs 适配器实现。                                   |

所有方法既可同步也可异步（`MaybePromise<T>`）。建议返回冻结的、结构相等的结果。

#### 批量删除与可移植性

`deleteMany`、`exportAll` 和 `importAll` 是增量式的、可选的，并且向后兼容 ——
省略它们的适配器不受影响，调用方必须对其进行特性检测。内存与
`localStorage` 参考适配器实现了这三者；顶栏的 `maxSnapshots`
保留路径在 `deleteMany` 存在时会自动优先使用它。

```ts
const archive = await adapter.exportAll?.(); // { version: 1; snapshots: [{ meta, ir }] }

// Round-trips into a fresh adapter: imported snapshots keep their original
// ids/metadata and are stored as standalone keyframes, so each is loadable.
await fresh.importAll?.(archive, { mode: "replace" }); // or "merge" (default)
```

`exportAll` 会从内部 delta 链重建每个快照的**完整** `PageIR`，因此该归档是
自包含且可 JSON 序列化的（它*不是* delta 链的线缆格式）。
`normalizeVersionHistoryExport(value)` 是适配器所使用的、已导出且无副作用的
校验器，它会在任何变更之前以 `STORAGE_CORRUPT` 的 `VersionHistoryError`
拒绝格式错误的归档 —— 可直接调用它来校验手工构建或第三方的归档。

#### 协作：`subscribe` 与 `presence`（宿主拥有）

`subscribe` 和 `presence` 是**可选的，并且由宿主 / 协作适配器拥有 ——
它们不由捆绑的参考适配器提供。**内存与 `localStorage` 参考适配器是
单用户的，并且有意不实现两者中的任何一个（`types.contract.test.ts`
套件断言它们在这两个适配器上均为 `undefined`），因此调用方在使用之前必须对其进行特性检测。

真正的实现存在于协作传输层中 —— 例如 Yjs 适配器
`@anvilkit/plugin-collab-yjs`（`YjsSnapshotAdapter`），它在此契约之上叠加了
`subscribe`（远程变更推送）与 `presence`（实时光标 / 选择）。当存在时：

- `subscribe(onUpdate)` 在某个远程对等方变更共享文档时触发
  `onUpdate(ir, peer?)`，并返回一个 `Unsubscribe`，调用它即可停止
  接收更新（幂等）。
- `presence` 暴露 `update(state)` 以发布本地对等方，并暴露
  `onPeerChange(cb)` 以观察远程名册（参见 `SnapshotAdapterPresence`）。

如果你正在编写自己的协作适配器，请实现这两个成员；
如果你只需要单用户持久化，则省略它们，插件会降级为
无实时同步的顶栏操作快照。

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

`delta` 是可选的。选择启用的适配器（`createYjsAdapter({ computeDelta: true })`）会用相对于上一快照的结构性 diff 来填充它；较旧或较简单的适配器则会省略它。

身份 / 来源字段（`id`、`savedAt`、`pageIRHash`、`delta`）是不可变的 —— 它们描述了*捕获了什么*以及*何时*捕获，并且在快照写入后永不改变。其余的是宿主精选的元数据，每个字段都是可选的且向后兼容（在某个字段存在之前写入的记录只会省略它）：

- `label` —— 在历史列表中显示的简短、人类可读的名称。
- `tags` —— 用于分组、过滤和搜索的标签（例如 `["release", "qa"]`）。
- `milestone` —— 标记一个具名检查点，使其在历史 UI 中醒目地呈现，以区别于普通的自动保存。
- `protected` —— 使该快照免于自动保留清理：无论存在时长或数量压力如何，`planRetention` 都永远不会把一个受保护的快照放入其删除计划。
- `author` —— 用于审计跟踪的不透明操作者归属（用户 id、邮箱或显示名）；本包永不解析它。
- `notes` —— 自由格式的、比简短的 `label` 更长的上下文。

在保存时通过 `save(ir, meta)` 设置这些字段，或之后用 `adapter.updateMeta?.(id, patch)` 修订它们。patch 类型是 `SnapshotMetaPatch` —— 恰好是这个可变子集（`label` / `tags` / `milestone` / `protected` / `author` / `notes`）；省略的字段保持不变，且身份字段无法被修补。

### Diff 引擎

| 导出             | 签名                                  | 用途                                                                     |
| ---------------- | ------------------------------------- | ------------------------------------------------------------------------ |
| `diffIR`         | `(a: PageIR, b: PageIR) => IRDiff`    | 计算一个确定性的、冻结的 diff。                                            |
| `applyDiff`      | `(a: PageIR, diff: IRDiff) => PageIR` | 应用一个 diff。`applyDiff(a, diffIR(a, b))` 与 `b` 结构相等。              |
| `summarizeDiff`  | `(diff: IRDiff) => IRDiffSummary`     | `{ added, removed, moved, changed, metaChanged?, description }`。         |
| `DiffApplyError` | `class extends Error`                 | 当 `applyDiff` 无法将 diff 与输入 IR 协调时抛出。                          |

### `IRDiffOp`（可辨识联合类型）

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

### 参考适配器

| 适配器                               | 使用场景                | 备注                                                                                                                                                                                                                                                                          |
| ------------------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `inMemoryAdapter()`                  | 测试                    | 深度冻结存储的 IR；重新加载时丢失数据。                                                                                                                                                                                                                                        |
| `localStorageAdapter({ namespace })` | 演示、单用户 SPA        | 存储键：`<namespace>:snapshots:<id>`（负载）、`<namespace>:snapshots:index`（元数据数组）。使用 delta 链编码以适配约 5–10 MB 的配额。会抛出 `VersionHistoryError`，code 为 `STORAGE_UNAVAILABLE`、`STORAGE_CORRUPT`、`STORAGE_QUOTA_EXCEEDED` 之一。 |

### 错误

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

远程和协作适配器会通过抛出 `PERMISSION_DENIED` 错误来拒绝未授权的 `save`/`load`/`list`/`delete`/`restore` 调用。使用便捷构造器 `createPermissionDeniedError(operation, detail?)`，或直接抛出 `new VersionHistoryError("PERMISSION_DENIED", message)`：

```ts
import { createPermissionDeniedError } from "@anvilkit/plugin-version-history";

async function load(id: string) {
  if (!viewer.canRead(roomId)) {
    throw createPermissionDeniedError("load", `viewer ${viewer.id} lacks read access`);
  }
  // …
}
```

### 可选 UI（`./ui`）

| 组件                   | 关键 props                                              |
| ---------------------- | ------------------------------------------------------- |
| `VersionHistoryUI`     | `{ adapter, currentIR, onRestore }`                     |
| `SaveSnapshotButton`   | `{ adapter, currentIR, getLabel? }`                     |
| `SnapshotList`         | `{ snapshots, onSelect, currentId? }`                   |
| `SnapshotHistoryModal` | `{ open, onOpenChange, adapter, currentIR, onRestore }` |
| `DiffView`             | `{ diff, before?, after? }`                             |

`/ui` 子路径是一个独立的入口点 —— 从它导入不会触发包的其余部分。默认插件导出不引用这些组件。

### 测试（`./testing`）

```ts
runAdapterContract(
  adapterFactory: () => SnapshotAdapter,
  hooks: { describe; expect; it },
): void;
```

传入你的测试运行器的基元，即可注入该套件而无需将包耦合到特定框架。

## 使用示例

### 用于单用户 SPA 的 LocalStorage 适配器

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

### 自定义 Firestore 适配器

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

### 校验自定义适配器

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

### 渲染 diff 视图

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

## 备注与 FAQ

### 存储被有意设计为可插拔

插件从不直接读取 `localStorage`、IndexedDB 或任何后端。适配器是唯一的持久化边界 —— 如果你需要会话共享、多租户或符合审计要求的存储，编写一个适配器并保持在带类型的契约之内。

### `move-node` 仅供参考

`applyDiff` 会校验 `move-node` 操作，但**不会**仅凭它们执行重新挂载父节点。受影响父节点上的 `change-children` 才是权威的重新挂载/重新排序信号。出于显示或日志目的检查 `IRDiff` 的消费者可以将 `move-node` 用于呈现；不要依赖它来保证重放的正确性。

### `maxSnapshots` 需要 `delete`

当快照数量将超过上限时，FIFO 淘汰路径会移除最旧的快照 —— 优先使用 `adapter.deleteMany(ids)`（单次存储变更），并回退到逐 id 的 `adapter.delete(oldestId)`。同时省略 `deleteMany` 和 `delete` 的适配器无法满足 `maxSnapshots`；要么实现其中之一，要么省略 `maxSnapshots`。

### 打包预算

已发布的入口块有一个约 10 KB gzipped 预算，由 `scripts/check-bundle-budget.mjs` 在 CI 中强制执行，并辅以针对 `dist/index.js` 的 `.size-limit.json` 预算。工作区依赖（`@anvilkit/*`）和对等依赖（`react`、`react-dom`、`@puckeditor/core`）被视为外部依赖。

### 可选 UI 在设计上需要主动启用

从 `@anvilkit/plugin-version-history` 导入永远不会拉入 `/ui` 组件 —— 它们位于一个独立的入口。这使得无界面消费者（一个只想要快照和审计历史、但自带 UI 的 CMS）保持在已发布的打包预算之内。

### 推荐对适配器进行冻结

参考适配器会深度冻结存储的 IR，以尽早捕获意外的变更。自定义适配器不强制要求冻结，但这样做可以消除一类“历史快照在保存后被修改”的 bug，这类 bug 否则很容易被忽视。

### 跨插件类型

`SnapshotAdapter`、`PeerInfo`、`PresenceState` 等在此处作为唯一可信来源被重新导出 —— `@anvilkit/plugin-collab-yjs` 通过 `YjsSnapshotAdapter` 扩展 `SnapshotAdapter`，以添加冲突 / 状态 / 指标界面。在为这两个插件编写共享抽象时，请使用本包的类型。
