# @anvilkit/hero

ストライプのダークな背景、アナウンスメントピル、2 つのダウンロード CTA を備えた Puck ネイティブのマーケティング hero コンポーネント。

## インストール

```sh
pnpm add @anvilkit/hero @anvilkit/ui @puckeditor/core
```

## スタイル

コンポーネントをレンダリングする前に、アプリのエントリポイントからパッケージのスタイルシートを一度インポートしてください。

```tsx
import "@anvilkit/hero/styles.css";
```

Next.js では、このインポートを `app/layout.tsx` または `pages/_app.tsx` に追加します。

## 例

### 基本的な使い方

カスタムコピーで hero をレンダリングします。`headline` と `description` は改行（`\n`）に対応します。

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

### リンク付きアナウンスメントピル

`announcementHref` を設定するとピルがリンクになります。`announcementOpenInNewTab` を指定すると新しいタブで開きます。各ダウンロード CTA も同じ `href` / `openInNewTab` のペアを持ちます。

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

### Puck 設定への登録

エクスポートされた `componentConfig` を Puck `Config` に組み込みます。

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

エクスポートされた `HeroProps` 型と Puck `fields` スキーマから導出されています。

| Prop                       | Type      | Default                                  | Description                              |
| -------------------------- | --------- | ---------------------------------------- | ---------------------------------------- |
| `announcementLabel`        | `string`  | `"We raised $69M pre seed"`              | アナウンスメントピルのテキスト。         |
| `announcementHref`         | `string`  | `""`                                     | アナウンスメントのリンク URL。           |
| `announcementOpenInNewTab` | `boolean` | `false`                                  | アナウンスメントのリンクを新しいタブで開きます。 |
| `headline`                 | `string`  | `"Write fast with\naccurate precision."` | Hero の見出し（改行に対応）。            |
| `description`              | `string`  | `"Our state of the art tool..."`         | Hero の説明文（改行に対応）。            |
| `linuxLabel`               | `string`  | `"Download for Linux"`                   | Linux CTA のラベル。                     |
| `linuxHref`                | `string`  | `"/download/linux"`                      | Linux CTA のリンク。                     |
| `linuxOpenInNewTab`        | `boolean` | `false`                                  | Linux CTA を新しいタブで開きます。       |
| `windowsLabel`             | `string`  | `"Download for Windows"`                 | Windows CTA のラベル。                   |
| `windowsHref`              | `string`  | `"/download/windows"`                    | Windows CTA のリンク。                   |
| `windowsOpenInNewTab`      | `boolean` | `false`                                  | Windows CTA を新しいタブで開きます。     |

## テーマとレスポンシブ対応

shadcn CSS 変数トークンによりライトテーマとダークテーマに対応します。モバイル、タブレット、デスクトップのブレークポイント全体でレスポンシブに対応します。
