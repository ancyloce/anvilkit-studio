// Barrel for `@anvilkit/core/config`.
//
// Populated incrementally by the M2 / M4 task chain:
// - core-007 → `StudioConfigSchema` (authoritative Zod shape).
// - core-011 → `createStudioConfig`, `parseStudioEnv` (layered merge).
// - core-012 → `StudioConfigProvider`, `useStudioConfig` (React wiring).
//
// The Zod schema is the single source of truth — `types/config.ts`
// re-exports its inferred shape; this barrel re-exports the factory
// and env parser so host apps have a stable `@anvilkit/core/config`
// import site.

export {
	type CreateStudioConfigOptions,
	createStudioConfig,
} from "./create-config.js";
export { parseStudioEnv } from "./env-parser.js";
export { useStudioConfig } from "./hooks.js";
export {
	StudioConfigProvider,
	type StudioConfigProviderProps,
} from "./provider.js";
export { StudioConfigSchema } from "./schema.js";
