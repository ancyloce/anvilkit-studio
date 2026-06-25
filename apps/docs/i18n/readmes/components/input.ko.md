# @anvilkit/input

레이블, 헬퍼 텍스트, 검증 지원을 갖춘 Puck 네이티브 폼 입력 블록.

## 설치

```sh
pnpm add @anvilkit/input @anvilkit/ui @puckeditor/core
```

## 스타일

컴포넌트를 렌더링하기 전에 앱 진입점에서 패키지 스타일시트를 한 번 가져오세요.

```tsx
import "@anvilkit/input/styles.css";
```

Next.js에서는 이 import를 `app/layout.tsx` 또는 `pages/_app.tsx`에 추가하세요.

## 예

### 기본 사용법

플레이스홀더 텍스트가 있는 레이블이 지정된 이메일 입력을 렌더링합니다.

```tsx
import "@anvilkit/input/styles.css";
import { Input } from "@anvilkit/input";

export function Example() {
  return (
    <Input label="Email address" name="email" placeholder="Enter your email" />
  );
}
```

### 헬퍼 텍스트가 있는 필수 필드

입력의 `type`을 전환하고 `required`로 표시하며(레이블에 `*`를 추가하고 네이티브 `required` 속성을 설정), `helperText`로 안내를 제공합니다.

```tsx
import { Input } from "@anvilkit/input";

export function PasswordField() {
  return (
    <Input
      label="Password"
      name="password"
      type="password"
      placeholder="At least 8 characters"
      helperText="Use a mix of letters, numbers, and symbols."
      required
    />
  );
}
```

### Puck 설정에 등록

내보낸 `componentConfig`를 Puck `Config`에 연결하여 작성자가 해당 필드를 폼에 추가할 수 있도록 합니다.

```tsx
import type { Config } from "@puckeditor/core";
import { componentConfig, type InputProps } from "@anvilkit/input";

const config: Config<{ Input: InputProps }> = {
  components: {
    Input: componentConfig,
  },
};
```

## API

내보낸 `InputProps` 타입과 Puck `fields` 스키마에서 파생되었습니다.

| Prop           | Type                                                                      | Default                                          | Description                            |
| -------------- | ------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------- |
| `label`        | `string`                                                                  | `"Email address"`                                | 필드 레이블.                           |
| `name`         | `string`                                                                  | `"email"`                                        | 폼 필드 이름.                          |
| `type`         | `"text"` \| `"email"` \| `"password"` \| `"search"` \| `"tel"` \| `"url"` | `"email"`                                        | 입력 타입.                             |
| `placeholder`  | `string`                                                                  | `"Enter your email"`                             | 플레이스홀더 텍스트.                   |
| `helperText`   | `string`                                                                  | `"We will only use this for important updates."` | 필드 아래에 표시되는 헬퍼 텍스트.      |
| `defaultValue` | `string`                                                                  | `""`                                             | 초기 비제어 값.                        |
| `required`     | `boolean`                                                                 | `false`                                          | 필드를 필수로 표시합니다(`*` 추가).    |
| `disabled`     | `boolean`                                                                 | `false`                                          | 필드를 비활성화합니다.                 |

## 테마 및 반응형

shadcn CSS 변수 토큰을 통해 라이트 및 다크 테마를 지원합니다. 모바일, 태블릿, 데스크톱 브레이크포인트 전반에 걸쳐 반응형으로 동작합니다.
