# @anvilkit/plugin-page-seo

一个 `<Studio>` 插件（侧边栏能力），它添加一个 **Page SEO** 导轨面板，用于
编辑页面的 SEO 元数据——meta 标题、描述、OG 图片、规范 URL，
以及 `noindex`——直接作用于规范的 Puck `root.props.seo`（PRD 0004 F5）。

```tsx
import { createPageSeoPlugin } from "@anvilkit/plugin-page-seo";

<Studio puckConfig={config} plugins={[createPageSeoPlugin()]} />;
```

- **单一事实来源。** 编辑会派发一个不可变的 `root.props.seo` 更新
  （Puck `setData`），反映在 `appState.data` 中——这与校验器、
  存储网关和 SEO 渲染路由所读取的形状相同。
- **已本地化。** 所有字符串都来自 i18n 消息键（`pageSeo.*`）；无内联
  文案。
- **导轨接缝。** 通过核心的 `registerSeoPanel` 接缝注册；该面板在 **SEO**
  导轨标签页下点亮。

需要 `@anvilkit/core` ≥ 暴露 `registerSeoPanel` 的版本。
