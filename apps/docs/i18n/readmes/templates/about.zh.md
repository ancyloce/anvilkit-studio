# @anvilkit/template-about

一个关于 / 使命页面。

导航栏、主视觉区、使命板块、统计数据，以及一个客户徽标墙。

![About preview](./preview.png)

## 安装

```sh
npx anvilkit init --template about my-site
```

## 组合

该模板组合了以下组件包：

- `@anvilkit/hero`
- `@anvilkit/logo-clouds`
- `@anvilkit/navbar`
- `@anvilkit/section`
- `@anvilkit/statistics`

## 编辑

规范的 `PageIR` 树提交在 `src/page-ir.json` 中。该包的默认导出会将该 IR 与清单字段（slug、name、description、preview、包列表）打包为一个 `AnvilkitTemplate`。

有关 `AnvilkitTemplate` 契约，请参阅 `docs/decisions/003-core-templates-subpath.md`。
