// Root barrel for `@anvilkit/core`.
//
// Re-exports the public API of the package. Each subdirectory barrel
// is populated by its corresponding `core-0NN` task; the root barrel
// stays small and intentional so the public surface is reviewable in
// one place.
//
// **Compat is intentionally not re-exported here.** `src/compat/`
// (currently the legacy `aiHostAdapter`) is reachable only at the
// `@anvilkit/core/compat` subpath so ESM tree-shaking can drop it
// entirely from host bundles that don't import it. See core-010
// acceptance criterion #6.

export * from "./config/index.js";
export * from "./react/index.js";
export * from "./runtime/index.js";
export * from "./types/index.js";
