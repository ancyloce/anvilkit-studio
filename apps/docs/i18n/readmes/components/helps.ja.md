# @anvilkit/helps

アバタースタック、メッセージ、アクションボタンを備えた Puck ネイティブのコントリビューター CTA ブロック。

## インストール

```sh
pnpm add @anvilkit/helps @anvilkit/ui @puckeditor/core
```

## スタイル

コンポーネントをレンダリングする前に、アプリのエントリポイントからパッケージのスタイルシートを一度インポートしてください。

```tsx
import "@anvilkit/helps/styles.css";
```

Next.js では、このインポートを `app/layout.tsx` または `pages/_app.tsx` に追加します。

## 例

### 基本的な使い方

`defaultProps` を介してバンドルされたサンプルアバターで CTA をレンダリングします。

```tsx
import "@anvilkit/helps/styles.css";
import { Helps, defaultProps } from "@anvilkit/helps";

export function Example() {
  return (
    <Helps
      message="Join our open-source community today."
      buttonLabel="Get started"
      buttonHref="/contribute"
      avatars={defaultProps.avatars}
    />
  );
}
```

### イニシャルのみのアバター

`imageUrl` が指定されていない場合、各アバターは `initials`（または `name` から導出されたイニシャル）にフォールバックします。

```tsx
import { Helps } from "@anvilkit/helps";

export function ContributorWall() {
  return (
    <Helps
      message={"We're grateful for our contributors."}
      buttonLabel="Become a contributor"
      buttonHref="https://github.com/example/repo"
      buttonOpenInNewTab
      avatars={[
        { name: "Alice Johnson", initials: "AJ" },
        { name: "Bob Brown", initials: "BB" },
        { name: "Charlie Davis" },
      ]}
    />
  );
}
```

### Puck 設定への登録

エクスポートされた `componentConfig` を Puck `Config` に組み込みます。

```tsx
import type { Config } from "@puckeditor/core";
import { componentConfig, type HelpsProps } from "@anvilkit/helps";

const config: Config<{ Helps: HelpsProps }> = {
  components: {
    Helps: componentConfig,
  },
};
```

## API

エクスポートされた `HelpsProps` 型と Puck `fields` スキーマから導出されています。

| Prop                 | Type            | Default                     | Description                              |
| -------------------- | --------------- | --------------------------- | ---------------------------------------- |
| `message`            | `string`        | _(コミュニティへの感謝文)_  | CTA メッセージテキスト（改行に対応）。   |
| `buttonLabel`        | `string`        | `"Become a contributor"`    | アクションボタンのラベル。               |
| `buttonHref`         | `string`        | `"/contribute"`             | アクションボタンのリンク。               |
| `buttonOpenInNewTab` | `boolean`       | `false`                     | リンクを新しいタブで開きます。           |
| `avatars`            | `HelpsAvatar[]` | _(5 つのサンプルアバター)_  | コントリビューターのアバタースタック。   |
| `avatars[].name`     | `string`        | `"New contributor"`         | コントリビューター名（ツールチップに表示）。 |
| `avatars[].imageUrl` | `string`        | `""`                        | アバター画像の URL。                     |
| `avatars[].initials` | `string`        | `"NC"`                      | 画像が設定されていない場合のフォールバックイニシャル。 |

## テーマとレスポンシブ対応

shadcn CSS 変数トークンによりライトテーマとダークテーマに対応します。モバイル、タブレット、デスクトップのブレークポイント全体でレスポンシブに対応します。
