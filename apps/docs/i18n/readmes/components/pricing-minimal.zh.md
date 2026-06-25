# @anvilkit/pricing-minimal

一个 Puck 原生的定价区块，包含主标题、描述以及可配置的方案卡片。

## 安装

将该包的样式表从应用入口处导入一次，然后再渲染该组件。

```sh
pnpm add @anvilkit/pricing-minimal @anvilkit/ui @puckeditor/core
```

## 样式

将该包的样式表从应用入口处导入一次，然后再渲染该组件。

```tsx
import "@anvilkit/pricing-minimal/styles.css";
```

在 Next.js 中，将该导入添加到 `app/layout.tsx` 或 `pages/_app.tsx`。

## 示例

### 基本用法

通过 `defaultProps` 使用内置的三方案示例渲染该区块。

```tsx
import "@anvilkit/pricing-minimal/styles.css";
import { PricingMinimal, defaultProps } from "@anvilkit/pricing-minimal";

export function Example() {
  return <PricingMinimal {...defaultProps} />;
}
```

### 带推荐卡片的自定义方案

每个方案接受一个 `features` 列表和一个可选的 `extraFeatures` 列表，后者显示在分隔线下方。设置 `featured` 加上 `badgeLabel` 即可高亮某个方案。

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

### 在 Puck 配置中注册

将导出的 `componentConfig` 接入 Puck `Config`。

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

派生自导出的 `PricingMinimalProps` 类型和 Puck `fields` schema。

| Prop                            | Type               | Default                              | Description                            |
| ------------------------------- | ------------------ | ------------------------------------ | -------------------------------------- |
| `headline`                      | `string`           | `"Simple, Transparent Pricing"`      | 区块主标题。                           |
| `description`                   | `string`           | `"Choose a plan that works best..."` | 区块描述。                             |
| `plans`                         | `PricingPlan[]`    | _(3 example plans)_                  | 定价方案卡片。                         |
| `plans[].name`                  | `string`           | `"New plan"`                         | 方案名称。                             |
| `plans[].description`           | `string`           | —                                    | 方案描述。                             |
| `plans[].price`                 | `string`           | `"$0"`                               | 显示价格。                             |
| `plans[].billingPeriodLabel`    | `string`           | `"per month"`                        | 计费周期文本。                         |
| `plans[].ctaLabel`              | `string`           | `"Get Started"`                      | CTA 按钮标签。                         |
| `plans[].ctaHref`               | `string`           | `""`                                 | CTA 按钮链接。                         |
| `plans[].ctaOpenInNewTab`       | `boolean`          | `false`                              | 在新标签页中打开 CTA。                 |
| `plans[].featured`              | `boolean`          | `false`                              | 高亮为推荐方案。                       |
| `plans[].badgeLabel`            | `string`           | `""`                                 | 显示在推荐方案上的徽章文本。           |
| `plans[].features`              | `PricingFeature[]` | —                                    | 功能列表项。                           |
| `plans[].features[].label`      | `string`           | `"Feature"`                          | 功能标签。                             |
| `plans[].extraFeatures`         | `PricingFeature[]` | `[]`                                 | 分隔线下方的附加功能。                 |
| `plans[].extraFeatures[].label` | `string`           | `"Extra feature"`                    | 附加功能标签。                         |

## 主题与响应式

通过 shadcn CSS 变量令牌支持浅色和深色主题。在移动端、平板和桌面端各断点下均可自适应。方案卡片在移动端纵向堆叠，在更宽的视口中并排显示。
