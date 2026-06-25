# @anvilkit/template-blog-index

ブログのランディング / インデックスページ。

ナビゲーションバー、セクション見出し、そしてページネーション付きの記事リスト。

![Blog Index preview](./preview.png)

## インストール

```sh
npx anvilkit init --template blog-index my-site
```

## 構成

このテンプレートは以下のコンポーネントパッケージを組み合わせています:

- `@anvilkit/blog-list`
- `@anvilkit/navbar`
- `@anvilkit/section`

## 編集

正規の `PageIR` ツリーは `src/page-ir.json` にコミットされています。このパッケージのデフォルトエクスポートは、その IR をマニフェストフィールド（slug、name、description、preview、パッケージリスト）とともに `AnvilkitTemplate` にまとめます。

`AnvilkitTemplate` の契約については `docs/decisions/003-core-templates-subpath.md` を参照してください。
