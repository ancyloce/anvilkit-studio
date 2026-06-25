# @anvilkit/template-pricing-comparison

一个独立的定价页。

导航栏、Hero 横幅、三档定价网格，以及一个对比 FAQ —— 可直接替换 `/pricing`。

![Pricing Comparison preview](./preview.png)

## 安装

```sh
npx anvilkit init --template pricing-comparison my-site
```

## 组成

此模板由以下组件包组合而成：

- `@anvilkit/helps`
- `@anvilkit/hero`
- `@anvilkit/navbar`
- `@anvilkit/pricing-minimal`

## 编辑

规范的 `PageIR` 树提交于 `src/page-ir.json`。该包的默认导出将这份 IR 与清单字段（slug、name、description、preview、package list）一起打包成一个 `AnvilkitTemplate`。

有关 `AnvilkitTemplate` 契约，请参阅 `docs/decisions/003-core-templates-subpath.md`。
