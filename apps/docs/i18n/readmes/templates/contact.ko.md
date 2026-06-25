# @anvilkit/template-contact

문의하기 페이지.

내비게이션 바, 카피가 있는 섹션, 인라인 이메일 + 메시지 입력란, 그리고 제출 버튼. 폼 핸들러는 연결되어 있지 않습니다 — 사용자가 직접 연결합니다.

![Contact preview](./preview.png)

## 설치

```sh
npx anvilkit init --template contact my-site
```

## 구성

이 템플릿은 다음 컴포넌트 패키지들을 조합합니다:

- `@anvilkit/button`
- `@anvilkit/input`
- `@anvilkit/navbar`
- `@anvilkit/section`

## 편집

정규 `PageIR` 트리는 `src/page-ir.json`에 커밋되어 있습니다. 이 패키지의 기본 내보내기는 해당 IR을 매니페스트 필드(slug, name, description, preview, 패키지 목록)와 함께 `AnvilkitTemplate`으로 묶습니다.

`AnvilkitTemplate` 계약에 대해서는 `docs/decisions/003-core-templates-subpath.md`를 참조하세요.
