# @anvilkit/template-about

소개 / 미션 페이지.

내비게이션 바, 히어로, 미션 섹션, 통계, 그리고 고객 로고 클라우드.

![About preview](./preview.png)

## 설치

```sh
npx anvilkit init --template about my-site
```

## 구성

이 템플릿은 다음 컴포넌트 패키지들을 조합합니다:

- `@anvilkit/hero`
- `@anvilkit/logo-clouds`
- `@anvilkit/navbar`
- `@anvilkit/section`
- `@anvilkit/statistics`

## 편집

정규 `PageIR` 트리는 `src/page-ir.json`에 커밋되어 있습니다. 이 패키지의 기본 내보내기는 해당 IR을 매니페스트 필드(slug, name, description, preview, 패키지 목록)와 함께 `AnvilkitTemplate`으로 묶습니다.

`AnvilkitTemplate` 계약에 대해서는 `docs/decisions/003-core-templates-subpath.md`를 참조하세요.
