# @anvilkit/section

배지, 헤드라인, 강조 텍스트, 설명을 갖춘 Puck 네이티브 섹션 컴포넌트.

## 설치

```sh
pnpm add @anvilkit/section @anvilkit/ui @puckeditor/core
```

## 스타일

컴포넌트를 렌더링하기 전에 앱 진입점에서 패키지 스타일시트를 한 번 가져옵니다.

```tsx
import "@anvilkit/section/styles.css";
```

Next.js에서는 이 import를 `app/layout.tsx` 또는 `pages/_app.tsx`에 추가합니다.

## 예제

### 기본 사용법

사용자 지정 문구로 섹션을 렌더링합니다. `highlightedHeadline`은 일반 `headline` 옆에 애니메이션 오로라 그라데이션으로 렌더링됩니다.

```tsx
import "@anvilkit/section/styles.css";
import { Section } from "@anvilkit/section";

export function Example() {
  return (
    <Section
      badgeLabel="Scale"
      headline="Stop writing boilerplate."
      highlightedHeadline="Start building features."
      description="Your AI agent handles repetitive coding tasks."
    />
  );
}
```

### 기본 문구

`defaultProps`를 통해 번들된 마케팅 문구를 렌더링합니다.

```tsx
import { Section, defaultProps } from "@anvilkit/section";

export function DefaultSection() {
  return <Section {...defaultProps} />;
}
```

### Puck 설정에 등록하기

내보낸 `componentConfig`를 Puck `Config`에 연결합니다.

```tsx
import type { Config } from "@puckeditor/core";
import { componentConfig, type SectionProps } from "@anvilkit/section";

const config: Config<{ Section: SectionProps }> = {
  components: {
    Section: componentConfig,
  },
};
```

## API

내보낸 `SectionProps` 타입과 Puck `fields` 스키마에서 파생됩니다.

| Prop                  | Type     | Default                                              | Description                      |
| --------------------- | -------- | ---------------------------------------------------- | -------------------------------- |
| `badgeLabel`          | `string` | `"Scale"`                                            | 반짝이는 알약형 배지 텍스트.     |
| `headline`            | `string` | `"Stop writing boilerplate."`                        | 일반 헤드라인 텍스트.            |
| `highlightedHeadline` | `string` | `"Start building features."`                         | 오로라 그라데이션 헤드라인 강조. |
| `description`         | `string` | `"Your AI agent handles repetitive coding tasks..."` | 보조 설명.                       |

## 테마 및 반응형

shadcn CSS 변수 토큰을 통해 라이트 및 다크 테마를 지원합니다. 모바일, 태블릿, 데스크톱 브레이크포인트 전반에 걸쳐 반응형으로 작동합니다.
