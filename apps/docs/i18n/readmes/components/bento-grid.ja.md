# @anvilkit/bento-grid

Puck ネイティブの Bento Grid コンポーネント。モバイル/タブレット/デスクトップに適応するレイアウト、組み込みのライト/ダークテーマ、Puck 向けのシリアライズ可能な `items` API、そして直接組み合わせて使えるエクスポート済みの `BentoCard` プリミティブを備えています。

## インストール

```sh
pnpm add @anvilkit/bento-grid @puckeditor/core
```

## スタイル

コンポーネントをレンダリングする前に、アプリのエントリポイントからパッケージのスタイルシートを一度インポートします。

```tsx
import "@anvilkit/bento-grid/styles.css";
```

Next.js では、このインポートを `app/layout.tsx` または `pages/_app.tsx` に追加します。

## 例

### 基本的な使い方

`defaultProps` を使って、同梱されたサンプルカードでグリッドをレンダリングします。

```tsx
import "@anvilkit/bento-grid/styles.css";
import { BentoGrid, defaultProps } from "@anvilkit/bento-grid";

export function Example() {
  return <BentoGrid {...defaultProps} />;
}
```

### テーマ設定と `BentoCard` の直接的な組み合わせ

`theme` と `platform` を設定し、シリアライズ可能な `items` 配列の代わりに `BentoCard` の子要素を渡して、各セルを完全に制御します。

```tsx
import { BentoCard, BentoGrid } from "@anvilkit/bento-grid";

export function CustomCards() {
  return (
    <BentoGrid theme="light" platform="tablet">
      <BentoCard size="wide">
        <h2 className="text-xl font-medium text-card-foreground">
          Custom card
        </h2>
        <p className="text-sm text-muted-foreground">
          Use BentoCard for fully custom cell content.
        </p>
      </BentoCard>
    </BentoGrid>
  );
}
```

### Puck 設定への登録

エクスポートされた `componentConfig` を Puck の `Config` に組み込みます。

```tsx
import type { Config } from "@puckeditor/core";
import { componentConfig, type BentoGridProps } from "@anvilkit/bento-grid";

const config: Config<{ BentoGrid: BentoGridProps }> = {
  components: {
    BentoGrid: componentConfig,
  },
};
```

## API

エクスポートされた `BentoGridProps` 型と Puck の `fields` スキーマから導出されています。

| Prop                      | Type                                                                   | Default             | Description                |
| ------------------------- | ---------------------------------------------------------------------- | ------------------- | -------------------------- |
| `theme`                   | `"system"` \| `"light"` \| `"dark"`                                    | `"dark"`            | カラーテーマ。             |
| `platform`                | `"adaptive"` \| `"mobile"` \| `"tablet"` \| `"desktop"`                | `"adaptive"`        | プラットフォームレイアウト。 |
| `items`                   | `BentoGridItem[]`                                                      | _(6 枚のサンプルカード)_ | グリッドのカード。         |
| `items[].icon`            | `"brain"` \| `"users"` \| `"plug"` \| `"globe"` \| `"code"` \| `"zap"` | `"brain"`           | カードのアイコン。         |
| `items[].title`           | `string`                                                               | `"Card title"`      | カードのタイトル。         |
| `items[].description`     | `string`                                                               | —                   | カードの説明。             |
| `items[].size`            | `"default"` \| `"wide"` \| `"tall"`                                    | `"default"`         | カードのスパンサイズ。     |
| `items[].rounded`         | `boolean`                                                              | `false`             | 角丸。                     |
| `items[].background`      | `boolean`                                                              | `true`              | 装飾的な背景。             |
| `items[].ctaLabel`        | `string`                                                               | `"Learn more >"`    | CTA のラベル。             |
| `items[].ctaHref`         | `string`                                                               | `"#"`               | CTA のリンク先。           |
| `items[].ctaOpenInNewTab` | `boolean`                                                              | `false`             | CTA を新しいタブで開く。   |

> コンポーネントには `children` と `className` も直接渡せます。
> `BentoCard` の子要素を渡すと、シリアライズ可能な `items` 配列を回避できます。

## テーマとレスポンシブ対応

`theme` プロパティと shadcn の CSS 変数トークンを通じて、ライトテーマとダークテーマをサポートします。`platform` プロパティはレイアウトを制御します。`adaptive` は、ビューポートの幅に基づいてモバイル、タブレット、デスクトップのグリッドレイアウトを自動的に切り替えます。
