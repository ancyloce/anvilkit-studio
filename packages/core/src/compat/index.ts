// Barrel for `@anvilkit/core/compat`.
//
// Filled in by core-010 (`aiHostAdapter` — wraps the legacy `aiHost`
// string prop as a `StudioPlugin` and emits a `console.warn`
// deprecation). Isolated on its own subpath so tree-shaking can drop it
// when consumers migrate to `createAiGenerationPlugin()`.

export {};
