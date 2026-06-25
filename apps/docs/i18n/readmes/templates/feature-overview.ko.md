# @anvilkit/template-feature-overview

제품 기능 개요 페이지.

내비게이션 바, Hero, 벤토(bento) 기능 그리드, 통계, FAQ —— 제품 사이트의 `/features` 하위 페이지에 적합합니다.

![Feature Overview preview](./preview.png)

## 설치

```sh
npx anvilkit init --template feature-overview my-site
```

## 구성

이 템플릿은 다음 컴포넌트 패키지로 구성됩니다.

- `@anvilkit/bento-grid`
- `@anvilkit/helps`
- `@anvilkit/hero`
- `@anvilkit/navbar`
- `@anvilkit/statistics`

## 편집

표준 `PageIR` 트리는 `src/page-ir.json`에 커밋되어 있습니다. 이 패키지의 기본 내보내기는 해당 IR을 매니페스트 필드(slug, name, description, preview, package list)와 함께 `AnvilkitTemplate`으로 묶습니다.

`AnvilkitTemplate` 계약에 대해서는 `docs/decisions/003-core-templates-subpath.md`를 참조하세요.
