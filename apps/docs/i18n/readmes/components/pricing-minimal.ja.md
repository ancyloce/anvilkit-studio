# @anvilkit/pricing-minimal

見出し、説明、設定可能なプランカードを備えた、Puck ネイティブの料金セクション。

## インストール

コンポーネントをレンダリングする前に、パッケージのスタイルシートをアプリのエントリポイントから一度だけインポートしてください。

```sh
pnpm add @anvilkit/pricing-minimal @anvilkit/ui @puckeditor/core
```

## スタイル

コンポーネントをレンダリングする前に、パッケージのスタイルシートをアプリのエントリポイントから一度だけインポートしてください。

```tsx
import "@anvilkit/pricing-minimal/styles.css";
```

Next.js では、このインポートを `app/layout.tsx` または `pages/_app.tsx` に追加してください。

## 例

### 基本的な使い方

`defaultProps` を使い、同梱の 3 プランの例でセクションをレンダリングします。

```tsx
import "@anvilkit/pricing-minimal/styles.css";
import { PricingMinimal, defaultProps } from "@anvilkit/pricing-minimal";

export function Example() {
  return <PricingMinimal {...defaultProps} />;
}
```

### おすすめカード付きのカスタムプラン

各プランは `features` リストと、区切り線の下に表示される省略可能な `extraFeatures` リストを受け取ります。`featured` と `badgeLabel` を設定すると、プランをハイライトできます。

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

### Puck 設定への登録

エクスポートされた `componentConfig` を Puck `Config` に組み込みます。

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

エクスポートされた `PricingMinimalProps` 型と Puck `fields` スキーマから導出されています。

| Prop                            | Type               | Default                              | Description                            |
| ------------------------------- | ------------------ | ------------------------------------ | -------------------------------------- |
| `headline`                      | `string`           | `"Simple, Transparent Pricing"`      | セクションの見出し。                   |
| `description`                   | `string`           | `"Choose a plan that works best..."` | セクションの説明。                     |
| `plans`                         | `PricingPlan[]`    | _(3 example plans)_                  | 料金プランのカード。                   |
| `plans[].name`                  | `string`           | `"New plan"`                         | プラン名。                             |
| `plans[].description`           | `string`           | —                                    | プランの説明。                         |
| `plans[].price`                 | `string`           | `"$0"`                               | 表示価格。                             |
| `plans[].billingPeriodLabel`    | `string`           | `"per month"`                        | 請求期間のテキスト。                   |
| `plans[].ctaLabel`              | `string`           | `"Get Started"`                      | CTA ボタンのラベル。                   |
| `plans[].ctaHref`               | `string`           | `""`                                 | CTA ボタンのリンク。                   |
| `plans[].ctaOpenInNewTab`       | `boolean`          | `false`                              | CTA を新しいタブで開きます。           |
| `plans[].featured`              | `boolean`          | `false`                              | おすすめプランとしてハイライトします。 |
| `plans[].badgeLabel`            | `string`           | `""`                                 | おすすめプランに表示されるバッジのテキスト。 |
| `plans[].features`              | `PricingFeature[]` | —                                    | 機能リストの項目。                     |
| `plans[].features[].label`      | `string`           | `"Feature"`                          | 機能のラベル。                         |
| `plans[].extraFeatures`         | `PricingFeature[]` | `[]`                                 | 区切り線の下に表示される追加機能。     |
| `plans[].extraFeatures[].label` | `string`           | `"Extra feature"`                    | 追加機能のラベル。                     |

## テーマとレスポンシブ対応

shadcn の CSS 変数トークンを介してライトテーマとダークテーマをサポートします。モバイル、タブレット、デスクトップの各ブレークポイントにわたってレスポンシブです。プランカードはモバイルでは縦に積み重なり、より広いビューポートでは横並びに表示されます。
