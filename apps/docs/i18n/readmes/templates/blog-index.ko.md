# @anvilkit/template-blog-index

블로그 랜딩 / 인덱스 페이지.

내비게이션 바, 섹션 제목, 그리고 페이지네이션된 글 목록.

![Blog Index preview](./preview.png)

## 설치

```sh
npx anvilkit init --template blog-index my-site
```

## 구성

이 템플릿은 다음 컴포넌트 패키지들을 조합합니다:

- `@anvilkit/blog-list`
- `@anvilkit/navbar`
- `@anvilkit/section`

## 편집

정규 `PageIR` 트리는 `src/page-ir.json`에 커밋되어 있습니다. 이 패키지의 기본 내보내기는 해당 IR을 매니페스트 필드(slug, name, description, preview, 패키지 목록)와 함께 `AnvilkitTemplate`으로 묶습니다.

`AnvilkitTemplate` 계약에 대해서는 `docs/decisions/003-core-templates-subpath.md`를 참조하세요.
