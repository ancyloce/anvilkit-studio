# @anvilkit/navbar

一个 Puck 原生的导航栏布局组件，包含 logo、导航项和操作按钮。

## 安装

将该包的样式表从应用入口处导入一次，然后再渲染该组件。

```sh
pnpm add @anvilkit/navbar @anvilkit/ui @puckeditor/core
```

## 样式

将该包的样式表从应用入口处导入一次，然后再渲染该组件。

```tsx
import "@anvilkit/navbar/styles.css";
```

在 Next.js 中，将该导入添加到 `app/layout.tsx` 或 `pages/_app.tsx`。

## 示例

### 基本用法

一个文本 logo、几个链接和单个号召性操作。`active` href 会高亮匹配的菜单项。

```tsx
import "@anvilkit/navbar/styles.css";
import { Navbar } from "@anvilkit/navbar";

export function Example() {
  return (
    <Navbar
      logo={{ type: "text", text: "Acme", href: "/" }}
      items={[
        { label: "Overview", href: "/overview" },
        { label: "Features", href: "/features" },
      ]}
      actions={[{ label: "Sign up", href: "/signup", variant: "secondary" }]}
      active="/features"
    />
  );
}
```

### 图片 logo 与多个操作

将 logo 切换为 `image`，并渲染多个具有不同变体和尺寸的操作。

```tsx
import { Navbar } from "@anvilkit/navbar";

export function MarketingNav() {
  return (
    <Navbar
      logo={{ type: "image", imageUrl: "/logo.svg", alt: "Acme", href: "/" }}
      items={[
        { label: "Product", href: "/product" },
        { label: "Pricing", href: "/pricing" },
      ]}
      actions={[
        { label: "Log in", href: "/login", variant: "ghost", size: "default" },
        {
          label: "Get started",
          href: "/signup",
          variant: "default",
          size: "lg",
        },
      ]}
      active="/pricing"
    />
  );
}
```

### 在 Puck 配置中注册

将导出的 `componentConfig` 接入 Puck `Config`。

```tsx
import type { Config } from "@puckeditor/core";
import { componentConfig, type NavbarProps } from "@anvilkit/navbar";

const config: Config<{ Navbar: NavbarProps }> = {
  components: {
    Navbar: componentConfig,
  },
};
```

## API

派生自导出的 `NavbarProps` 类型和 Puck `fields` schema。

| Prop                     | Type                                                                                    | Default              | Description                          |
| ------------------------ | --------------------------------------------------------------------------------------- | -------------------- | ------------------------------------ |
| `logo`                   | `object`                                                                                | _(text logo)_        | Logo 配置。                          |
| `logo.type`              | `"text"` \| `"image"`                                                                   | `"text"`             | 将 logo 渲染为文本或图片。           |
| `logo.text`              | `string`                                                                                | `"Underline"`        | 显示文本（当 type 为 `text` 时）。   |
| `logo.imageUrl`          | `string`                                                                                | `""`                 | 图片 URL（当 type 为 `image` 时）。  |
| `logo.alt`               | `string`                                                                                | `"Underline"`        | 图片替代文本。                       |
| `logo.href`              | `string`                                                                                | `"/"`                | Logo 链接 URL。                      |
| `items`                  | `NavbarMenuItem[]`                                                                      | _(5 example links)_  | 导航菜单项。                         |
| `items[].label`          | `string`                                                                                | `"New link"`         | 菜单项标签。                         |
| `items[].href`           | `string`                                                                                | `"/"`                | 菜单项链接。                         |
| `actions`                | `NavbarAction[]`                                                                        | _(1 example action)_ | 操作按钮。                           |
| `actions[].label`        | `string`                                                                                | `"Action"`           | 按钮标签。                           |
| `actions[].href`         | `string`                                                                                | `""`                 | 按钮链接。                           |
| `actions[].variant`      | `"default"` \| `"secondary"` \| `"outline"` \| `"ghost"` \| `"link"` \| `"destructive"` | `"secondary"`        | 按钮变体。                           |
| `actions[].size`         | `"sm"` \| `"default"` \| `"lg"`                                                         | `"lg"`               | 按钮尺寸。                           |
| `actions[].openInNewTab` | `boolean`                                                                               | `false`              | 在新标签页中打开链接。               |
| `actions[].disabled`     | `boolean`                                                                               | `false`              | 禁用操作按钮。                       |
| `active`                 | `string`                                                                                | `"/features"`        | 当前活动项的 href。                  |

## 主题与响应式

通过 shadcn CSS 变量令牌支持浅色和深色主题。在移动端、平板和桌面端各断点下均可自适应。在移动端会折叠为汉堡菜单。
