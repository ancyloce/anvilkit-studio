# @anvilkit/statistics

ちらつくグリッド背景を備えた Puck ネイティブの統計ヘッダーコンポーネント。

## インストール

```sh
pnpm add @anvilkit/statistics @anvilkit/ui @puckeditor/core
```

## スタイル

コンポーネントをレンダリングする前に、アプリのエントリポイントからパッケージのスタイルシートを一度インポートします。

```tsx
import "@anvilkit/statistics/styles.css";
```

Next.js では、このインポートを `app/layout.tsx` または `pages/_app.tsx` に追加します。

## 例

### 基本的な使い方

アニメーショングリッドの上に、カスタムの大文字 `title` を使ってヘッダーをレンダリングします。

```tsx
import "@anvilkit/statistics/styles.css";
import { Statistics } from "@anvilkit/statistics";

export function Example() {
  return <Statistics title="Our Impact" />;
}
```

### デフォルトコピー

`defaultProps` を介して同梱のデフォルトタイトルをレンダリングします。

```tsx
import { Statistics, defaultProps } from "@anvilkit/statistics";

export function DefaultStatistics() {
  return <Statistics {...defaultProps} />;
}
```

### Puck の設定に登録する

エクスポートされた `componentConfig` を Puck の `Config` に組み込みます。

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

エクスポートされた `StatisticsProps` 型と Puck の `fields` スキーマから導出されます。

| Prop         | Type                            | Default        | Description                                                          |
| ------------ | ------------------------------- | -------------- | ------------------------------------------------------------------- |
| `title`      | `string`                        | `"Statistics"` | 大文字のヘッダータイトルテキスト。                                  |
| `dataSource` | `"static"` \| `"remote_csv"`    | `"static"`     | メトリクスの取得元：作成者が入力するか、ホストが解決する CSV か。   |
| `metrics`    | `StatisticsMetric[]`            | `[]`           | 解決されたメトリクス行（各行は `{ label, value }`）。               |
| `metrics[].label` | `string`                   | —              | メトリクスのラベル。                                                |
| `metrics[].value` | `string`                   | —              | メトリクスの値。                                                    |

## テーマとレスポンシブ対応

shadcn の CSS 変数トークンを介してライトテーマとダークテーマをサポートします。モバイル、タブレット、デスクトップのブレークポイント全体でレスポンシブに対応します。
