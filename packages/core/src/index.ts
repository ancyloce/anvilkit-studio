// Root barrel for `@anvilkit/core`.
//
// Each subdirectory barrel is currently an empty module populated by
// later tasks (core-005…core-014). Re-exports are listed here ahead of
// time so the public API surface is in one place — as subdir barrels
// gain real exports, no edit to this file is required.

export * from "./compat/index.js";
export * from "./config/index.js";
export * from "./react/index.js";
export * from "./runtime/index.js";
export * from "./types/index.js";
