# @anvilkit/blog-list

画像カード、日付、リンクを備えた Puck ネイティブのブログ記事グリッド。

## インストール

```sh
pnpm add @anvilkit/blog-list @puckeditor/core
```

## スタイル

コンポーネントをレンダリングする前に、アプリのエントリポイントからパッケージのスタイルシートを一度インポートします。

```tsx
import "@anvilkit/blog-list/styles.css";
```

Next.js では、このインポートを `app/layout.tsx` または `pages/_app.tsx` に追加します。

## 例

### 基本的な使い方

`defaultProps` を使って、同梱されたサンプル記事でグリッドをレンダリングします。

```tsx
import "@anvilkit/blog-list/styles.css";
import { BlogList, defaultProps } from "@anvilkit/blog-list";

export function Example() {
  return <BlogList posts={defaultProps.posts} />;
}
```

### 外部リンク付きのカスタム記事

各記事は、カバー画像、公開日（オプションで相対ラベル付き）、タイトル、説明をレンダリングします。`href` を設定するとカードがリンクになります。`openInNewTab` は `target="_blank"` と安全な `rel` 属性を追加します。

```tsx
import { BlogList } from "@anvilkit/blog-list";

export function LatestPosts() {
  return (
    <BlogList
      posts={[
        {
          title: "Shipping faster with Anvilkit",
          description: "How we cut release time in half.",
          href: "https://blog.example.com/shipping-faster",
          openInNewTab: true,
          imageSrc: "https://images.example.com/cover.jpg",
          imageAlt: "Shipping faster",
          publishedAt: "2025-01-12",
          publishedLabel: "January 12, 2025",
          relativeLabel: "2mo ago",
        },
      ]}
    />
  );
}
```

### Puck 設定への登録

エクスポートされた `componentConfig` を Puck の `Config` に組み込みます。

```tsx
import type { Config } from "@puckeditor/core";
import { componentConfig, type BlogListProps } from "@anvilkit/blog-list";

const config: Config<{ BlogList: BlogListProps }> = {
  components: {
    BlogList: componentConfig,
  },
};
```

## API

エクスポートされた `BlogListProps` 型と Puck の `fields` スキーマから導出されています。

| Prop                     | Type             | Default              | Description                                 |
| ------------------------ | ---------------- | -------------------- | ------------------------------------------- |
| `posts`                  | `BlogListPost[]` | _(3 件のサンプル記事)_ | ブログ記事のエントリ。                      |
| `posts[].title`          | `string`         | `"New post"`         | 記事のタイトル。                            |
| `posts[].description`    | `string`         | —                    | 記事の概要。                                |
| `posts[].href`           | `string`         | `"/blog/new-post"`   | リンク URL（設定するとカードがリンクになる）。 |
| `posts[].openInNewTab`   | `boolean`        | `false`              | リンクを新しいタブで開く。                  |
| `posts[].imageSrc`       | `string`         | _(Unsplash サンプル)_ | カバー画像の URL。                          |
| `posts[].imageAlt`       | `string`         | `"New post"`         | カバー画像の代替テキスト。                  |
| `posts[].publishedAt`    | `string`         | `"2024-11-01"`       | ISO 日付文字列（ラベルが未指定のときに使用）。 |
| `posts[].publishedLabel` | `string`         | `"November 1, 2024"` | フォーマット済みの日付ラベル。              |
| `posts[].relativeLabel`  | `string`         | `"8mo ago"`          | 括弧内に表示される相対時間ラベル。          |

## テーマとレスポンシブ対応

shadcn の CSS 変数トークンを通じて、ライトテーマとダークテーマをサポートします。モバイル、タブレット、デスクトップのブレークポイント全体でレスポンシブに対応します。
