# @anvilkit/template-pricing-comparison

독립형 가격 페이지.

내비게이션 바, Hero 배너, 3단계 가격 그리드, 비교 FAQ —— `/pricing`을 그대로 대체할 수 있습니다.

![Pricing Comparison preview](./preview.png)

## 설치

```sh
npx anvilkit init --template pricing-comparison my-site
```

## 구성

이 템플릿은 다음 컴포넌트 패키지로 구성됩니다.

- `@anvilkit/helps`
- `@anvilkit/hero`
- `@anvilkit/navbar`
- `@anvilkit/pricing-minimal`

## 편집

표준 `PageIR` 트리는 `src/page-ir.json`에 커밋되어 있습니다. 이 패키지의 기본 내보내기는 해당 IR을 매니페스트 필드(slug, name, description, preview, package list)와 함께 `AnvilkitTemplate`으로 묶습니다.

`AnvilkitTemplate` 계약에 대해서는 `docs/decisions/003-core-templates-subpath.md`를 참조하세요.
