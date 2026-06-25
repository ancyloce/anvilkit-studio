# @anvilkit/template-feature-overview

製品機能の概要ページ。

ナビゲーションバー、Hero、ベントー（bento）機能グリッド、統計、FAQ —— 製品サイトの `/features` サブページに適しています。

![Feature Overview preview](./preview.png)

## インストール

```sh
npx anvilkit init --template feature-overview my-site
```

## 構成

このテンプレートは、次のコンポーネントパッケージで構成されています。

- `@anvilkit/bento-grid`
- `@anvilkit/helps`
- `@anvilkit/hero`
- `@anvilkit/navbar`
- `@anvilkit/statistics`

## 編集

正規の `PageIR` ツリーは `src/page-ir.json` にコミットされています。このパッケージのデフォルトエクスポートは、その IR をマニフェストフィールド（slug、name、description、preview、package list）とともに `AnvilkitTemplate` にバンドルします。

`AnvilkitTemplate` の契約については `docs/decisions/003-core-templates-subpath.md` を参照してください。
