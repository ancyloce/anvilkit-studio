# @anvilkit/template-feature-overview

产品功能概览页。

导航栏、Hero、便当式（bento）功能网格、统计数据和 FAQ —— 适合用于产品站点的 `/features` 子页面。

![Feature Overview preview](./preview.png)

## 安装

```sh
npx anvilkit init --template feature-overview my-site
```

## 组成

此模板由以下组件包组合而成：

- `@anvilkit/bento-grid`
- `@anvilkit/helps`
- `@anvilkit/hero`
- `@anvilkit/navbar`
- `@anvilkit/statistics`

## 编辑

规范的 `PageIR` 树提交于 `src/page-ir.json`。该包的默认导出将这份 IR 与清单字段（slug、name、description、preview、package list）一起打包成一个 `AnvilkitTemplate`。

有关 `AnvilkitTemplate` 契约，请参阅 `docs/decisions/003-core-templates-subpath.md`。
