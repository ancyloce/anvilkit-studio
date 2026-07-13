# @anvilkit/plugin-export-react

> **Alpha(`0.1.6`).** 인터페이스는 구현 및 테스트되었지만, 출력되는 JSX 계약은 `1.0.0` 이전까지 계속 발전할 수 있습니다.

Anvilkit Studio용 React(`.tsx` / `.jsx`) 내보내기 플러그인. 정규화된 `PageIR`을 바로 가져다 쓸 수 있는 React 소스로 변환합니다. `@anvilkit/<slug>` 패키지에서의 컴포넌트 import, 직렬화된 props가 포함된 JSX, 그리고——선택적으로——참조된 로컬 에셋에 대한 `import` 문을 생성하여 Vite / Next가 해시 및 핑거프린트를 부여할 수 있도록 합니다. 독립형 HTML 출력도 함께 필요할 때는 [`@anvilkit/plugin-export-html`](../plugin-export-html/README.md)과 함께 사용하세요.

## 설치

```bash
pnpm add @anvilkit/plugin-export-react @anvilkit/core react @puckeditor/core
```

선택이 아닌 peer 의존성: `react >=19.0.0`, `@puckeditor/core ^0.22.1`, `@anvilkit/core ^0.1.4`. `react-dom`은 필요하지 않습니다——이 플러그인은 렌더링된 DOM이 아니라 소스를 출력합니다.

## 빠른 시작

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

`buildIR`이 제공되면 "Export React"를 클릭할 때 엔드 투 엔드로 실행되며 `page.tsx` 콘텐츠와 함께 `anvilkit:export:ready`를 브로드캐스트합니다. 호스트는 이를 수신하여 다운로드를 트리거합니다. `buildIR`이 없으면 이 액션은 대신 `anvilkit:export:request`를 브로드캐스트합니다.

## 핵심 기능

- **TSX 또는 JSX 출력**——`syntax: "tsx"`는 반환 타입 주석을 유지하고, `"jsx"`는 이를 제거합니다.
- **ESM 또는 CJS 모듈 시스템**——`moduleResolution: "esm"`(기본값)은 `import`/`export default`를 출력하고, `"cjs"`는 `require`/`module.exports`를 출력합니다.
- **두 가지 에셋 전략**——`url-prop`은 에셋 URL을 문자열로 유지하고, `static-import`는 로컬 상대 경로를 파일 상단의 ES import로 다시 작성하여 번들러가 해시 및 핑거프린트를 부여할 수 있도록 합니다.
- **결정적 import**——`collectImports`는 IR을 순회하며 `PascalCase` 컴포넌트 타입을 `@anvilkit/<slug>` 패키지에 매핑하고, 바이트 단위로 안정적인 출력을 위해 매니페스트를 정렬합니다.
- **AST 스냅샷 테스트**——출력은 `@typescript-eslint/typescript-estree`를 통해 파싱되므로, 테스트 스위트는 공백 변동을 무시하면서 형태 변화를 포착합니다.
- **엄격한 props 직렬화**——JSON 직렬화 가능한 값만 통과합니다. 함수, `Date`, `Map`, `Set`, `RegExp`, `Promise`, `symbol`, `bigint`, `undefined`는 `NON_SERIALIZABLE_PROP` 경고와 함께 거부됩니다.
- **8개 코드 경고 채널**——출력 시점에 잘못될 수 있는 여덟 가지 사항에 대해, 타입이 지정되고 호스트가 치명적으로 처리할 수 있는 경고.

## API 레퍼런스

### 플러그인 팩토리

```ts
function createReactExportPlugin(opts?: ReactExportOptions): StudioPlugin;
```

하나의 내보내기 형식(`id: "react"`)과 하나의 헤더 액션(`id: "export-react"`)을 등록하는 `StudioPlugin`을 반환합니다. 플러그인 메타:

| Field         | Value                          |
| ------------- | ------------------------------ |
| `id`          | `anvilkit-plugin-export-react` |
| `name`        | `React Export`                 |
| `coreVersion` | `^0.1.3`                       |

### `ReactExportOptions`

| Field              | Type                            | Default      | Purpose                                                                 |
| ------------------ | ------------------------------- | ------------ | ----------------------------------------------------------------------- |
| `syntax`           | `"tsx" \| "jsx"`                | `"tsx"`      | `"tsx"`는 페이지 컴포넌트에 TypeScript 반환 타입 주석을 유지합니다.      |
| `moduleResolution` | `"esm" \| "cjs"`                | `"esm"`      | 출력 파일이 대상으로 하는 모듈 시스템.                                   |
| `includeImports`   | `boolean`                       | `true`       | 다운스트림 번들러가 자체 import를 주입하는 경우 `false`로 설정합니다.    |
| `assetStrategy`    | `"static-import" \| "url-prop"` | `"url-prop"` | 에셋 prop 렌더링 전략.                                                   |
| `buildIR`          | `IRBuilder`                     | none         | 제공되면 헤더 액션이 엔드 투 엔드로 실행됩니다.                          |

