# @anvilkit/collab-ui

> **候选发布版（`0.1.0-rc.9`）。** 在 `@next` npm 标签上与 `@anvilkit/plugin-collab-yjs` 保持同步。两个包将在 SnapshotAdapter v2 契约冻结后联合发布 GA。

[`@anvilkit/plugin-collab-yjs`](../plugin-collab-yjs/README.md) 的宿主 UI 原语。Yjs 插件是无界面的——它提供 CRDT 层、SnapshotAdapter、在场接线和冲突诊断，但不含 DOM。本包补全了 UI 部分：一个对外暴露实时协作状态的 context provider，以及一组宿主应用可直接放入其编辑器外观（chrome）的 shadcn 风格组件。整合后的 `createCollabPlugin()` 工厂函数将这两个包打包为单个 `StudioPlugin`，以应对常见场景。

## 安装

```bash
pnpm add @anvilkit/collab-ui @anvilkit/plugin-collab-yjs @anvilkit/core react react-dom
```

`react` 和 `react-dom` 是非可选的对等依赖。`@puckeditor/core` 是可选的对等依赖——仅当你为出站同步转发 `puckConfig` 时才需要。`yjs` 和 `y-protocols` 通过 `@anvilkit/plugin-collab-yjs` 间接引入。

**托管模式需要一个 provider。** 要仅凭一个 `websocketUrl` 启用实时协作（见快速开始），请安装对应的 WebSocket provider——两者都是**可选对等依赖**，仅在你实际连接时通过动态 `import()` 加载，因此它们绝不会拖累你的初始 bundle：

```bash
pnpm add @hocuspocus/provider   # default backend (provider: "hocuspocus")
# or
pnpm add y-websocket            # for provider: "y-websocket"
```

如果你设置了 `websocketUrl` 但没有安装 provider，同步指示器会显示一个清晰的 `error` 状态，并触发 `onConnectionError`——绝不会是晦涩的打包器失败。

## 快速开始

只需设置**一个**值——WebSocket URL。`room` 默认为 `"anvilkit-default-room"`，`provider` 默认为 `"hocuspocus"`，`self` 默认为自动生成的匿名身份，插件会掌管整个传输层生命周期（doc + awareness + provider + 状态桥接 + 拆除）：

```tsx
import { Studio } from "@anvilkit/core";
import { createCollabPlugin } from "@anvilkit/collab-ui";

export default function EditorPage() {
  return (
    <Studio
      puckConfig={puckConfig}
      plugins={[
        createCollabPlugin({ websocketUrl: "ws://localhost:1234", puckConfig }),
      ]}
    />
  );
}
```

其他每个字段都是可选的覆盖项：

```tsx
createCollabPlugin({
  websocketUrl: "wss://relay.example.com",
  room: "doc-42",
  provider: "y-websocket",            // override the Hocuspocus default
  token: authToken,
  self: { id: user.id, displayName: user.name, color: user.color },
  puckConfig,
  onConnectionError: (err) => toast.error(String(err)),
});
```

### 自带传输层（BYO）

已经在自行管理 `Y.Doc`、`Awareness` 和 provider？传入 `doc`（以及可选的 `awareness` / `connectionSource`），工厂函数就会将传输层完全交给你——与 `websocketUrl` 之前的调用方完全向后兼容：

```tsx
createCollabPlugin({ doc, awareness, connectionSource, self, puckConfig });
```

当 `doc` 和 `websocketUrl` 同时设置时，`doc`（BYO）胜出，并且会有一次性的开发警告指出被忽略的字段。

捆绑的 `<PresenceLayer>` 和 `<ConflictNoticeCenter>` 会由插件自动挂载——传入 `presence: { enabled: false }` 或 `notifications: { enabled: false }` 即可退出其中任意一个。协作者头像堆叠始终会贡献到核心的 `collaborators` 顶栏插槽。该插槽是单一占用的，遵循先注册者胜出，因此要替换为不同的外观，请注册你自己的、在此之前贡献 `collaborators` 插槽的插件。

## 核心特性

