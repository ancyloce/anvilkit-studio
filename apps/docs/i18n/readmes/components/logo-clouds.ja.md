# @anvilkit/logo-clouds

きらめく見出しとスクロールする Devicon ロゴのマーキーを備えた、Puck ネイティブのロゴクラウドコンポーネント。

## インストール

コンポーネントをレンダリングする前に、パッケージのスタイルシートをアプリのエントリポイントから一度だけインポートしてください。

```sh
pnpm add @anvilkit/logo-clouds @anvilkit/ui @puckeditor/core
```

## スタイル

コンポーネントをレンダリングする前に、パッケージのスタイルシートをアプリのエントリポイントから一度だけインポートしてください。

```tsx
import "@anvilkit/logo-clouds/styles.css";
```

Next.js では、このインポートを `app/layout.tsx` または `pages/_app.tsx` に追加してください。

## 例

### 基本的な使い方

`defaultProps` を使い、デフォルトのコピーでセクションをレンダリングします。

```tsx
import "@anvilkit/logo-clouds/styles.css";
import { LogoClouds, defaultProps } from "@anvilkit/logo-clouds";

export function Example() {
  return <LogoClouds {...defaultProps} />;
}
```

### カスタム見出しとサブタイトル

きらめく見出しは `title` で制御されます。`subtitle` はその下に補足のコピーをレンダリングします。スクロールするロゴのマーキーは組み込みです。

```tsx
import { LogoClouds } from "@anvilkit/logo-clouds";

export function TrustedBy() {
  return (
    <LogoClouds
      title="Trusted by builders"
      subtitle="Teams of every size ship polished products with our stack."
    />
  );
}
```

### Puck 設定への登録

エクスポートされた `componentConfig` を Puck `Config` に組み込みます。

```tsx
import type { Config } from "@puckeditor/core";
import { componentConfig, type LogoCloudsProps } from "@anvilkit/logo-clouds";

const config: Config<{ LogoClouds: LogoCloudsProps }> = {
  components: {
    LogoClouds: componentConfig,
  },
};
```

## API

エクスポートされた `LogoCloudsProps` 型と Puck `fields` スキーマから導出されています。

| Prop       | Type     | Default             | Description                        |
| ---------- | -------- | ------------------- | ---------------------------------- |
| `title`    | `string` | `"Brands love us"`  | きらめく見出しのテキスト。         |
| `subtitle` | `string` | _(trusted-by copy)_ | 見出しの下に表示される補足のコピー。 |

## テーマとレスポンシブ対応

shadcn の CSS 変数トークンを介してライトテーマとダークテーマをサポートします。モバイル、タブレット、デスクトップの各ブレークポイントにわたってレスポンシブです。
