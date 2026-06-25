# @anvilkit/template-landing-agency

サービス主導のエージェンシー向けランディングページ。

ナビゲーションバー、Hero、about セクション、サービスグリッド、ソーシャルプルーフの統計、そして CTA ボタン。

![Landing — Agency preview](./preview.png)

## インストール

```sh
npx anvilkit init --template landing-agency my-site
```

## 構成

このテンプレートは、次のコンポーネントパッケージで構成されています。

- `@anvilkit/bento-grid`
- `@anvilkit/button`
- `@anvilkit/hero`
- `@anvilkit/navbar`
- `@anvilkit/section`
- `@anvilkit/statistics`

## 編集

正規の `PageIR` ツリーは `src/page-ir.json` にコミットされています。このパッケージのデフォルトエクスポートは、その IR をマニフェストフィールド（slug、name、description、preview、package list）とともに `AnvilkitTemplate` にバンドルします。

`AnvilkitTemplate` の契約については `docs/decisions/003-core-templates-subpath.md` を参照してください。
