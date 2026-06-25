# @anvilkit/template-landing-saas

コンバージョンに焦点を当てた SaaS ランディングページ。

ナビゲーションバー、Hero、logo cloud、ベントー（bento）機能グリッド、価格、統計、FAQ —— 一般的な SaaS のホームページに必要な一式。

![Landing — SaaS preview](./preview.png)

## インストール

```sh
npx anvilkit init --template landing-saas my-site
```

## 構成

このテンプレートは、次のコンポーネントパッケージで構成されています。

- `@anvilkit/bento-grid`
- `@anvilkit/helps`
- `@anvilkit/hero`
- `@anvilkit/logo-clouds`
- `@anvilkit/navbar`
- `@anvilkit/pricing-minimal`
- `@anvilkit/statistics`

## 編集

正規の `PageIR` ツリーは `src/page-ir.json` にコミットされています。このパッケージのデフォルトエクスポートは、その IR をマニフェストフィールド（slug、name、description、preview、package list）とともに `AnvilkitTemplate` にバンドルします。

`AnvilkitTemplate` の契約については `docs/decisions/003-core-templates-subpath.md` を参照してください。
