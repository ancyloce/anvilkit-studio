# @anvilkit/template-blog-article

一个单篇博客文章页面。

导航栏、带丰富正文的文章板块，以及位于页脚的相关文章 CTA 按钮。

![Blog Article preview](./preview.png)

## 安装

```sh
npx anvilkit init --template blog-article my-site
```

## 组合

该模板组合了以下组件包：

- `@anvilkit/button`
- `@anvilkit/navbar`
- `@anvilkit/section`

## 编辑

规范的 `PageIR` 树提交在 `src/page-ir.json` 中。该包的默认导出会将该 IR 与清单字段（slug、name、description、preview、包列表）打包为一个 `AnvilkitTemplate`。

有关 `AnvilkitTemplate` 契约，请参阅 `docs/decisions/003-core-templates-subpath.md`。
