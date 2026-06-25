# @anvilkit/input

一个 Puck 原生的表单输入区块，支持标签、帮助文本和校验。

## 安装

```sh
pnpm add @anvilkit/input @anvilkit/ui @puckeditor/core
```

## 样式

在渲染组件之前，从你的应用入口处导入一次该包的样式表。

```tsx
import "@anvilkit/input/styles.css";
```

在 Next.js 中，将该导入添加到 `app/layout.tsx` 或 `pages/_app.tsx`。

## 示例

### 基本用法

渲染一个带有占位符文本的带标签电子邮件输入框。

```tsx
import "@anvilkit/input/styles.css";
import { Input } from "@anvilkit/input";

export function Example() {
  return (
    <Input label="Email address" name="email" placeholder="Enter your email" />
  );
}
```

### 带帮助文本的必填字段

切换输入框的 `type`，将其标记为 `required`（在标签后追加 `*` 并设置原生的 `required` 属性），并通过 `helperText` 提供指引。

```tsx
import { Input } from "@anvilkit/input";

export function PasswordField() {
  return (
    <Input
      label="Password"
      name="password"
      type="password"
      placeholder="At least 8 characters"
      helperText="Use a mix of letters, numbers, and symbols."
      required
    />
  );
}
```

### 在 Puck 配置中注册

将导出的 `componentConfig` 接入到 Puck `Config` 中，让作者可以将该字段添加到表单。

```tsx
import type { Config } from "@puckeditor/core";
import { componentConfig, type InputProps } from "@anvilkit/input";

const config: Config<{ Input: InputProps }> = {
  components: {
    Input: componentConfig,
  },
};
```

## API

派生自导出的 `InputProps` 类型和 Puck `fields` schema。

| Prop           | Type                                                                      | Default                                          | Description                            |
| -------------- | ------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------- |
| `label`        | `string`                                                                  | `"Email address"`                                | 字段标签。                             |
| `name`         | `string`                                                                  | `"email"`                                        | 表单字段名称。                         |
| `type`         | `"text"` \| `"email"` \| `"password"` \| `"search"` \| `"tel"` \| `"url"` | `"email"`                                        | 输入框类型。                           |
| `placeholder`  | `string`                                                                  | `"Enter your email"`                             | 占位符文本。                           |
| `helperText`   | `string`                                                                  | `"We will only use this for important updates."` | 显示在字段下方的帮助文本。             |
| `defaultValue` | `string`                                                                  | `""`                                             | 初始的非受控值。                       |
| `required`     | `boolean`                                                                 | `false`                                          | 将字段标记为必填（追加 `*`）。         |
| `disabled`     | `boolean`                                                                 | `false`                                          | 禁用该字段。                           |

## 主题与响应式

通过 shadcn CSS 变量令牌支持浅色与深色主题。在移动端、平板和桌面断点下均具有响应式表现。
