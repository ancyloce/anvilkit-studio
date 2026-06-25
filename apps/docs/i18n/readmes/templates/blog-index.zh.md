# @anvilkit/template-blog-index

一个博客落地页 / 索引页。

导航栏、板块标题，以及一个分页的文章列表。

![Blog Index preview](./preview.png)

## 安装

```sh
npx anvilkit init --template blog-index my-site
```

## 组合

该模板组合了以下组件包：

- `@anvilkit/blog-list`
- `@anvilkit/navbar`
- `@anvilkit/section`

## 编辑

规范的 `PageIR` 树提交在 `src/page-ir.json` 中。该包的默认导出会将该 IR 与清单字段（slug、name、description、preview、包列表）打包为一个 `AnvilkitTemplate`。

有关 `AnvilkitTemplate` 契约，请参阅 `docs/decisions/003-core-templates-subpath.md`。
