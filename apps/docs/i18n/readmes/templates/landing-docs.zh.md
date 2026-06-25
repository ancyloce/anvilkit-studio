# @anvilkit/template-landing-docs

面向开发者工具文档站点的落地页。

导航栏、Hero、功能板块和 FAQ —— 为希望快速看到要点的开发者受众量身定制。

![Landing — Docs / Dev-tool preview](./preview.png)

## 安装

```sh
npx anvilkit init --template landing-docs my-site
```

## 组成

此模板由以下组件包组合而成：

- `@anvilkit/helps`
- `@anvilkit/hero`
- `@anvilkit/navbar`
- `@anvilkit/section`

## 编辑

规范的 `PageIR` 树提交于 `src/page-ir.json`。该包的默认导出将这份 IR 与清单字段（slug、name、description、preview、package list）一起打包成一个 `AnvilkitTemplate`。

有关 `AnvilkitTemplate` 契约，请参阅 `docs/decisions/003-core-templates-subpath.md`。
