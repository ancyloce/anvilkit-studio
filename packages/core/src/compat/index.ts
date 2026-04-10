// Barrel for `@anvilkit/core/compat`.
//
// Hosts the `aiHostAdapter` (core-010) — wraps the legacy `aiHost`
// string prop as a real `StudioPlugin` and emits a one-shot
// `console.warn` deprecation. Isolated on its own subpath so
// tree-shaking can drop it entirely when consumers migrate to
// `createAiGenerationPlugin()` from `@anvilkit/plugins/ai-generation`.
//
// Reachable **only** at `@anvilkit/core/compat`. The root barrel
// (`packages/core/src/index.ts`) does not re-export from this file
// (acceptance criterion #6 of core-010), so a host app that never
// imports `@anvilkit/core/compat` ships zero adapter bytes.

export { aiHostAdapter, type AiHostAdapterOptions } from "./ai-host-adapter.js";
