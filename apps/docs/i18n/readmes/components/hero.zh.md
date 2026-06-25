# @anvilkit/hero

一个 Puck 原生的营销 hero 组件，具有条纹深色背景、公告胶囊标签和双下载 CTA。

## 安装

```sh
pnpm add @anvilkit/hero @anvilkit/ui @puckeditor/core
```

## 样式

在渲染组件之前，从你的应用入口处导入一次该包的样式表。

```tsx
import "@anvilkit/hero/styles.css";
```

在 Next.js 中，将该导入添加到 `app/layout.tsx` 或 `pages/_app.tsx`。

## 示例

### 基本用法

使用自定义文案渲染该 hero。`headline` 和 `description` 支持换行（`\n`）。

```tsx
import "@anvilkit/hero/styles.css";
import { Hero } from "@anvilkit/hero";

export function Example() {
  return (
    <Hero
      announcementLabel="Launching today"
      headline={"Build faster.\nShip sooner."}
      description="A modern toolkit for teams that move fast."
      linuxLabel="Download for Linux"
      linuxHref="/download/linux"
      windowsLabel="Download for Windows"
      windowsHref="/download/windows"
    />
  );
}
```

### 带链接的公告胶囊标签

设置 `announcementHref` 可将胶囊标签变为链接；`announcementOpenInNewTab` 会在新标签页中打开它。每个下载 CTA 都具有相同的 `href` / `openInNewTab` 配对。

```tsx
import { Hero } from "@anvilkit/hero";

export function LaunchHero() {
  return (
    <Hero
      announcementLabel="We raised $69M pre seed"
      announcementHref="/blog/seed-round"
      announcementOpenInNewTab
      headline="Write fast with accurate precision."
      description="Our state of the art tool writes copy instantly."
      linuxLabel="Get the Linux build"
      linuxHref="/download/linux"
      windowsLabel="Get the Windows build"
      windowsHref="/download/windows"
      windowsOpenInNewTab
    />
  );
}
```

### 在 Puck 配置中注册

将导出的 `componentConfig` 接入到 Puck `Config` 中。

```tsx
import type { Config } from "@puckeditor/core";
import { componentConfig, type HeroProps } from "@anvilkit/hero";

const config: Config<{ Hero: HeroProps }> = {
  components: {
    Hero: componentConfig,
  },
};
```

## API

派生自导出的 `HeroProps` 类型和 Puck `fields` schema。

| Prop                       | Type      | Default                                  | Description                              |
| -------------------------- | --------- | ---------------------------------------- | ---------------------------------------- |
| `announcementLabel`        | `string`  | `"We raised $69M pre seed"`              | 公告胶囊标签文本。                       |
| `announcementHref`         | `string`  | `""`                                     | 公告链接 URL。                           |
| `announcementOpenInNewTab` | `boolean` | `false`                                  | 在新标签页中打开公告链接。               |
| `headline`                 | `string`  | `"Write fast with\naccurate precision."` | Hero 标题（支持换行）。                  |
| `description`              | `string`  | `"Our state of the art tool..."`         | Hero 描述（支持换行）。                  |
| `linuxLabel`               | `string`  | `"Download for Linux"`                   | Linux CTA 标签。                         |
| `linuxHref`                | `string`  | `"/download/linux"`                      | Linux CTA 链接。                         |
| `linuxOpenInNewTab`        | `boolean` | `false`                                  | 在新标签页中打开 Linux CTA。             |
| `windowsLabel`             | `string`  | `"Download for Windows"`                 | Windows CTA 标签。                       |
| `windowsHref`              | `string`  | `"/download/windows"`                    | Windows CTA 链接。                       |
| `windowsOpenInNewTab`      | `boolean` | `false`                                  | 在新标签页中打开 Windows CTA。           |

## 主题与响应式

通过 shadcn CSS 变量令牌支持浅色与深色主题。在移动端、平板和桌面断点下均具有响应式表现。
