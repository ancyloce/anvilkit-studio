# @anvilkit/plugin-page-seo

ページの SEO メタデータ——meta タイトル、説明、OG 画像、canonical URL、
そして `noindex`——を、正準的な Puck `root.props.seo` 上で直接編集するための
**Page SEO** レールパネルを追加する `<Studio>` プラグイン（サイドバー機能）です（PRD 0004 F5）。

```tsx
import { createPageSeoPlugin } from "@anvilkit/plugin-page-seo";

<Studio puckConfig={config} plugins={[createPageSeoPlugin()]} />;
```

- **単一の信頼できる情報源。** 編集はイミュータブルな `root.props.seo` 更新
  （Puck `setData`）をディスパッチし、`appState.data` に反映されます——これは検証器、
  ストレージゲートウェイ、SEO レンダリングルートが読み取るのと同じ形です。
- **ローカライズ済み。** すべての文字列は i18n メッセージキー（`pageSeo.*`）から来ます。インラインの
  コピーはありません。
- **レールのシーム。** コアの `registerSeoPanel` シームを介して登録されます。パネルは **SEO**
  レールタブの下で点灯します。

`registerSeoPanel` を公開するバージョン以上の `@anvilkit/core` が必要です。
