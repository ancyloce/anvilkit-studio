# @anvilkit/plugin-version-history

> **Alpha（`0.1.8`）.** 헤더 액션과 diff/apply 엔진은 안정적입니다. 이 플러그인은 지원되는 `ctx.registerHistoryPanel` 슬롯을 통해 StudioSidebar `history` 패널도 기여할 수 있습니다 —— `renderPanel` 옵션을 전달하세요([사이드바 기록 패널](#sidebar-history-panel) 참조).

Anvilkit Studio를 위한 헤드리스 버전 기록 플러그인. 스냅샷 영속화는 호스트가 제공하는 `SnapshotAdapter`에 위임되므로, 플러그인 자체는 I/O를 전혀 포함하지 않습니다 —— diff/apply 엔진, 헤더 액션, 선택적 UI 프리미티브, 그리고 테스트와 데모용 참조 어댑터만 있습니다.

## 설치

```bash
pnpm add @anvilkit/plugin-version-history react react-dom @puckeditor/core
```

비선택적 peer: `react >=19.0.0`, `react-dom >=19.0.0`, `@puckeditor/core ^0.22.1`. 트랜스포트나 스토리지 의존성은 없습니다 —— 호스트가 영속화를 처음부터 끝까지 소유합니다.

서브경로 가져오기:

- `@anvilkit/plugin-version-history` —— 메인 진입점: 플러그인 팩토리, 참조 어댑터, diff/apply 엔진, 타입.
- `@anvilkit/plugin-version-history/ui` —— 선택적 React 컴포넌트(`VersionHistoryUI`, `SaveSnapshotButton`, `SnapshotList`, `SnapshotHistoryModal`, `DiffView`).
- `@anvilkit/plugin-version-history/testing` —— `runAdapterContract` 공유 테스트 스위트.

## 빠른 시작

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

이 플러그인은 두 개의 헤더 액션(`version-history:save`와 `version-history:open`)을 기여하고, Studio 이벤트 버스에서 `version-history:save-requested` / `version-history:open-requested`를 발행합니다. 호스트는 UI 표면(예: `/ui` 서브경로의 `<SnapshotHistoryModal>`)을 마운트하여 open 이벤트를 처리합니다.

## 핵심 기능

- **어댑터 기반 영속화** —— 플러그인이 계약을 정의하고, 호스트가 `save` / `list` / `load` / `delete?`(배치 정리 및 이식성을 위한 선택적 `deleteMany?` / `exportAll?` / `importAll?` 포함)를 구현하여 스토리지(인메모리, localStorage, Firestore, S3, ……)를 완전히 제어합니다.
- **결정론적 diff/apply 엔진** —— `diffIR(a, b)`는 동결된 `IRDiff`를 생성하고, `applyDiff(a, diff)`는 왕복합니다.
- **선택적 UI** —— 배터리 포함 버전 기록을 원하는 호스트를 위해 `/ui`에 다섯 개의 컴포넌트를 제공합니다. 기본 익스포트는 그것들 중 어느 것도 가져오지 않으므로, 헤드리스 사용자는 UI 렌더링 비용을 지불하지 않습니다.
- **FIFO 축출** —— 용량에 도달하면 `maxSnapshots`가 가장 오래된 스냅샷을 자동으로 삭제합니다(`adapter.delete` 필요).
- **참조 어댑터** —— 테스트용 `inMemoryAdapter()`, 데모용 `localStorageAdapter({ namespace })`.
- **어댑터 테스트 스위트** —— `runAdapterContract`는 참조 어댑터가 사용하는 것과 동일한 계약입니다. 사용자는 자신의 구현을 이에 대해 검증할 수 있습니다.
- **번들 예산** —— `scripts/check-bundle-budget.mjs`를 통해 CI에서 강제되는 약 10 KB gzipped 진입점 청크.

## API 레퍼런스

### 팩토리

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

`VersionHistoryContribution` 기능을 지닌 타입이 지정된 `StudioPlugin`을 반환합니다(따라서 다운스트림 사용자는 `InferPluginContributions`를 통해 `adapter` / `snapshots`를 복구할 수 있습니다).

### 사이드바 기록 패널

`renderPanel`을 전달하여 StudioSidebar `history` 모듈 본문을 기여합니다. 이 플러그인은 `register()` 중에 코어의 지원되는, 렌더링되는 `ctx.registerHistoryPanel` 슬롯을 통해 `StudioHistoryPanel`을 등록합니다. 이렇게 하면 `history` 레일 탭이 나타나고(`SidebarRail`이 `historyPanel !== null`을 기준으로 게이트함), 코어의 `HistoryModule`을 통해 패널 안에 여러분의 thunk를 렌더링합니다. 런타임은 `<Studio>` 언마운트 시 등록을 자동으로 해제합니다. `renderPanel`을 생략하면 이전의 헤더 액션 전용 동작이 유지됩니다 —— 사이드바 패널 없음, 레일 탭 없음.

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

호스트가 `currentIR` 읽기와 `onRestore` 디스패치를 소유합니다: 플러그인 서브모듈이 런타임에 자체 `@puckeditor/core` 사본을 해석할 수 있으므로(이중 Puck 위험), 반응형 Puck 상태를 읽는 것은 호스트의 React/Puck 컨텍스트에서 일어나야 합니다. `currentIR`은 일반적으로 호스트의 반응형 Puck 데이터에 대해 `puckDataToIR(data, puckConfig)`(`@anvilkit/ir`)로부터 옵니다.

### `SnapshotAdapter` 계약

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

| 메서드            | 필수?     | 목적                                                                       |
| ----------------- | --------- | ------------------------------------------------------------------------- |
| `save(ir, meta)`  | 예        | `PageIR`를 영속화한다. 고유한 스냅샷 id를 반환한다.                         |
| `list()`          | 예        | 모든 스냅샷을 순서대로 반환한다(관례상 최신순).                             |
| `load(id)`        | 예        | id로 하이드레이트한다. 누락 시 `VersionHistoryError("SNAPSHOT_NOT_FOUND")`를 던진다. |
| `delete(id)`      | 선택      | `maxSnapshots`를 설정할 때 필수.                                            |
| `deleteMany(ids)` | 선택      | 관리자 정리를 위한 배치 삭제. 나머지 스냅샷은 로드 가능한 상태로 유지한다.   |
| `exportAll()`     | 선택      | 모든 스냅샷을 이식 가능한 `VersionHistoryExport` 아카이브로 구체화한다.     |
| `importAll(data)` | 선택      | `VersionHistoryExport`로부터 복원한다(`"merge"` 기본값, 또는 `"replace"`).  |
| `updateMeta(id, patch)` | 선택 | 스냅샷의 가변 메타데이터(`SnapshotMetaPatch`)를 제자리에서 패치한다. 누락 시 `SNAPSHOT_NOT_FOUND`를 던진다. |
| `subscribe(cb)`   | 선택      | 협업 어댑터(예: `createYjsAdapter`)로부터 업데이트를 푸시한다.              |
| `presence`        | 선택      | 다중 사용자 커서 / 선택 채널. Yjs 어댑터가 구현한다.                        |

모든 메서드는 동기 또는 비동기일 수 있습니다(`MaybePromise<T>`). 동결되고 구조적으로 동등한 결과를 반환하는 것이 권장됩니다.

#### 배치 삭제 및 이식성

`deleteMany`, `exportAll`, `importAll`은 추가적이고, 선택적이며, 하위 호환됩니다 —— 이것들을 생략하는 어댑터는 영향받지 않으며, 호출자는 반드시 이것들을 기능 탐지(feature-detect)해야 합니다. 인메모리와 `localStorage` 참조 어댑터는 셋 모두를 구현합니다. 헤더의 `maxSnapshots` 보존 경로는 `deleteMany`가 있으면 자동으로 그것을 우선합니다.

```ts
const archive = await adapter.exportAll?.(); // { version: 1; snapshots: [{ meta, ir }] }

// Round-trips into a fresh adapter: imported snapshots keep their original
// ids/metadata and are stored as standalone keyframes, so each is loadable.
await fresh.importAll?.(archive, { mode: "replace" }); // or "merge" (default)
```

`exportAll`은 각 스냅샷의 **전체** `PageIR`를 내부 delta 체인으로부터 재구성하므로, 아카이브는 자족적이고 JSON 직렬화 가능합니다(이것은 delta 체인 와이어 포맷이 _아닙니다_). `normalizeVersionHistoryExport(value)`는 어댑터가 어떤 변경 전에 잘못된 형식의 아카이브를 `STORAGE_CORRUPT` `VersionHistoryError`로 거부하는 데 사용하는, 익스포트된 부수 효과 없는 검증기입니다 —— 직접 만든 아카이브나 서드파티 아카이브를 검증하려면 직접 호출하세요.

#### 협업: `subscribe` 및 `presence`（호스트 소유）

`subscribe`와 `presence`는 **선택적이며 호스트 / 협업 어댑터가 소유합니다 —— 번들된 참조 어댑터는 이것들을 제공하지 않습니다.** 인메모리와 `localStorage` 참조 어댑터는 단일 사용자용이며 의도적으로 둘 중 어느 것도 구현하지 않습니다(`types.contract.test.ts` 스위트는 둘 다 그것들에서 `undefined`임을 단언합니다). 따라서 호출자는 사용하기 전에 이것들을 기능 탐지해야 합니다.

실제 구현은 협업 트랜스포트에 존재합니다 —— 예를 들어 Yjs 어댑터 `@anvilkit/plugin-collab-yjs`(`YjsSnapshotAdapter`)는 이 계약 위에 `subscribe`(원격 변경 푸시)와 `presence`(실시간 커서 / 선택)를 계층화합니다. 존재할 때:

- `subscribe(onUpdate)`는 원격 피어가 공유 문서를 변경할 때마다 `onUpdate(ir, peer?)`를 발생시키고, 업데이트 수신을 중단하기 위해 호출하는 `Unsubscribe`를 반환합니다(멱등적).
- `presence`는 로컬 피어를 발행하는 `update(state)`와 원격 명단을 관찰하는 `onPeerChange(cb)`를 노출합니다(`SnapshotAdapterPresence` 참조).

자신의 협업 어댑터를 작성하는 경우 이 두 멤버를 구현하세요. 단일 사용자 영속화만 필요하다면 이것들을 생략하면 플러그인은 실시간 동기화 없는 헤더 액션 스냅샷으로 격하됩니다.

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

`delta`는 선택 사항입니다. 옵트인하는 어댑터(`createYjsAdapter({ computeDelta: true })`)는 이전 스냅샷으로부터의 구조적 diff로 그것을 채웁니다. 더 오래되었거나 더 단순한 어댑터는 그것을 생략합니다.

신원 / 출처 필드(`id`, `savedAt`, `pageIRHash`, `delta`)는 불변입니다 —— 이들은 _무엇이_ 캡처되었고 _언제_ 캡처되었는지를 기술하며, 스냅샷이 기록된 후에는 절대 변경되지 않습니다. 나머지는 호스트가 큐레이션하는 메타데이터로, 모든 필드가 선택적이고 하위 호환됩니다(어떤 필드가 존재하기 전에 기록된 레코드는 그것을 단순히 생략합니다):

- `label` —— 기록 목록에 표시되는 짧고 사람이 읽을 수 있는 이름.
- `tags` —— 그룹화, 필터링, 검색을 위한 레이블(예: `["release", "qa"]`).
- `milestone` —— 일반적인 자동 저장과 달리, 기록 UI에서 두드러지게 표시할 이름 있는 체크포인트를 표시합니다.
- `protected` —— 스냅샷을 자동 보존에서 제외합니다: `planRetention`은 나이나 개수 압박과 관계없이 보호된 스냅샷을 삭제 계획에 절대 넣지 않습니다.
- `author` —— 감사 추적을 위한 불투명한 행위자 귀속(사용자 id, 이메일, 또는 표시 이름). 패키지가 절대 파싱하지 않습니다.
- `notes` —— 짧은 `label`보다 자유 형식의, 더 긴 형태의 맥락.

이것들을 저장 시점에 `save(ir, meta)`로 설정하거나, 나중에 `adapter.updateMeta?.(id, patch)`로 수정하세요. 패치 타입은 `SnapshotMetaPatch`입니다 —— 정확히 이 가변 서브셋(`label` / `tags` / `milestone` / `protected` / `author` / `notes`)입니다. 생략된 필드는 변경되지 않은 채로 남으며, 신원 필드는 패치할 수 없습니다.

### Diff 엔진

| 익스포트         | 시그니처                              | 목적                                                                     |
| ---------------- | ------------------------------------- | ------------------------------------------------------------------------ |
| `diffIR`         | `(a: PageIR, b: PageIR) => IRDiff`    | 결정론적이고 동결된 diff를 계산한다.                                       |
| `applyDiff`      | `(a: PageIR, diff: IRDiff) => PageIR` | diff를 적용한다. `applyDiff(a, diffIR(a, b))`는 `b`와 구조적으로 동등하다. |
| `summarizeDiff`  | `(diff: IRDiff) => IRDiffSummary`     | `{ added, removed, moved, changed, metaChanged?, description }`.          |
| `DiffApplyError` | `class extends Error`                 | `applyDiff`가 diff를 입력 IR과 조정할 수 없을 때 던져진다.                 |

### `IRDiffOp`（판별 유니온 타입）

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

### 참조 어댑터

| 어댑터                               | 사용 사례               | 비고                                                                                                                                                                                                                                                                          |
| ------------------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `inMemoryAdapter()`                  | 테스트                  | 저장된 IR을 딥 프리즈한다. 새로고침 시 데이터를 잃는다.                                                                                                                                                                                                                        |
| `localStorageAdapter({ namespace })` | 데모, 단일 사용자 SPA   | 스토리지 키: `<namespace>:snapshots:<id>`(페이로드), `<namespace>:snapshots:index`(메타데이터 배열). 약 5–10 MB 할당량에 맞추기 위해 delta 체인 인코딩을 사용한다. `STORAGE_UNAVAILABLE`, `STORAGE_CORRUPT`, `STORAGE_QUOTA_EXCEEDED` 중 하나로 `VersionHistoryError`를 던진다. |

### 오류

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

원격 및 협업 어댑터는 권한 없는 `save`/`load`/`list`/`delete`/`restore` 호출을 `PERMISSION_DENIED` 오류를 던져 거부합니다. `createPermissionDeniedError(operation, detail?)` 편의 생성자를 사용하거나, `new VersionHistoryError("PERMISSION_DENIED", message)`를 직접 던지세요:

```ts
import { createPermissionDeniedError } from "@anvilkit/plugin-version-history";

async function load(id: string) {
  if (!viewer.canRead(roomId)) {
    throw createPermissionDeniedError("load", `viewer ${viewer.id} lacks read access`);
  }
  // …
}
```

### 선택적 UI（`./ui`）

| 컴포넌트               | 주요 props                                              |
| ---------------------- | ------------------------------------------------------- |
| `VersionHistoryUI`     | `{ adapter, currentIR, onRestore }`                     |
| `SaveSnapshotButton`   | `{ adapter, currentIR, getLabel? }`                     |
| `SnapshotList`         | `{ snapshots, onSelect, currentId? }`                   |
| `SnapshotHistoryModal` | `{ open, onOpenChange, adapter, currentIR, onRestore }` |
| `DiffView`             | `{ diff, before?, after? }`                             |

`/ui` 서브경로는 별도의 진입점입니다 —— 거기서 가져와도 패키지의 나머지 부분은 트리거되지 않습니다. 기본 플러그인 익스포트는 이 컴포넌트들을 참조하지 않습니다.

### 테스트（`./testing`）

```ts
runAdapterContract(
  adapterFactory: () => SnapshotAdapter,
  hooks: { describe; expect; it },
): void;
```

테스트 러너의 프리미티브를 전달하면 패키지를 특정 프레임워크에 결합시키지 않고 스위트를 주입할 수 있습니다.

## 사용 예시

### 단일 사용자 SPA를 위한 LocalStorage 어댑터

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

### 커스텀 Firestore 어댑터

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

### 커스텀 어댑터 검증

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

### diff 뷰 렌더링

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

## 비고 및 FAQ

### 스토리지는 의도적으로 플러그인 가능

플러그인은 `localStorage`, IndexedDB, 또는 어떤 백엔드에서도 직접 읽지 않습니다. 어댑터가 유일한 영속화 경계입니다 —— 세션 공유, 멀티 테넌트, 또는 감사 준수 스토리지가 필요하다면, 어댑터를 작성하고 타입이 지정된 계약 안에 머무르세요.

### `move-node`는 정보 제공용

`applyDiff`는 `move-node` 작업을 검증하지만, 그것들만으로는 부모 재지정을 **수행하지 않습니다**. 영향받는 부모의 `change-children`이 권위 있는 부모 재지정 / 재정렬 신호입니다. 표시나 로깅을 위해 `IRDiff`를 검사하는 사용자는 `move-node`를 표현에 사용할 수 있지만, 재생 정확성을 그것에 의존하지 마세요.

### `maxSnapshots`는 `delete`가 필요

FIFO 축출 경로는 개수가 상한을 초과하려고 할 때 가장 오래된 스냅샷을 제거합니다 —— `adapter.deleteMany(ids)`(단일 스토어 변경)를 우선하고, id별 `adapter.delete(oldestId)`로 폴백합니다. `deleteMany`와 `delete`를 모두 생략한 어댑터는 `maxSnapshots`를 충족할 수 없습니다. 둘 중 하나를 구현하거나 `maxSnapshots`를 생략하세요.

### 번들 예산

발행된 진입점 청크에는 `scripts/check-bundle-budget.mjs`에 의해 CI에서 강제되는 약 10 KB gzipped 예산이 있으며, `dist/index.js`에 대한 보완적인 `.size-limit.json` 예산이 있습니다. 워크스페이스 의존성(`@anvilkit/*`)과 peer(`react`, `react-dom`, `@puckeditor/core`)는 외부로 취급됩니다.

### 선택적 UI는 설계상 옵트인

`@anvilkit/plugin-version-history`에서 가져와도 `/ui` 컴포넌트를 절대 끌어오지 않습니다 —— 그것들은 별도의 진입점에 있습니다. 이는 헤드리스 사용자(스냅샷과 감사 기록만 원하지만 자체 UI를 제공하는 CMS)를 발행된 번들 예산 내에 유지합니다.

### 어댑터 동결 권장

참조 어댑터는 저장된 IR을 딥 프리즈하여 우발적인 변경을 조기에 포착합니다. 커스텀 어댑터는 동결이 요구되지 않지만, 그렇게 하면 그렇지 않으면 놓치기 쉬운 "저장 후 기록 스냅샷이 변경됨" 부류의 버그를 제거할 수 있습니다.

### 플러그인 간 타입

`SnapshotAdapter`, `PeerInfo`, `PresenceState` 등은 여기서 단일 진실 공급원으로 다시 익스포트됩니다 —— `@anvilkit/plugin-collab-yjs`는 `SnapshotAdapter`를 `YjsSnapshotAdapter`로 확장하여 충돌 / 상태 / 메트릭 표면을 추가합니다. 두 플러그인에 걸친 공유 추상화를 작성할 때는 이 패키지의 타입을 사용하세요.
