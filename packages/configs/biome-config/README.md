# @anvilkit/biome-config

Shared [Biome](https://biomejs.dev/) configuration for every
package in the anvilkit-studio workspace. Private — not published to
npm.

## Exports

| Export                                  | Purpose                                                                                 |
| --------------------------------------- | --------------------------------------------------------------------------------------- |
| `@anvilkit/biome-config/base`           | Workspace-wide rules. Suitable for plain-TS packages (`ir`, `schema`, `validator`, …).  |
| `@anvilkit/biome-config/react-internal` | Adds React-aware rules. Used by `@anvilkit/core`, `@anvilkit/ui`, plugins shipping JSX. |
| `@anvilkit/biome-config/next-js`        | Adds Next.js-specific allowances. Used only by `apps/demo`.                             |

## Usage

```json
{
  "$schema": "https://biomejs.dev/schemas/2.4.14/schema.json",
  "extends": ["@anvilkit/biome-config/react-internal"]
}
```

Pin Biome itself at the workspace root — `pnpm-lock.yaml` keeps the
toolchain version uniform across packages.
