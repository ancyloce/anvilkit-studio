# @anvilkit/section

バッジ、見出し、ハイライトテキスト、説明を備えた Puck ネイティブのセクションコンポーネント。

## インストール

```sh
pnpm add @anvilkit/section @anvilkit/ui @puckeditor/core
```

## スタイル

コンポーネントをレンダリングする前に、アプリのエントリポイントからパッケージのスタイルシートを一度インポートします。

```tsx
import "@anvilkit/section/styles.css";
```

Next.js では、このインポートを `app/layout.tsx` または `pages/_app.tsx` に追加します。

## 例

### 基本的な使い方

カスタムコピーでセクションをレンダリングします。`highlightedHeadline` はアニメーション付きのオーロラグラデーションで、プレーンな `headline` の隣にレンダリングされます。

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

### デフォルトコピー

`defaultProps` を介して同梱のマーケティングコピーをレンダリングします。

```tsx
import { Section, defaultProps } from "@anvilkit/section";

export function DefaultSection() {
  return <Section {...defaultProps} />;
}
```

### Puck の設定に登録する

エクスポートされた `componentConfig` を Puck の `Config` に組み込みます。

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

エクスポートされた `SectionProps` 型と Puck の `fields` スキーマから導出されます。

| Prop                  | Type     | Default                                              | Description                      |
| --------------------- | -------- | ---------------------------------------------------- | -------------------------------- |
| `badgeLabel`          | `string` | `"Scale"`                                            | 光沢のあるピル型バッジのテキスト。 |
| `headline`            | `string` | `"Stop writing boilerplate."`                        | プレーンな見出しテキスト。       |
| `highlightedHeadline` | `string` | `"Start building features."`                         | オーロラグラデーションの見出しアクセント。 |
| `description`         | `string` | `"Your AI agent handles repetitive coding tasks..."` | 補足的な説明。                   |

## テーマとレスポンシブ対応

shadcn の CSS 変数トークンを介してライトテーマとダークテーマをサポートします。モバイル、タブレット、デスクトップのブレークポイント全体でレスポンシブに対応します。
