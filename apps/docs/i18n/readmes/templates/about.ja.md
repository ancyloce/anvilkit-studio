# @anvilkit/template-about

会社概要 / ミッションページ。

ナビゲーションバー、ヒーロー、ミッションセクション、統計、そして顧客ロゴクラウド。

![About preview](./preview.png)

## インストール

```sh
npx anvilkit init --template about my-site
```

## 構成

このテンプレートは以下のコンポーネントパッケージを組み合わせています:

- `@anvilkit/hero`
- `@anvilkit/logo-clouds`
- `@anvilkit/navbar`
- `@anvilkit/section`
- `@anvilkit/statistics`

## 編集

正規の `PageIR` ツリーは `src/page-ir.json` にコミットされています。このパッケージのデフォルトエクスポートは、その IR をマニフェストフィールド（slug、name、description、preview、パッケージリスト）とともに `AnvilkitTemplate` にまとめます。

`AnvilkitTemplate` の契約については `docs/decisions/003-core-templates-subpath.md` を参照してください。
