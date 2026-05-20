# @anvilkit/plugin-**NAME**

**DISPLAY_MARKDOWN** - Anvilkit StudioPlugin (category: **CATEGORY**).

## Install

```bash
pnpm add @anvilkit/plugin-__NAME__
```

## Use

```tsx
import { Studio } from "@anvilkit/core";
import { __FACTORY__ } from "@anvilkit/plugin-__NAME__";

<Studio
  puckConfig={puckConfig}
  plugins={[__FACTORY__({ label: "production" })]}
/>;
```

## Develop

```bash
pnpm install
pnpm build
pnpm test
```

## References

- Plugin authoring guide: https://github.com/ancyloce/anvilkit-studio/blob/main/apps/docs/src/content/docs/guides/plugin-authoring.mdx
- StudioPlugin types: `@anvilkit/core/types`
