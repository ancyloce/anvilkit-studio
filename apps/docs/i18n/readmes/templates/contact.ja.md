# @anvilkit/template-contact

お問い合わせページ。

ナビゲーションバー、コピーを備えたセクション、インラインのメール + メッセージ入力欄、そして送信ボタン。フォームハンドラーは接続されていません——ユーザーが自分で接続します。

![Contact preview](./preview.png)

## インストール

```sh
npx anvilkit init --template contact my-site
```

## 構成

このテンプレートは以下のコンポーネントパッケージを組み合わせています:

- `@anvilkit/button`
- `@anvilkit/input`
- `@anvilkit/navbar`
- `@anvilkit/section`

## 編集

正規の `PageIR` ツリーは `src/page-ir.json` にコミットされています。このパッケージのデフォルトエクスポートは、その IR をマニフェストフィールド（slug、name、description、preview、パッケージリスト）とともに `AnvilkitTemplate` にまとめます。

`AnvilkitTemplate` の契約については `docs/decisions/003-core-templates-subpath.md` を参照してください。
