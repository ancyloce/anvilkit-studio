# @anvilkit/template-landing-saas

전환에 중점을 둔 SaaS 랜딩 페이지.

내비게이션 바, Hero, logo cloud, 벤토(bento) 기능 그리드, 가격, 통계, FAQ —— 일반적인 SaaS 홈페이지에 필요한 전체 구성.

![Landing — SaaS preview](./preview.png)

## 설치

```sh
npx anvilkit init --template landing-saas my-site
```

## 구성

이 템플릿은 다음 컴포넌트 패키지로 구성됩니다.

- `@anvilkit/bento-grid`
- `@anvilkit/helps`
- `@anvilkit/hero`
- `@anvilkit/logo-clouds`
- `@anvilkit/navbar`
- `@anvilkit/pricing-minimal`
- `@anvilkit/statistics`

## 편집

표준 `PageIR` 트리는 `src/page-ir.json`에 커밋되어 있습니다. 이 패키지의 기본 내보내기는 해당 IR을 매니페스트 필드(slug, name, description, preview, package list)와 함께 `AnvilkitTemplate`으로 묶습니다.

`AnvilkitTemplate` 계약에 대해서는 `docs/decisions/003-core-templates-subpath.md`를 참조하세요.
