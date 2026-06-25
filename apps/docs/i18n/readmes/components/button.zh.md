# @anvilkit/button

一个 Puck 原生的按钮块，支持变体和链接。

## 安装

```sh
pnpm add @anvilkit/button @anvilkit/ui @puckeditor/core
```

## 样式

在渲染组件之前，从你的应用入口处导入一次该包的样式表。

```tsx
import "@anvilkit/button/styles.css";
```

在 Next.js 中，将该导入添加到 `app/layout.tsx` 或 `pages/_app.tsx`。

## 示例

### 基本用法

以其默认的 primary 变体独立渲染按钮。

```tsx
import "@anvilkit/button/styles.css";
import { Button } from "@anvilkit/button";

export function Example() {
  return <Button label="Save changes" variant="primary" />;
}
```

### 在新标签页中打开的链接按钮

提供 `href` 即可渲染为锚点；将其与 `openInNewTab` 搭配使用可添加 `target="_blank"` 以及安全的 `rel` 属性。`disabled` 按钮不可交互，并会通过 `aria-disabled` 进行播报。

```tsx
import { Button } from "@anvilkit/button";

export function Actions() {
  return (
    <div className="flex gap-3">
      <Button
        label="Read the docs"
        variant="secondary"
        href="https://anvilkit.dev"
        openInNewTab
      />
      <Button label="Coming soon" variant="primary" disabled />
    </div>
  );
}
```

### 在 Puck 配置中注册

将导出的 `componentConfig` 接入到 Puck 的 `Config` 中，以便作者可以将按钮拖放到页面上。

```tsx
import type { Config } from "@puckeditor/core";
import { componentConfig, type ButtonProps } from "@anvilkit/button";

const config: Config<{ Button: ButtonProps }> = {
  components: {
    Button: componentConfig,
  },
};
```

## API

派生自导出的 `ButtonProps` 类型和 Puck 的 `fields` 模式。

| Prop           | Type                         | Default          | Description                                                  |
| -------------- | ---------------------------- | ---------------- | ----------------------------------------------------------- |
| `label`        | `string`                     | `"Save changes"` | 按钮标签文本。                                              |
| `variant`      | `"primary"` \| `"secondary"` | `"primary"`      | 视觉变体。                                                  |
| `href`         | `string`                     | `""`             | 链接 URL；设置后渲染为锚点。                                |
| `openInNewTab` | `boolean`                    | `false`          | 在新标签页中打开链接。                                      |
| `disabled`     | `boolean`                    | `false`          | 禁用交互。                                                  |
| `trackClick`   | `boolean`                    | `false`          | 点击时触发分析事件（需要分析提供方）。                      |
| `eventName`    | `string`                     | —                | 事件名称；默认为 `button_click`。                           |
| `eventProps`   | `{ category?: string; placement?: string }` | — | 合并到点击事件中的额外属性。                                |

## 主题与响应式

通过 shadcn 的 CSS 变量令牌支持浅色和深色主题。在移动端、平板和桌面端断点下均可响应式适配。