- **一次调用即集成** — `createCollabPlugin()` 返回单个 `StudioPlugin`，它打包了 Yjs 数据同步插件、context provider、在场覆盖层、冲突 toaster 以及协作者头像堆叠。
- **拆分的 context** — 适配器／身份／状态／对等方／对等身份／冲突／光标可见性是各自独立的 provider，因此高频变动的远程光标更新绝不会重新渲染状态药丸（pill）或冲突 toaster。
- **精简选择器的 Hook** — 每个原语只订阅它所读取的那一片切片（`useCollabPeers`、`useCollabStatus`、`useCollabConflictQueue` 等）。
- **shadcn 兼容的组件** — 8 个对无样式框架友好的构建块。可整体使用，也可在 Hook 之上接入你自己的 UI。
- **身份镜像** — `onIdentityChange` 让宿主的鉴权 store 能将下游的显示名／颜色编辑镜像回其可信来源。
- **内置保存防抖** — 工厂函数用 `createDebouncedAdapter`（默认 150 ms）封装适配器，使按键不会淹没 `Y.Doc`。设置 `saveDebounceMs: 0` 即可退出。

## API 参考

### 整合工厂函数

```ts
function createCollabPlugin(options: CreateCollabPluginOptions): StudioPlugin;
```

| 字段                                                                                                               | 类型                                                | 默认值       | 用途                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `websocketUrl`                                                                                                      | `string`                                            | 无           | **托管模式。** 中继 URL——大多数宿主唯一需要设置的字段。省略它（且无 `doc`）以使用单标签页内存模式（一次性开发警告）。              |
| `room`                                                                                                              | `string`                                            | `"anvilkit-default-room"` | 托管模式下共享的房间/文档名称。                                                                                            |
| `provider`                                                                                                          | `"hocuspocus" \| "y-websocket"`                     | `"hocuspocus"` | 托管模式后端（安装对应的可选对等依赖）。在 BYO 模式下被忽略。                                                                   |
| `token`                                                                                                             | `string`                                            | `""`         | 转发给中继的鉴权令牌（托管模式）。                                                                                                    |
| `onConnectionError`                                                                                                 | `(err: unknown) => void`                            | `console.error` 一次 | 当托管传输层失败时触发（provider 缺失、URL 错误、鉴权失败）。工厂函数绝不抛出。                                     |
| `self`                                                                                                              | `PeerInfo`                                          | 自动生成     | 本地对等方身份。省略时，会生成一个匿名身份（`anon-<uuid>` + 稳定的哈希十六进制颜色）。                                  |
| `onIdentityChange`                                                                                                  | `(next: PeerInfo) => void`                          | 无           | 当下游 UI 调用 `updateSelf` 时触发。在初始挂载时跳过，并按 `{ id, displayName, color }` 的浅相等去重。               |
| `doc`                                                                                                               | `YDoc`                                              | 无           | **BYO 模式。** 提供你自己的 Yjs 文档；工厂函数既不创建也不销毁它。优先于 `websocketUrl`。                       |
| `awareness`                                                                                                         | `Awareness`                                         | 自动创建     | 在场通道。BYO 模式下自带；否则是托管模式下的可选覆盖项。                                                                      |
| `mapName`、`useNativeTree`、`staleAfterMs`、`connectionSource`、`computeDelta`、`awarenessRateLimit`、`persistence` | —                                                   | —            | 原样转发给 `createYjsAdapter`。见 [plugin-collab-yjs `CreateYjsAdapterOptions`](../plugin-collab-yjs/README.md#createyjsadapteroptions)。 |
| `puckConfig`                                                                                                        | `Config`                                            | 无           | 出站同步必需。只读查看者可省略。                                                                                              |
| `saveDebounceMs`                                                                                                    | `number`                                            | `150`        | 合并本地保存。设置 `0` 以禁用。                                                                                           |
| `validateRemoteIR`、`onValidationFailure`、`policy`、`onPolicyViolation`、`onSaveError`                             | —                                                   | —            | 转发给 `createCollabDataPlugin`。                                                                                               |
| `presence`                                                                                                          | `CollabPresenceLayerProps & { enabled?: boolean }`  | 已挂载       | 自动挂载的 `<PresenceLayer>` 的 props。`enabled: false` 会跳过它。                                                                             |
| `notifications`                                                                                                     | `ConflictNoticeCenterProps & { enabled?: boolean }` | 已挂载       | 自动挂载的 `<ConflictNoticeCenter>` 的 props。                                                                                                 |

### 提供器

```ts
function CollabUIProvider(props: CollabUIProviderProps): JSX.Element;

interface CollabUIProviderProps {
  adapter: YjsSnapshotAdapter;
  self: PeerInfo;
  children: ReactNode;
}
```

当你只想要无界面的适配器加上这些 Hook 时，直接用 provider 包裹编辑器树——完全跳过整合工厂函数。

### Hook

| Hook                          | 返回                                             | 备注                                                                                  |
| ----------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `useCollabAdapter()`          | `YjsSnapshotAdapter`                             | 原始适配器实例。                                                                      |
| `useCollabStatus()`           | `ConnectionStatus`                               | 可辨识联合类型（`connecting` / `synced` / `offline` / `reconnecting` / `error`）。    |
| `useCollabSelf()`             | `PeerInfo`                                       | 本地对等方身份。                                                                      |
| `useCollabIdentity()`         | `{ self, updateSelf }`                           | 用于仅关心身份的消费者；不会在对等方／状态变动时重新渲染。                            |
| `useCollabPeers()`            | `readonly PresenceState[]`                       | 高频变动切片（对等方身份 + 实时光标/选择）——保持其消费者精简。                        |
| `useCollabConflicts()`        | `readonly ConflictEvent[]`                       | 只读冲突队列。                                                                        |
| `useCollabConflictQueue()`    | `{ conflicts, dismissConflict, clearConflicts }` | 可变更的消费者。                                                                      |
| `useCollabCursorVisibility()` | `{ showRemoteCursors, setShowRemoteCursors }`    | 设置开关与 `PresenceLayer` 共享的可信来源。                                           |
| `useCollabMetrics(pollMs?)`   | `MetricsSnapshot \| null`                        | 轮询的 `adapter.metrics()` 快照。首次渲染时为 `null`。                                |
| `useCollabContext()`          | `CollabUIContextValue`                           | 完整复合体——任何变化都会重新渲染。优先使用窄 Hook。                                   |

### 组件

所有组件都位于 `@anvilkit/collab-ui/components/<name>`。它们消费 context，因此必须渲染在 `<CollabUIProvider>` 内（或在注册了整合工厂函数的 `<Studio>` 下）。

| 组件                      | 关键 props                                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `CollabRoomBar`           | `title?: string`、`subtitle?: string`、`roomId?: string`、`roomLink?: string`、`trailing?: ReactNode`、`className?: string`   |
| `PeerAvatarStack`         | `maxVisible?: number`（默认 `5`）、`className?: string`                                                                       |
| `PresenceLayer`           | `showCursors?: boolean`、`resolveSelectionRect?: (nodeId: string) => PresenceSelectionRingRect \| null`、`className?: string` |
| `SyncActivityIndicator`   | `latencyMs?: number`、`lastSyncAt?: string`、`lastPeerName?: string`、`className?: string`                                    |
| `ConflictNoticeCenter`    | `formatMessage?: (event: ConflictEvent) => string`、`toasterPosition?: "top-right" \| "bottom-right" \| "top-center"`         |
| `ForceResyncDialog`       | `open?: boolean`、`onOpenChange?: (open: boolean) => void`                                                                    |
| `CollabSettingsPopover`   | `roomId?: string`、`roomLink?: string`                                                                                        |
| `CollabPresencePublisher` | `root: HTMLElement`、`frameSelector?: string`                                                                                 |

## 使用示例

### 无界面适配器 + 自定义 UI

```tsx
import {
  createYjsAdapter,
  createCollabDataPlugin,
} from "@anvilkit/plugin-collab-yjs";
import {
  CollabUIProvider,
  useCollabStatus,
  useCollabPeers,
} from "@anvilkit/collab-ui";

const adapter = createYjsAdapter({ doc, awareness, peer: self });

export function Editor() {
  return (
    <CollabUIProvider adapter={adapter} self={self}>
      <Studio
        puckConfig={puckConfig}
        plugins={[
          createCollabDataPlugin({ adapter, puckConfig, localPeer: self }),
        ]}
      />
      <CustomSyncRibbon />
    </CollabUIProvider>
  );
}

function CustomSyncRibbon() {
  const status = useCollabStatus();
  const peers = useCollabPeers();
  return (
    <div>
      {status.kind} · {peers.length} peer(s)
    </div>
  );
}
```

### 发布本地光标 + Puck 选择

```tsx
import { CollabPresencePublisher } from "@anvilkit/collab-ui/components/collab-presence-publisher";

<CollabPresencePublisher
  root={canvasRef.current!}
  frameSelector="#puck-canvas"
/>;
```

将发布器挂载在 `<Studio>` 内（这样它就能通过 `createUsePuck()` 读取 Puck 选择）。它是可选启用的——数据层只发布远程光标。

### 将身份变更镜像回宿主

```tsx
createCollabPlugin({
  doc,
  self: { id: profile.id, displayName: profile.name, color: profile.color },
  onIdentityChange: (next) => {
    profileStore.update({ name: next.displayName, color: next.color });
  },
  puckConfig,
});
```

`onIdentityChange` 只在实际发生变更时触发——初始挂载和同值更新都会跳过。

### 用于遥测的轮询指标

```tsx
import { useCollabMetrics } from "@anvilkit/collab-ui";

function CollabHealthBadge() {
  const metrics = useCollabMetrics(5000);
  if (!metrics) return null;
  return (
    <span>
      p95 {metrics.syncLatencyP95Ms}ms · churn {metrics.awarenessChurn}
    </span>
  );
}
```

## 注意事项与常见问题

### 为什么把 context 拆成五个 provider？

远程光标流量是系统中变动频率最高的信号。如果所有消费者都从单个 context 读取，每次光标更新都会重新渲染状态药丸、头像堆叠和冲突 toaster。把 `peers` 拆到它自己的 context 中，能让这个高频变动的信号被限定在 `<PresenceLayer>` 范围内，而 UI 的其余部分则保持静止。

如果你确实需要在一个组件里获取每一片切片，请使用 `useCollabContext()`——但要注意它会在任何变化时重新渲染。

### 保存防抖默认开启

`saveDebounceMs: 150` 会在把适配器传给数据插件之前，用 `createDebouncedAdapter` 将其封装。只有保存路径会被防抖——在场、状态和冲突读取仍使用实时适配器。如果宿主在上游已经做了防抖（例如一个批处理按键的受控表单层），请设置 `saveDebounceMs: 0`。

### 无界面 vs 整合工厂函数

| 使用场景                                                                      | 选择                                                                                                                          |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 你想要一行集成并搭配默认外观。                                                | 本包的 `createCollabPlugin()`。                                                                                              |
| 你只想要数据层（只读查看者、自定义 UI、服务端同步）。                          | 来自 `@anvilkit/plugin-collab-yjs` 的 `createYjsAdapter` + `createCollabDataPlugin`。                                        |
| 你想要这些 Hook 但要用自定义组件。                                            | 无界面适配器 + 手动 `<CollabUIProvider>`。                                                                                    |
| 你想要部分捆绑 UI 但不是全部。                                                | `createCollabPlugin()` 搭配 `presence.enabled: false` / `notifications.enabled: false`（`collaborators` 插槽始终会被贡献——通过先注册你自己的 `collaborators` 插槽来覆盖）。 |

### 光标可见性开关

`useCollabCursorVisibility()` 是“显示远程光标”开关共享的可信来源。`CollabSettingsPopover` 写入它，`PresenceLayer` 读取它。不要在宿主代码中复制这个状态——从该 Hook 读取，这样开关和覆盖层就能保持同步。

### 捆绑组件是插槽贡献

工厂函数将 `<PeerAvatarStack>` 注册到顶栏的 `collaborators` 插槽。根据 Studio 插件契约，插槽是单一占用的，先注册者胜出——注册你自己的、在此之前贡献 `collaborators` 插槽的插件即可覆盖默认值。

### 依赖契约

本包依赖 `@anvilkit/plugin-collab-yjs` 来获取其类型和事件流。不提供实时协作的宿主不应安装它。关于 SnapshotAdapter v2 契约，请参阅 Anvilkit 文档站点上的实时协作架构文档。
