# @anvilkit/button

バリアントとリンクをサポートする Puck ネイティブのボタンブロック。

## インストール

```sh
pnpm add @anvilkit/button @anvilkit/ui @puckeditor/core
```

## スタイル

コンポーネントをレンダリングする前に、アプリのエントリポイントからパッケージのスタイルシートを一度インポートします。

```tsx
import "@anvilkit/button/styles.css";
```

Next.js では、このインポートを `app/layout.tsx` または `pages/_app.tsx` に追加します。

## 例

### 基本的な使い方

デフォルトの primary バリアントで、ボタンを単独でレンダリングします。

```tsx
import "@anvilkit/button/styles.css";
import { Button } from "@anvilkit/button";

export function Example() {
  return <Button label="Save changes" variant="primary" />;
}
```

### 新しいタブで開くリンクボタン

`href` を指定するとアンカーがレンダリングされます。`openInNewTab` と組み合わせると、`target="_blank"` と安全な `rel` 属性が追加されます。`disabled` のボタンは操作不能になり、`aria-disabled` をアナウンスします。

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

### Puck 設定への登録

作成者がボタンをページにドロップできるように、エクスポートされた `componentConfig` を Puck の `Config` に組み込みます。

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

エクスポートされた `ButtonProps` 型と Puck の `fields` スキーマから導出されています。

| Prop           | Type                         | Default          | Description                                                  |
| -------------- | ---------------------------- | ---------------- | ----------------------------------------------------------- |
| `label`        | `string`                     | `"Save changes"` | ボタンのラベルテキスト。                                    |
| `variant`      | `"primary"` \| `"secondary"` | `"primary"`      | ビジュアルバリアント。                                      |
| `href`         | `string`                     | `""`             | リンク URL。設定するとアンカーがレンダリングされる。        |
| `openInNewTab` | `boolean`                    | `false`          | リンクを新しいタブで開く。                                  |
| `disabled`     | `boolean`                    | `false`          | 操作を無効化する。                                          |
| `trackClick`   | `boolean`                    | `false`          | クリック時に分析イベントを発火する（分析プロバイダーが必要）。 |
| `eventName`    | `string`                     | —                | イベント名。デフォルトは `button_click`。                   |
| `eventProps`   | `{ category?: string; placement?: string }` | — | クリックイベントにマージされる追加プロパティ。              |

## テーマとレスポンシブ対応

shadcn の CSS 変数トークンを通じて、ライトテーマとダークテーマをサポートします。モバイル、タブレット、デスクトップのブレークポイント全体でレスポンシブに対応します。
