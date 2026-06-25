# @anvilkit/pricing-minimal

제목, 설명, 구성 가능한 플랜 카드를 갖춘 Puck 네이티브 가격 섹션.

## 설치

컴포넌트를 렌더링하기 전에 앱 진입점에서 패키지 스타일시트를 한 번 가져오세요.

```sh
pnpm add @anvilkit/pricing-minimal @anvilkit/ui @puckeditor/core
```

## 스타일

컴포넌트를 렌더링하기 전에 앱 진입점에서 패키지 스타일시트를 한 번 가져오세요.

```tsx
import "@anvilkit/pricing-minimal/styles.css";
```

Next.js에서는 이 import를 `app/layout.tsx` 또는 `pages/_app.tsx`에 추가하세요.

## 예

### 기본 사용법

`defaultProps`를 통해 동봉된 세 가지 플랜 예제로 섹션을 렌더링합니다.

```tsx
import "@anvilkit/pricing-minimal/styles.css";
import { PricingMinimal, defaultProps } from "@anvilkit/pricing-minimal";

export function Example() {
  return <PricingMinimal {...defaultProps} />;
}
```

### 추천 카드가 있는 커스텀 플랜

각 플랜은 `features` 목록과, 구분선 아래에 표시되는 선택적 `extraFeatures` 목록을 받습니다. `featured`와 `badgeLabel`을 설정하면 플랜을 강조할 수 있습니다.

```tsx
import { PricingMinimal } from "@anvilkit/pricing-minimal";

export function TwoTier() {
  return (
    <PricingMinimal
      headline="Pricing"
      description="Start free, upgrade when you grow."
      plans={[
        {
          name: "Starter",
          description: "For individuals",
          price: "$0",
          billingPeriodLabel: "forever",
          ctaLabel: "Get started",
          ctaHref: "/signup/starter",
          features: [{ label: "1 project" }, { label: "Community support" }],
        },
        {
          name: "Team",
          description: "For growing teams",
          price: "$29",
          billingPeriodLabel: "per month",
          ctaLabel: "Start trial",
          ctaHref: "/signup/team",
          featured: true,
          badgeLabel: "Popular",
          features: [
            { label: "Unlimited projects" },
            { label: "Priority support" },
          ],
          extraFeatures: [{ label: "SSO & SAML" }],
        },
      ]}
    />
  );
}
```

### Puck 설정에 등록

내보낸 `componentConfig`를 Puck `Config`에 연결합니다.

```tsx
import type { Config } from "@puckeditor/core";
import {
  componentConfig,
  type PricingMinimalProps,
} from "@anvilkit/pricing-minimal";

const config: Config<{ PricingMinimal: PricingMinimalProps }> = {
  components: {
    PricingMinimal: componentConfig,
  },
};
```

## API

내보낸 `PricingMinimalProps` 타입과 Puck `fields` 스키마에서 파생되었습니다.

| Prop                            | Type               | Default                              | Description                            |
| ------------------------------- | ------------------ | ------------------------------------ | -------------------------------------- |
| `headline`                      | `string`           | `"Simple, Transparent Pricing"`      | 섹션 제목.                             |
| `description`                   | `string`           | `"Choose a plan that works best..."` | 섹션 설명.                             |
| `plans`                         | `PricingPlan[]`    | _(3 example plans)_                  | 가격 플랜 카드.                        |
| `plans[].name`                  | `string`           | `"New plan"`                         | 플랜 이름.                             |
| `plans[].description`           | `string`           | —                                    | 플랜 설명.                             |
| `plans[].price`                 | `string`           | `"$0"`                               | 표시 가격.                             |
| `plans[].billingPeriodLabel`    | `string`           | `"per month"`                        | 청구 주기 텍스트.                      |
| `plans[].ctaLabel`              | `string`           | `"Get Started"`                      | CTA 버튼 레이블.                       |
| `plans[].ctaHref`               | `string`           | `""`                                 | CTA 버튼 링크.                         |
| `plans[].ctaOpenInNewTab`       | `boolean`          | `false`                              | CTA를 새 탭에서 엽니다.                |
| `plans[].featured`              | `boolean`          | `false`                              | 추천 플랜으로 강조합니다.              |
| `plans[].badgeLabel`            | `string`           | `""`                                 | 추천 플랜에 표시되는 배지 텍스트.      |
| `plans[].features`              | `PricingFeature[]` | —                                    | 기능 목록 항목.                        |
| `plans[].features[].label`      | `string`           | `"Feature"`                          | 기능 레이블.                           |
| `plans[].extraFeatures`         | `PricingFeature[]` | `[]`                                 | 구분선 아래의 추가 기능.               |
| `plans[].extraFeatures[].label` | `string`           | `"Extra feature"`                    | 추가 기능 레이블.                      |

## 테마 및 반응형

shadcn CSS 변수 토큰을 통해 라이트 및 다크 테마를 지원합니다. 모바일, 태블릿, 데스크톱 브레이크포인트 전반에서 반응형입니다. 플랜 카드는 모바일에서 세로로 쌓이고 더 넓은 뷰포트에서는 나란히 표시됩니다.
