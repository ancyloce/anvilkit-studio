# @anvilkit/template-changelog

製品の変更履歴ページ。

ナビゲーションバー、セクション見出し、そして変更履歴のエントリストリームとして再利用される blog-list。

![Changelog preview](./preview.png)

## インストール

```sh
npx anvilkit init --template changelog my-site
```

## 構成

このテンプレートは以下のコンポーネントパッケージを組み合わせています:

- `@anvilkit/blog-list`
- `@anvilkit/navbar`
- `@anvilkit/section`

## 編集

正規の `PageIR` ツリーは `src/page-ir.json` にコミットされています。このパッケージのデフォルトエクスポートは、その IR をマニフェストフィールド（slug、name、description、preview、パッケージリスト）とともに `AnvilkitTemplate` にまとめます。

`AnvilkitTemplate` の契約については `docs/decisions/003-core-templates-subpath.md` を参照してください。
