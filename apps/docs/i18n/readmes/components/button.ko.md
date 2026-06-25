# @anvilkit/button

변형(variant)과 링크를 지원하는 Puck 네이티브 버튼 블록.

## 설치

```sh
pnpm add @anvilkit/button @anvilkit/ui @puckeditor/core
```

## 스타일

컴포넌트를 렌더링하기 전에, 앱 진입점에서 패키지 스타일시트를 한 번 가져오세요.

```tsx
import "@anvilkit/button/styles.css";
```

Next.js에서는 이 import를 `app/layout.tsx` 또는 `pages/_app.tsx`에 추가하세요.

## 예

### 기본 사용법

기본 primary 변형으로 버튼을 단독으로 렌더링합니다.

```tsx
import "@anvilkit/button/styles.css";
import { Button } from "@anvilkit/button";

export function Example() {
  return <Button label="Save changes" variant="primary" />;
}
```

### 새 탭에서 여는 링크 버튼

`href`를 제공하면 앵커가 렌더링됩니다. `openInNewTab`과 함께 사용하면 `target="_blank"`와 안전한 `rel` 속성이 추가됩니다. `disabled` 버튼은 상호작용할 수 없으며 `aria-disabled`를 알립니다.

```tsx
import { Button } from "@anvilkit/button";

export function Actions() {
  return (
    <div className="flex gap-3">
      <Button
        label="Read the docs"
        variant="secondary"
        href="https://anvilkit.dev"
        openInNewTab
      />
      <Button label="Coming soon" variant="primary" disabled />
    </div>
  );
}
```

### Puck 설정에 등록

작성자가 버튼을 페이지에 드롭할 수 있도록, 내보낸 `componentConfig`를 Puck의 `Config`에 연결합니다.

```tsx
import type { Config } from "@puckeditor/core";
import { componentConfig, type ButtonProps } from "@anvilkit/button";

const config: Config<{ Button: ButtonProps }> = {
  components: {
    Button: componentConfig,
  },
};
```

## API

내보낸 `ButtonProps` 타입과 Puck `fields` 스키마에서 파생되었습니다.

| Prop           | Type                         | Default          | Description                                                  |
| -------------- | ---------------------------- | ---------------- | ----------------------------------------------------------- |
| `label`        | `string`                     | `"Save changes"` | 버튼 라벨 텍스트.                                           |
| `variant`      | `"primary"` \| `"secondary"` | `"primary"`      | 시각적 변형.                                                |
| `href`         | `string`                     | `""`             | 링크 URL. 설정하면 앵커가 렌더링됨.                         |
| `openInNewTab` | `boolean`                    | `false`          | 새 탭에서 링크 열기.                                        |
| `disabled`     | `boolean`                    | `false`          | 상호작용 비활성화.                                          |
| `trackClick`   | `boolean`                    | `false`          | 클릭 시 분석 이벤트 발생(분석 제공자 필요).                 |
| `eventName`    | `string`                     | —                | 이벤트 이름. 기본값은 `button_click`.                       |
| `eventProps`   | `{ category?: string; placement?: string }` | — | 클릭 이벤트에 병합되는 추가 프로퍼티.                       |

## 테마 및 반응형

shadcn CSS 변수 토큰을 통해 라이트 및 다크 테마를 지원합니다. 모바일, 태블릿, 데스크톱 브레이크포인트 전반에서 반응형으로 동작합니다.
