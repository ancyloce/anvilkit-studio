# @anvilkit/template-landing-agency

서비스 중심 에이전시 랜딩 페이지.

내비게이션 바, Hero, about 섹션, 서비스 그리드, 소셜 프루프 통계, 그리고 CTA 버튼.

![Landing — Agency preview](./preview.png)

## 설치

```sh
npx anvilkit init --template landing-agency my-site
```

## 구성

이 템플릿은 다음 컴포넌트 패키지로 구성됩니다.

- `@anvilkit/bento-grid`
- `@anvilkit/button`
- `@anvilkit/hero`
- `@anvilkit/navbar`
- `@anvilkit/section`
- `@anvilkit/statistics`

## 편집

표준 `PageIR` 트리는 `src/page-ir.json`에 커밋되어 있습니다. 이 패키지의 기본 내보내기는 해당 IR을 매니페스트 필드(slug, name, description, preview, package list)와 함께 `AnvilkitTemplate`으로 묶습니다.

`AnvilkitTemplate` 계약에 대해서는 `docs/decisions/003-core-templates-subpath.md`를 참조하세요.
