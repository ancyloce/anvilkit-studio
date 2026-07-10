// Barrel for `@anvilkit/core/compat`.
//
// Hosts the `aiHostAdapter` (core-010) — wraps the legacy `aiHost`
// string prop as a real `StudioPlugin` and emits a one-shot
// `console.warn` deprecation. Isolated on its own subpath so
// tree-shaking can drop it entirely when consumers migrate to
// `createAiCopilotPlugin()` from `@anvilkit/plugin-ai-copilot`.
//
// Reachable **only** at `@anvilkit/core/compat`. The root barrel
// (`packages/runtime/core/src/index.ts`) does not re-export from this file
// (acceptance criterion #6 of core-010), so a host app that never
// imports `@anvilkit/core/compat` ships zero adapter bytes.
//
// DEPRECATED since 0.1.x. Removal target: v2.0.0 (a major bump, per
// docs/policies/lts.md §5 — never a minor). Supported through every
// v1.x minor. See the `@deprecated` markers in ./ai-host-adapter.ts.

export { type AiHostAdapterOptions, aiHostAdapter } from "./ai-host-adapter.js";
