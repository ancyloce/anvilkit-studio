# @anvilkit/template-pricing-comparison

スタンドアロンの価格ページ。

ナビゲーションバー、Hero バナー、3 ティアの価格グリッド、比較 FAQ —— `/pricing` にそのまま差し替えられます。

![Pricing Comparison preview](./preview.png)

## インストール

```sh
npx anvilkit init --template pricing-comparison my-site
```

## 構成

このテンプレートは、次のコンポーネントパッケージで構成されています。

- `@anvilkit/helps`
- `@anvilkit/hero`
- `@anvilkit/navbar`
- `@anvilkit/pricing-minimal`

## 編集

正規の `PageIR` ツリーは `src/page-ir.json` にコミットされています。このパッケージのデフォルトエクスポートは、その IR をマニフェストフィールド（slug、name、description、preview、package list）とともに `AnvilkitTemplate` にバンドルします。

`AnvilkitTemplate` の契約については `docs/decisions/003-core-templates-subpath.md` を参照してください。
