# @anvilkit/helps

아바타 스택, 메시지, 액션 버튼을 갖춘 Puck 네이티브 기여자 CTA 블록.

## 설치

```sh
pnpm add @anvilkit/helps @anvilkit/ui @puckeditor/core
```

## 스타일

컴포넌트를 렌더링하기 전에 앱 진입점에서 패키지 스타일시트를 한 번 가져오세요.

```tsx
import "@anvilkit/helps/styles.css";
```

Next.js에서는 이 import를 `app/layout.tsx` 또는 `pages/_app.tsx`에 추가하세요.

## 예

### 기본 사용법

`defaultProps`를 통해 번들된 예시 아바타로 CTA를 렌더링합니다.

```tsx
import "@anvilkit/helps/styles.css";
import { Helps, defaultProps } from "@anvilkit/helps";

export function Example() {
  return (
    <Helps
      message="Join our open-source community today."
      buttonLabel="Get started"
      buttonHref="/contribute"
      avatars={defaultProps.avatars}
    />
  );
}
```

### 이니셜 전용 아바타

`imageUrl`이 제공되지 않으면 각 아바타는 `initials`(또는 `name`에서 파생된 이니셜)로 폴백됩니다.

```tsx
import { Helps } from "@anvilkit/helps";

export function ContributorWall() {
  return (
    <Helps
      message={"We're grateful for our contributors."}
      buttonLabel="Become a contributor"
      buttonHref="https://github.com/example/repo"
      buttonOpenInNewTab
      avatars={[
        { name: "Alice Johnson", initials: "AJ" },
        { name: "Bob Brown", initials: "BB" },
        { name: "Charlie Davis" },
      ]}
    />
  );
}
```

### Puck 설정에 등록

내보낸 `componentConfig`를 Puck `Config`에 연결합니다.

```tsx
import type { Config } from "@puckeditor/core";
import { componentConfig, type HelpsProps } from "@anvilkit/helps";

const config: Config<{ Helps: HelpsProps }> = {
  components: {
    Helps: componentConfig,
  },
};
```

## API

내보낸 `HelpsProps` 타입과 Puck `fields` 스키마에서 파생되었습니다.

| Prop                 | Type            | Default                     | Description                              |
| -------------------- | --------------- | --------------------------- | ---------------------------------------- |
| `message`            | `string`        | _(커뮤니티 감사 문구)_      | CTA 메시지 텍스트(줄바꿈 지원).          |
| `buttonLabel`        | `string`        | `"Become a contributor"`    | 액션 버튼 레이블.                        |
| `buttonHref`         | `string`        | `"/contribute"`             | 액션 버튼 링크.                          |
| `buttonOpenInNewTab` | `boolean`       | `false`                     | 링크를 새 탭에서 엽니다.                 |
| `avatars`            | `HelpsAvatar[]` | _(5개의 예시 아바타)_       | 기여자 아바타 스택.                      |
| `avatars[].name`     | `string`        | `"New contributor"`         | 기여자 이름(툴팁에 표시됨).              |
| `avatars[].imageUrl` | `string`        | `""`                        | 아바타 이미지 URL.                       |
| `avatars[].initials` | `string`        | `"NC"`                      | 이미지가 설정되지 않은 경우의 폴백 이니셜. |

## 테마 및 반응형

shadcn CSS 변수 토큰을 통해 라이트 및 다크 테마를 지원합니다. 모바일, 태블릿, 데스크톱 브레이크포인트 전반에 걸쳐 반응형으로 동작합니다.
