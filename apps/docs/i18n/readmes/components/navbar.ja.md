# @anvilkit/navbar

ロゴ、ナビゲーション項目、アクションボタンを備えた、Puck ネイティブのナビゲーションバーレイアウトコンポーネント。

## インストール

コンポーネントをレンダリングする前に、パッケージのスタイルシートをアプリのエントリポイントから一度だけインポートしてください。

```sh
pnpm add @anvilkit/navbar @anvilkit/ui @puckeditor/core
```

## スタイル

コンポーネントをレンダリングする前に、パッケージのスタイルシートをアプリのエントリポイントから一度だけインポートしてください。

```tsx
import "@anvilkit/navbar/styles.css";
```

Next.js では、このインポートを `app/layout.tsx` または `pages/_app.tsx` に追加してください。

## 例

### 基本的な使い方

テキストロゴ、いくつかのリンク、単一の行動喚起。`active` href が一致するメニュー項目をハイライトします。

```tsx
import "@anvilkit/navbar/styles.css";
import { Navbar } from "@anvilkit/navbar";

export function Example() {
  return (
    <Navbar
      logo={{ type: "text", text: "Acme", href: "/" }}
      items={[
        { label: "Overview", href: "/overview" },
        { label: "Features", href: "/features" },
      ]}
      actions={[{ label: "Sign up", href: "/signup", variant: "secondary" }]}
      active="/features"
    />
  );
}
```

### 画像ロゴと複数のアクション

ロゴを `image` に切り替え、異なるバリアントとサイズを持つ複数のアクションをレンダリングします。

```tsx
import { Navbar } from "@anvilkit/navbar";

export function MarketingNav() {
  return (
    <Navbar
      logo={{ type: "image", imageUrl: "/logo.svg", alt: "Acme", href: "/" }}
      items={[
        { label: "Product", href: "/product" },
        { label: "Pricing", href: "/pricing" },
      ]}
      actions={[
        { label: "Log in", href: "/login", variant: "ghost", size: "default" },
        {
          label: "Get started",
          href: "/signup",
          variant: "default",
          size: "lg",
        },
      ]}
      active="/pricing"
    />
  );
}
```

### Puck 設定への登録

エクスポートされた `componentConfig` を Puck `Config` に組み込みます。

```tsx
import type { Config } from "@puckeditor/core";
import { componentConfig, type NavbarProps } from "@anvilkit/navbar";

const config: Config<{ Navbar: NavbarProps }> = {
  components: {
    Navbar: componentConfig,
  },
};
```

## API

エクスポートされた `NavbarProps` 型と Puck `fields` スキーマから導出されています。

| Prop                     | Type                                                                                    | Default              | Description                          |
| ------------------------ | --------------------------------------------------------------------------------------- | -------------------- | ------------------------------------ |
| `logo`                   | `object`                                                                                | _(text logo)_        | ロゴの設定。                         |
| `logo.type`              | `"text"` \| `"image"`                                                                   | `"text"`             | ロゴをテキストまたは画像としてレンダリングします。 |
| `logo.text`              | `string`                                                                                | `"Underline"`        | 表示テキスト（type が `text` の場合）。 |
| `logo.imageUrl`          | `string`                                                                                | `""`                 | 画像 URL（type が `image` の場合）。 |
| `logo.alt`               | `string`                                                                                | `"Underline"`        | 画像の alt テキスト。                |
| `logo.href`              | `string`                                                                                | `"/"`                | ロゴのリンク URL。                   |
| `items`                  | `NavbarMenuItem[]`                                                                      | _(5 example links)_  | ナビゲーションメニュー項目。         |
| `items[].label`          | `string`                                                                                | `"New link"`         | メニュー項目のラベル。               |
| `items[].href`           | `string`                                                                                | `"/"`                | メニュー項目のリンク。               |
| `actions`                | `NavbarAction[]`                                                                        | _(1 example action)_ | アクションボタン。                   |
| `actions[].label`        | `string`                                                                                | `"Action"`           | ボタンのラベル。                     |
| `actions[].href`         | `string`                                                                                | `""`                 | ボタンのリンク。                     |
| `actions[].variant`      | `"default"` \| `"secondary"` \| `"outline"` \| `"ghost"` \| `"link"` \| `"destructive"` | `"secondary"`        | ボタンのバリアント。                 |
| `actions[].size`         | `"sm"` \| `"default"` \| `"lg"`                                                         | `"lg"`               | ボタンのサイズ。                     |
| `actions[].openInNewTab` | `boolean`                                                                               | `false`              | リンクを新しいタブで開きます。       |
| `actions[].disabled`     | `boolean`                                                                               | `false`              | アクションボタンを無効化します。     |
| `active`                 | `string`                                                                                | `"/features"`        | 現在アクティブな項目の href。        |

## テーマとレスポンシブ対応

shadcn の CSS 変数トークンを介してライトテーマとダークテーマをサポートします。モバイル、タブレット、デスクトップの各ブレークポイントにわたってレスポンシブです。モバイルではハンバーガーメニューに折りたたまれます。