`REACT_EXPORT_DEFAULTS`는 테스트와 스냅샷을 위해 기본 객체를 노출합니다. `resolveReactExportOptions(partial)`은 입력 검증과 함께 기본값을 적용합니다(잘못된 enum 값에서 `TypeError`를 던집니다).

### 형식 직접 접근

```ts
const reactFormat: ExportFormatDefinition<ReactExportOptions> = {
  id: "react",
  label: "React (.tsx)",
  extension: "tsx",
  mimeType: "text/plain",
  run: async (ir, options, runCtx) => ({ content, filename, warnings }),
};
```

`filename`은 `syntax`에 따라 `page.tsx` 또는 `page.jsx`입니다.

### 헤더 액션

| Export                                           | Purpose                                                                      |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| `createExportReactHeaderAction(format, options)` | 구성된 형식에 바인딩된 헤더 액션을 빌드합니다.                                |
| `exportReactHeaderAction`                        | 기본 바인딩되지 않은 액션. 호스트가 처리하도록 `anvilkit:export:request`를 출력합니다. |

헤더 액션 메타데이터: `id: "export-react"`, `label: "Export React"`, `icon: "code"`, `order: 110`.

### 저수준 이미터

```ts
function emitReact(ir: PageIR, options?: ReactExportOptions): EmitReactResult;

interface EmitReactResult {
  readonly code: string;
  readonly imports: ImportManifest;
  readonly warnings: readonly ExportWarning[];
}
```

출력 전에 IR 버전(`"1"`)과 루트 노드 타입(`"__root__"`)을 검증합니다. 태그명과 속성명은 정규식으로 보호됩니다——유효하지 않은 식별자는 깨진 JSX를 출력하는 대신 경고와 함께 주석 플레이스홀더로 폴백합니다.

### import 수집

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

`componentTypeToPackageSlug("Hero")` → `"@anvilkit/hero"`. 매니페스트는 바이트 단위로 안정적인 출력을 위해 `(kind, source, binding)`으로 정렬됩니다.

### 에셋 계획

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

감지되는 에셋 prop 키: `src`, `imageUrl`, `imageSrc`, `url`, `videoUrl`, `videoSrc`, `fontUrl`, `scriptUrl`, `styleUrl`, `backgroundSrc`, `backgroundImage`, `poster`, `thumbnailSrc`.

### props 직렬화

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

원시 값, 일반 객체, 배열을 받습니다. 함수, `Date`, `Map`, `Set`, `RegExp`, `Promise`, `symbol`, `bigint`, `undefined`는 거부합니다.

### 경고 코드

| Code                         | Trigger                                                                                                        | Remediation                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `NON_SERIALIZABLE_PROP`      | prop이 함수, `Date`, `Map`, `Set`, `RegExp`, `Promise`, `symbol`, `bigint`, `undefined`이거나 이를 포함함.      | 소스에서 JSON 호환 값으로 변환하세요.                                                      |
| `INVALID_PROP_NAME`          | prop 키가 유효한 JSX 속성명이 아님.                                                                            | IR에서 키를 정제하세요. 이미터가 해당 속성을 삭제합니다.                                   |
| `INVALID_NODE_TYPE`          | 컴포넌트 타입이 유효한 JSX 태그가 아님(소문자, 공백 등).                                                       | `PascalCase` 식별자를 사용하세요. 이미터가 주석 플레이스홀더를 삽입합니다.                 |
| `CJS_REQUIRES_JSX`           | `syntax: "tsx"` + `moduleResolution: "cjs"`——Node는 `.tsx`를 `require`할 수 없습니다.                           | 먼저 TypeScript 툴체인으로 컴파일하거나 ESM으로 전환하세요.                                |
| `EXTERNAL_URL_STATIC_IMPORT` | `static-import` 하에서 에셋 prop에 외부 URL(`https://` / `//` / `data:` / `file:`)이 있음.                      | 에셋을 프로젝트 트리로 옮기거나, prop별 `url-prop` 폴백을 수용하세요.                      |
| `UNSAFE_ASSET_PATH`          | `static-import` 하에서 에셋 URL에 `..` 트래버설 또는 알 수 없는 스킴이 포함됨.                                  | 에셋 URL을 정제하세요. prop별로 `url-prop`으로 폴백합니다.                                 |
| `ASSET_UNRESOLVED`           | `asset://` 참조가 등록된 어떤 리졸버로도 해결되지 않음.                                                        | 리졸버를 등록하거나, 해결되지 않은 에셋을 제거하세요.                                      |
| `INVALID_OPTION_COMBINATION` | `static-import` + `includeImports: false`.                                                                    | `includeImports: true`로 설정하거나 `url-prop`을 사용하세요. 이미터는 `url-prop` 시맨틱으로 실행됩니다. |

