// Barrel for `@anvilkit/core/config`.
//
// Populated incrementally by the M2 / M4 task chain:
// - core-007 → `StudioConfigSchema` (this file's current content)
// - core-011 → `createStudioConfig`, `parseEnv`
// - core-012 → `StudioConfigProvider`, `useStudioConfig`
//
// The Zod schema is the single source of truth — `types/config.ts`
// re-exports its inferred shape.

export { StudioConfigSchema } from "./schema.js";
