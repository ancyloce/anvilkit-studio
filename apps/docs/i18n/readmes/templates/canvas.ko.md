# `@anvilkit/canvas-templates`

AnvilKit Canvas Studio와 함께 제공되는 10개의 스타터 [`CanvasIR`](../../../capabilities/canvas/core/src/types.ts) 디자인 — 포스터, 소셜 포맷, 슬라이드, 인쇄물. 각각은 자체 완결형 `CanvasIR`(text / rect / ellipse / line 노드만 포함, 외부 에셋 없음)이므로 네트워크 호출 없이 로드됩니다.

## 계약

`src/index.ts`는 타입이 지정된 `canvasTemplates` 레지스트리(slug → `{ slug, name, description, ir }`)와 `canvasTemplateList`를 내보냅니다. 모든 `ir`은 `@anvilkit/canvas-core`의 `CanvasIRSchema`에 대해 검증됩니다 — `src/__tests__/canvas-templates.test.ts`에 의해 강제됩니다.

```ts
import { canvasTemplates, canvasTemplateList } from "@anvilkit/canvas-templates";

const poster = canvasTemplates.poster.ir; // CanvasIR
```

## 레이아웃

```
packages/extensions/templates/canvas/
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── index.ts                 # typed registry (default export per slug)
    ├── *.json                   # one committed CanvasIR per template
    └── __tests__/
        └── canvas-templates.test.ts
```

이 `*.json` 파일들은 [`../scripts/scaffold-canvas-irs.mjs`](../scripts/scaffold-canvas-irs.mjs)에 의해 작성되며 diff를 검토할 수 있도록 커밋됩니다. 선언적 테이블에서 다시 생성하려면 `pnpm --filter @anvilkit/templates-workspace scaffold:canvas-irs`를 다시 실행하세요.

## 빌드

`tsc`는 (`resolveJsonModule`을 통해) 가져온 `*.json`을 `dist/`로 복사하여, 이 폴더 옆에 있는 Puck `@anvilkit/template-*` 패키지와 일치시킵니다. 이 디렉터리는 `scripts/verify-templates.mjs`(Puck `AnvilkitTemplate` 패키지를 검증)에서 건너뛰며, 자체 Vitest 스위트에 의해 검증됩니다.