## 사용 예시

### Next.js / Vite를 위한 TSX + static-import

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

### 정적 React 앱을 위한 일반 JSX + url-prop

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

### 툴링 파이프라인을 위한 CJS 출력

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

### 이벤트 버스를 통한 호스트 주도 내보내기

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

### 테스트 / CLI를 위한 헤드리스 출력

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

## 참고 사항 및 FAQ

### `static-import` 대 `url-prop`

- **`url-prop`**(기본값)——에셋은 IR에 나타나는 그대로 문자열 URL로 유지됩니다. 빠른 일회성 스냅샷과, 번들러 재작성이 필요 없는 원격 CDN URL에 가장 적합합니다.
- **`static-import`**——URL이 상대 경로인 모든 에셋은 ES 모듈 `import` 바인딩이 되고, JSX prop은 해당 바인딩을 참조하도록 다시 작성됩니다. Vite와 Next는 이러한 import를 번들 입력으로 취급하므로, 에셋은 해시되고 프리로드되며 캐시 무효화를 위해 핑거프린트가 부여됩니다. `static-import` 하에서 외부 `https://…` URL은 `EXTERNAL_URL_STATIC_IMPORT`를 출력하고 해당 단일 prop에 대해 `url-prop` 동작으로 폴백합니다.

### props 직렬화는 엄격합니다

JSON 호환 값만 출력되는 JSX에 도달합니다. 컴포넌트가 `new Date(...)`, `RegExp`, 또는 클래스 인스턴스를 받는다면, IR 경계에서 일반 객체 / 문자열로 변환하세요——이미터는 이를 인코딩하기를 거부합니다. 이는 의도된 것입니다. 출력된 소스는 클래스 인스턴스를 되살릴 수 없는 빌드 파이프라인을 왕복해야 하기 때문입니다.

### 컴포넌트 명명 계약

이 플러그인은 Anvilkit 컴포넌트 명명 규약을 가정합니다. IR 내 `PascalCase` 컴포넌트 타입 → `kebab-case`의 `@anvilkit/<slug>` 패키지. `Hero` → `@anvilkit/hero`; `PricingMinimal` → `@anvilkit/pricing-minimal`. Anvilkit 명명 규약을 벗어난 커스텀 컴포넌트도 여전히 출력되지만, import 경로가 실제 npm 패키지와 일치하지 않을 수 있습니다. 출력된 코드를 후처리하거나, IR에서 컴포넌트 타입을 미리 다시 작성하여 오버라이드하세요.

### AST 스냅샷 업데이트

이미터의 출력은 `@typescript-eslint/typescript-estree`를 통해 파싱되어 `src/__tests__/__snapshots__/ast-contract.test.ts.snap`에 있는 AST 스냅샷과 비교됩니다. 공백 변동은 스위트에 보이지 않게 되지만, 형태 변동(`ImportDeclaration` 누락, 새로운 `JSXAttribute`)은 크게 실패합니다. 의도적인 이미터 변경 후에는:

```bash
pnpm --filter @anvilkit/plugin-export-react test -- -u
```

PR에서 스냅샷 diff를 검토하세요——JSX처럼 보여야 합니다(`ImportDeclaration`, `ExportDefaultDeclaration`, `JSXElement` 자식들).

### Alpha JSX 계약

출력되는 JSX 형태(속성 순서, 포매터 특이점, 주석 위치)는 아직 안정성 계약이 아닙니다. 릴리스 간에 내보낸 소스를 diff하는 사용자는 양쪽을 다시 포맷하거나, AST를 통해 시맨틱 형태를 비교해야 합니다.

### 번들 예산과 `version.ts`

메인 번들은 **8 KB gzip** 예산으로 유지됩니다(`.size-limit.json`, CI에서 강제). 이를 밑돌도록 하기 위해, 플러그인의 버전 문자열은 `package.json`을 import하는 대신(그러면 전체 JSON 객체가 인라인됨) 수동으로 유지되는 `src/version.ts` 상수에 들어 있습니다. `version.ts`가 `package.json`과 동기화되지 않으면 `plugin.metadata-drift.test.ts` 가드가 실패하므로, 릴리스 시 둘을 함께 올리세요.

### 왜 `text/plain` MIME 타입인가?

브라우저는 다운로드 시 `.tsx` 소스를 의미 있게 렌더링할 수 없습니다——출력된 파일은 직접 렌더링용이 아니라 빌드 파이프라인으로의 개발자 핸드오프용입니다. `text/plain`은 "HTML로 미리보기" 가로채기 없이 모든 브라우저에서 다운로드가 트리거되도록 보장합니다.

### 함께 보기

- [`@anvilkit/plugin-export-html`](../plugin-export-html/README.md)——동일한 `PageIR`에 대한 독립형 HTML 출력.
- Anvilkit 문서 사이트의 `export-pipeline` 아키텍처 문서——공유 내보내기 플러그인 계약.
