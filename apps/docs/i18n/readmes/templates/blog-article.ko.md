# @anvilkit/template-blog-article

단일 블로그 기사 페이지.

내비게이션 바, 풍부한 본문을 갖춘 기사 섹션, 그리고 하단의 관련 글 CTA 버튼.

![Blog Article preview](./preview.png)

## 설치

```sh
npx anvilkit init --template blog-article my-site
```

## 구성

이 템플릿은 다음 컴포넌트 패키지들을 조합합니다:

- `@anvilkit/button`
- `@anvilkit/navbar`
- `@anvilkit/section`

## 편집

정규 `PageIR` 트리는 `src/page-ir.json`에 커밋되어 있습니다. 이 패키지의 기본 내보내기는 해당 IR을 매니페스트 필드(slug, name, description, preview, 패키지 목록)와 함께 `AnvilkitTemplate`으로 묶습니다.

`AnvilkitTemplate` 계약에 대해서는 `docs/decisions/003-core-templates-subpath.md`를 참조하세요.
