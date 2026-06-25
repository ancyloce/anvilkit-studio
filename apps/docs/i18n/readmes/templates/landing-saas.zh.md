# @anvilkit/template-landing-saas

以转化为导向的 SaaS 落地页。

导航栏、Hero、logo 云、便当式（bento）功能网格、定价、统计数据和 FAQ —— 一个典型 SaaS 首页所需的全套内容。

![Landing — SaaS preview](./preview.png)

## 安装

```sh
npx anvilkit init --template landing-saas my-site
```

## 组成

此模板由以下组件包组合而成：

- `@anvilkit/bento-grid`
- `@anvilkit/helps`
- `@anvilkit/hero`
- `@anvilkit/logo-clouds`
- `@anvilkit/navbar`
- `@anvilkit/pricing-minimal`
- `@anvilkit/statistics`

## 编辑

规范的 `PageIR` 树提交于 `src/page-ir.json`。该包的默认导出将这份 IR 与清单字段（slug、name、description、preview、package list）一起打包成一个 `AnvilkitTemplate`。

有关 `AnvilkitTemplate` 契约，请参阅 `docs/decisions/003-core-templates-subpath.md`。
