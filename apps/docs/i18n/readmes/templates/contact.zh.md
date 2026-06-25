# @anvilkit/template-contact

一个联系我们页面。

导航栏、带文案的板块、内联的邮箱 + 留言输入框，以及一个提交按钮。未接入表单处理器——用户需自行接入。

![Contact preview](./preview.png)

## 安装

```sh
npx anvilkit init --template contact my-site
```

## 组合

该模板组合了以下组件包：

- `@anvilkit/button`
- `@anvilkit/input`
- `@anvilkit/navbar`
- `@anvilkit/section`

## 编辑

规范的 `PageIR` 树提交在 `src/page-ir.json` 中。该包的默认导出会将该 IR 与清单字段（slug、name、description、preview、包列表）打包为一个 `AnvilkitTemplate`。

有关 `AnvilkitTemplate` 契约，请参阅 `docs/decisions/003-core-templates-subpath.md`。
