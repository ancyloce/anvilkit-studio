# @anvilkit/template-landing-agency

以服务为主导的代理机构落地页。

导航栏、Hero、关于（about）板块、服务网格、社会认同统计数据，以及一个 CTA 按钮。

![Landing — Agency preview](./preview.png)

## 安装

```sh
npx anvilkit init --template landing-agency my-site
```

## 组成

此模板由以下组件包组合而成：

- `@anvilkit/bento-grid`
- `@anvilkit/button`
- `@anvilkit/hero`
- `@anvilkit/navbar`
- `@anvilkit/section`
- `@anvilkit/statistics`

## 编辑

规范的 `PageIR` 树提交于 `src/page-ir.json`。该包的默认导出将这份 IR 与清单字段（slug、name、description、preview、package list）一起打包成一个 `AnvilkitTemplate`。

有关 `AnvilkitTemplate` 契约，请参阅 `docs/decisions/003-core-templates-subpath.md`。
