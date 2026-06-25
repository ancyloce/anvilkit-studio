# @anvilkit/helps

一个 Puck 原生的贡献者 CTA 区块，包含头像堆叠、消息文案和操作按钮。

## 安装

```sh
pnpm add @anvilkit/helps @anvilkit/ui @puckeditor/core
```

## 样式

在渲染组件之前，从你的应用入口处导入一次该包的样式表。

```tsx
import "@anvilkit/helps/styles.css";
```

在 Next.js 中，将该导入添加到 `app/layout.tsx` 或 `pages/_app.tsx`。

## 示例

### 基本用法

通过 `defaultProps` 使用内置的示例头像来渲染该 CTA。

```tsx
import "@anvilkit/helps/styles.css";
import { Helps, defaultProps } from "@anvilkit/helps";

export function Example() {
  return (
    <Helps
      message="Join our open-source community today."
      buttonLabel="Get started"
      buttonHref="/contribute"
      avatars={defaultProps.avatars}
    />
  );
}
```

### 仅首字母缩写头像

当未提供 `imageUrl` 时，每个头像都会回退到 `initials`（或由 `name` 派生的首字母缩写）。

```tsx
import { Helps } from "@anvilkit/helps";

export function ContributorWall() {
  return (
    <Helps
      message={"We're grateful for our contributors."}
      buttonLabel="Become a contributor"
      buttonHref="https://github.com/example/repo"
      buttonOpenInNewTab
      avatars={[
        { name: "Alice Johnson", initials: "AJ" },
        { name: "Bob Brown", initials: "BB" },
        { name: "Charlie Davis" },
      ]}
    />
  );
}
```

### 在 Puck 配置中注册

将导出的 `componentConfig` 接入到 Puck `Config` 中。

```tsx
import type { Config } from "@puckeditor/core";
import { componentConfig, type HelpsProps } from "@anvilkit/helps";

const config: Config<{ Helps: HelpsProps }> = {
  components: {
    Helps: componentConfig,
  },
};
```

## API

派生自导出的 `HelpsProps` 类型和 Puck `fields` schema。

| Prop                 | Type            | Default                     | Description                              |
| -------------------- | --------------- | --------------------------- | ---------------------------------------- |
| `message`            | `string`        | _(感谢社区的文案)_          | CTA 消息文本（支持换行）。               |
| `buttonLabel`        | `string`        | `"Become a contributor"`    | 操作按钮标签。                           |
| `buttonHref`         | `string`        | `"/contribute"`             | 操作按钮链接。                           |
| `buttonOpenInNewTab` | `boolean`       | `false`                     | 在新标签页中打开链接。                   |
| `avatars`            | `HelpsAvatar[]` | _(5 个示例头像)_            | 贡献者头像堆叠。                         |
| `avatars[].name`     | `string`        | `"New contributor"`         | 贡献者姓名（显示在工具提示中）。         |
| `avatars[].imageUrl` | `string`        | `""`                        | 头像图片 URL。                           |
| `avatars[].initials` | `string`        | `"NC"`                      | 未设置图片时回退的首字母缩写。           |

## 主题与响应式

通过 shadcn CSS 变量令牌支持浅色与深色主题。在移动端、平板和桌面断点下均具有响应式表现。
