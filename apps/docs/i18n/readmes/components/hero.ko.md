# @anvilkit/hero

줄무늬 다크 배경, 공지 필(pill), 두 개의 다운로드 CTA를 갖춘 Puck 네이티브 마케팅 hero 컴포넌트.

## 설치

```sh
pnpm add @anvilkit/hero @anvilkit/ui @puckeditor/core
```

## 스타일

컴포넌트를 렌더링하기 전에 앱 진입점에서 패키지 스타일시트를 한 번 가져오세요.

```tsx
import "@anvilkit/hero/styles.css";
```

Next.js에서는 이 import를 `app/layout.tsx` 또는 `pages/_app.tsx`에 추가하세요.

## 예

### 기본 사용법

사용자 정의 문구로 hero를 렌더링합니다. `headline`과 `description`은 줄바꿈(`\n`)을 지원합니다.

```tsx
import "@anvilkit/hero/styles.css";
import { Hero } from "@anvilkit/hero";

export function Example() {
  return (
    <Hero
      announcementLabel="Launching today"
      headline={"Build faster.\nShip sooner."}
      description="A modern toolkit for teams that move fast."
      linuxLabel="Download for Linux"
      linuxHref="/download/linux"
      windowsLabel="Download for Windows"
      windowsHref="/download/windows"
    />
  );
}
```

### 링크가 있는 공지 필(pill)

`announcementHref`를 설정하면 필이 링크로 바뀝니다. `announcementOpenInNewTab`은 새 탭에서 엽니다. 각 다운로드 CTA도 동일한 `href` / `openInNewTab` 쌍을 가집니다.

```tsx
import { Hero } from "@anvilkit/hero";

export function LaunchHero() {
  return (
    <Hero
      announcementLabel="We raised $69M pre seed"
      announcementHref="/blog/seed-round"
      announcementOpenInNewTab
      headline="Write fast with accurate precision."
      description="Our state of the art tool writes copy instantly."
      linuxLabel="Get the Linux build"
      linuxHref="/download/linux"
      windowsLabel="Get the Windows build"
      windowsHref="/download/windows"
      windowsOpenInNewTab
    />
  );
}
```

### Puck 설정에 등록

내보낸 `componentConfig`를 Puck `Config`에 연결합니다.

```tsx
import type { Config } from "@puckeditor/core";
import { componentConfig, type HeroProps } from "@anvilkit/hero";

const config: Config<{ Hero: HeroProps }> = {
  components: {
    Hero: componentConfig,
  },
};
```

## API

내보낸 `HeroProps` 타입과 Puck `fields` 스키마에서 파생되었습니다.

| Prop                       | Type      | Default                                  | Description                              |
| -------------------------- | --------- | ---------------------------------------- | ---------------------------------------- |
| `announcementLabel`        | `string`  | `"We raised $69M pre seed"`              | 공지 필 텍스트.                          |
| `announcementHref`         | `string`  | `""`                                     | 공지 링크 URL.                           |
| `announcementOpenInNewTab` | `boolean` | `false`                                  | 공지 링크를 새 탭에서 엽니다.            |
| `headline`                 | `string`  | `"Write fast with\naccurate precision."` | Hero 헤드라인(줄바꿈 지원).              |
| `description`              | `string`  | `"Our state of the art tool..."`         | Hero 설명(줄바꿈 지원).                  |
| `linuxLabel`               | `string`  | `"Download for Linux"`                   | Linux CTA 레이블.                        |
| `linuxHref`                | `string`  | `"/download/linux"`                      | Linux CTA 링크.                          |
| `linuxOpenInNewTab`        | `boolean` | `false`                                  | Linux CTA를 새 탭에서 엽니다.            |
| `windowsLabel`             | `string`  | `"Download for Windows"`                 | Windows CTA 레이블.                      |
| `windowsHref`              | `string`  | `"/download/windows"`                    | Windows CTA 링크.                        |
| `windowsOpenInNewTab`      | `boolean` | `false`                                  | Windows CTA를 새 탭에서 엽니다.          |

## 테마 및 반응형

shadcn CSS 변수 토큰을 통해 라이트 및 다크 테마를 지원합니다. 모바일, 태블릿, 데스크톱 브레이크포인트 전반에 걸쳐 반응형으로 동작합니다.
