# @anvilkit/template-landing-docs

開発者ツールのドキュメントサイト向けランディングページ。

ナビゲーションバー、Hero、機能セクション、FAQ —— 要点を素早く知りたい開発者向けの読者に合わせて調整されています。

![Landing — Docs / Dev-tool preview](./preview.png)

## インストール

```sh
npx anvilkit init --template landing-docs my-site
```

## 構成

このテンプレートは、次のコンポーネントパッケージで構成されています。

- `@anvilkit/helps`
- `@anvilkit/hero`
- `@anvilkit/navbar`
- `@anvilkit/section`

## 編集

正規の `PageIR` ツリーは `src/page-ir.json` にコミットされています。このパッケージのデフォルトエクスポートは、その IR をマニフェストフィールド（slug、name、description、preview、package list）とともに `AnvilkitTemplate` にバンドルします。

`AnvilkitTemplate` の契約については `docs/decisions/003-core-templates-subpath.md` を参照してください。
