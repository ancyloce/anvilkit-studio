# @anvilkit/logo-clouds

一个 Puck 原生的 logo 云组件，带有微光标题和滚动的 Devicon logo 走马灯。

## 安装

将该包的样式表从应用入口处导入一次，然后再渲染该组件。

```sh
pnpm add @anvilkit/logo-clouds @anvilkit/ui @puckeditor/core
```

## 样式

将该包的样式表从应用入口处导入一次，然后再渲染该组件。

```tsx
import "@anvilkit/logo-clouds/styles.css";
```

在 Next.js 中，将该导入添加到 `app/layout.tsx` 或 `pages/_app.tsx`。

## 示例

### 基本用法

通过 `defaultProps` 使用默认文案渲染该区块。

```tsx
import "@anvilkit/logo-clouds/styles.css";
import { LogoClouds, defaultProps } from "@anvilkit/logo-clouds";

export function Example() {
  return <LogoClouds {...defaultProps} />;
}
```

### 自定义标题和副标题

微光标题由 `title` 驱动；`subtitle` 渲染其下方的辅助文案。滚动的 logo 走马灯是内置的。

```tsx
import { LogoClouds } from "@anvilkit/logo-clouds";

export function TrustedBy() {
  return (
    <LogoClouds
      title="Trusted by builders"
      subtitle="Teams of every size ship polished products with our stack."
    />
  );
}
```

### 在 Puck 配置中注册

将导出的 `componentConfig` 接入 Puck `Config`。

```tsx
import type { Config } from "@puckeditor/core";
import { componentConfig, type LogoCloudsProps } from "@anvilkit/logo-clouds";

const config: Config<{ LogoClouds: LogoCloudsProps }> = {
  components: {
    LogoClouds: componentConfig,
  },
};
```

## API

派生自导出的 `LogoCloudsProps` 类型和 Puck `fields` schema。

| Prop       | Type     | Default             | Description                        |
| ---------- | -------- | ------------------- | ---------------------------------- |
| `title`    | `string` | `"Brands love us"`  | 微光标题文本。                     |
| `subtitle` | `string` | _(trusted-by copy)_ | 标题下方的辅助文案。               |

## 主题与响应式

通过 shadcn CSS 变量令牌支持浅色和深色主题。在移动端、平板和桌面端各断点下均可自适应。
