# @anvilkit/bento-grid

一个 Puck 原生的 Bento Grid 组件，具备自适应的移动端/平板/桌面端布局、内置的浅色/深色主题、用于 Puck 的可序列化 `items` API，以及导出的 `BentoCard` 基础组件可供直接组合使用。

## 安装

```sh
pnpm add @anvilkit/bento-grid @puckeditor/core
```

## 样式

在渲染组件之前，从你的应用入口处导入一次该包的样式表。

```tsx
import "@anvilkit/bento-grid/styles.css";
```

在 Next.js 中，将该导入添加到 `app/layout.tsx` 或 `pages/_app.tsx`。

## 示例

### 基本用法

通过 `defaultProps` 用捆绑的示例卡片渲染网格。

```tsx
import "@anvilkit/bento-grid/styles.css";
import { BentoGrid, defaultProps } from "@anvilkit/bento-grid";

export function Example() {
  return <BentoGrid {...defaultProps} />;
}
```

### 主题化与直接组合 `BentoCard`

设置 `theme` 和 `platform`，并传入 `BentoCard` 子元素，以便完全控制每个单元格，而不使用可序列化的 `items` 数组。

```tsx
import { BentoCard, BentoGrid } from "@anvilkit/bento-grid";

export function CustomCards() {
  return (
    <BentoGrid theme="light" platform="tablet">
      <BentoCard size="wide">
        <h2 className="text-xl font-medium text-card-foreground">
          Custom card
        </h2>
        <p className="text-sm text-muted-foreground">
          Use BentoCard for fully custom cell content.
        </p>
      </BentoCard>
    </BentoGrid>
  );
}
```

### 在 Puck 配置中注册

将导出的 `componentConfig` 接入到 Puck 的 `Config` 中。

```tsx
import type { Config } from "@puckeditor/core";
import { componentConfig, type BentoGridProps } from "@anvilkit/bento-grid";

const config: Config<{ BentoGrid: BentoGridProps }> = {
  components: {
    BentoGrid: componentConfig,
  },
};
```

## API

派生自导出的 `BentoGridProps` 类型和 Puck 的 `fields` 模式。

| Prop                      | Type                                                                   | Default             | Description                |
| ------------------------- | ---------------------------------------------------------------------- | ------------------- | -------------------------- |
| `theme`                   | `"system"` \| `"light"` \| `"dark"`                                    | `"dark"`            | 颜色主题。                 |
| `platform`                | `"adaptive"` \| `"mobile"` \| `"tablet"` \| `"desktop"`                | `"adaptive"`        | 平台布局。                 |
| `items`                   | `BentoGridItem[]`                                                      | _(6 个示例卡片)_    | 网格卡片。                 |
| `items[].icon`            | `"brain"` \| `"users"` \| `"plug"` \| `"globe"` \| `"code"` \| `"zap"` | `"brain"`           | 卡片图标。                 |
| `items[].title`           | `string`                                                               | `"Card title"`      | 卡片标题。                 |
| `items[].description`     | `string`                                                               | —                   | 卡片描述。                 |
| `items[].size`            | `"default"` \| `"wide"` \| `"tall"`                                    | `"default"`         | 卡片跨度尺寸。             |
| `items[].rounded`         | `boolean`                                                              | `false`             | 圆角。                     |
| `items[].background`      | `boolean`                                                              | `true`              | 装饰性背景。               |
| `items[].ctaLabel`        | `string`                                                               | `"Learn more >"`    | CTA 标签。                 |
| `items[].ctaHref`         | `string`                                                               | `"#"`               | CTA 链接地址。             |
| `items[].ctaOpenInNewTab` | `boolean`                                                              | `false`             | 在新标签页中打开 CTA。     |

> 组件本身也直接接受 `children` 和 `className`：传入
> `BentoCard` 子元素即可绕过可序列化的 `items` 数组。

## 主题与响应式

通过 `theme` 属性和 shadcn 的 CSS 变量令牌支持浅色和深色主题。`platform` 属性控制布局：`adaptive` 会根据视口宽度在移动端、平板和桌面端网格布局之间自动切换。
