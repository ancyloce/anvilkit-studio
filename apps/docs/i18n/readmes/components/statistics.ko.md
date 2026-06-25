# @anvilkit/statistics

깜박이는 그리드 배경을 갖춘 Puck 네이티브 통계 헤더 컴포넌트.

## 설치

```sh
pnpm add @anvilkit/statistics @anvilkit/ui @puckeditor/core
```

## 스타일

컴포넌트를 렌더링하기 전에 앱 진입점에서 패키지 스타일시트를 한 번 가져옵니다.

```tsx
import "@anvilkit/statistics/styles.css";
```

Next.js에서는 이 import를 `app/layout.tsx` 또는 `pages/_app.tsx`에 추가합니다.

## 예제

### 기본 사용법

애니메이션 그리드 위에 사용자 지정 대문자 `title`로 헤더를 렌더링합니다.

```tsx
import "@anvilkit/statistics/styles.css";
import { Statistics } from "@anvilkit/statistics";

export function Example() {
  return <Statistics title="Our Impact" />;
}
```

### 기본 문구

`defaultProps`를 통해 번들된 기본 제목을 렌더링합니다.

```tsx
import { Statistics, defaultProps } from "@anvilkit/statistics";

export function DefaultStatistics() {
  return <Statistics {...defaultProps} />;
}
```

### Puck 설정에 등록하기

내보낸 `componentConfig`를 Puck `Config`에 연결합니다.

```tsx
import type { Config } from "@puckeditor/core";
import { componentConfig, type StatisticsProps } from "@anvilkit/statistics";

const config: Config<{ Statistics: StatisticsProps }> = {
  components: {
    Statistics: componentConfig,
  },
};
```

## API

내보낸 `StatisticsProps` 타입과 Puck `fields` 스키마에서 파생됩니다.

| Prop         | Type                            | Default        | Description                                                          |
| ------------ | ------------------------------- | -------------- | ------------------------------------------------------------------- |
| `title`      | `string`                        | `"Statistics"` | 대문자 헤더 제목 텍스트.                                            |
| `dataSource` | `"static"` \| `"remote_csv"`    | `"static"`     | 메트릭의 출처: 작성자가 입력하거나 호스트가 해석한 CSV.            |
| `metrics`    | `StatisticsMetric[]`            | `[]`           | 해석된 메트릭 행(각 행은 `{ label, value }`).                       |
| `metrics[].label` | `string`                   | —              | 메트릭 레이블.                                                      |
| `metrics[].value` | `string`                   | —              | 메트릭 값.                                                          |

## 테마 및 반응형

shadcn CSS 변수 토큰을 통해 라이트 및 다크 테마를 지원합니다. 모바일, 태블릿, 데스크톱 브레이크포인트 전반에 걸쳐 반응형으로 작동합니다.
