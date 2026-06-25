# @anvilkit/input

ラベル、ヘルパーテキスト、検証サポートを備えた Puck ネイティブのフォーム入力ブロック。

## インストール

```sh
pnpm add @anvilkit/input @anvilkit/ui @puckeditor/core
```

## スタイル

コンポーネントをレンダリングする前に、アプリのエントリポイントからパッケージのスタイルシートを一度インポートしてください。

```tsx
import "@anvilkit/input/styles.css";
```

Next.js では、このインポートを `app/layout.tsx` または `pages/_app.tsx` に追加します。

## 例

### 基本的な使い方

プレースホルダーテキスト付きのラベル付きメールアドレス入力をレンダリングします。

```tsx
import "@anvilkit/input/styles.css";
import { Input } from "@anvilkit/input";

export function Example() {
  return (
    <Input label="Email address" name="email" placeholder="Enter your email" />
  );
}
```

### ヘルパーテキスト付きの必須フィールド

入力の `type` を切り替え、`required` としてマークし（ラベルに `*` を追加し、ネイティブの `required` 属性を設定します）、`helperText` でガイダンスを表示します。

```tsx
import { Input } from "@anvilkit/input";

export function PasswordField() {
  return (
    <Input
      label="Password"
      name="password"
      type="password"
      placeholder="At least 8 characters"
      helperText="Use a mix of letters, numbers, and symbols."
      required
    />
  );
}
```

### Puck 設定への登録

エクスポートされた `componentConfig` を Puck `Config` に組み込むことで、作成者がフィールドをフォームに追加できるようにします。

```tsx
import type { Config } from "@puckeditor/core";
import { componentConfig, type InputProps } from "@anvilkit/input";

const config: Config<{ Input: InputProps }> = {
  components: {
    Input: componentConfig,
  },
};
```

## API

エクスポートされた `InputProps` 型と Puck `fields` スキーマから導出されています。

| Prop           | Type                                                                      | Default                                          | Description                            |
| -------------- | ------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------- |
| `label`        | `string`                                                                  | `"Email address"`                                | フィールドのラベル。                   |
| `name`         | `string`                                                                  | `"email"`                                        | フォームフィールド名。                 |
| `type`         | `"text"` \| `"email"` \| `"password"` \| `"search"` \| `"tel"` \| `"url"` | `"email"`                                        | 入力タイプ。                           |
| `placeholder`  | `string`                                                                  | `"Enter your email"`                             | プレースホルダーテキスト。             |
| `helperText`   | `string`                                                                  | `"We will only use this for important updates."` | フィールドの下に表示されるヘルパーテキスト。 |
| `defaultValue` | `string`                                                                  | `""`                                             | 初期の非制御値。                       |
| `required`     | `boolean`                                                                 | `false`                                          | フィールドを必須としてマークします（`*` を追加）。 |
| `disabled`     | `boolean`                                                                 | `false`                                          | フィールドを無効にします。             |

## テーマとレスポンシブ対応

shadcn CSS 変数トークンによりライトテーマとダークテーマに対応します。モバイル、タブレット、デスクトップのブレークポイント全体でレスポンシブに対応します。
