/**
 * Runtime configuration surface for `<Studio>`.
 *
 * **Forward-declaration stub.** This file is replaced in `core-007` by
 * a re-export of `z.infer<typeof StudioConfigSchema>` sourced from
 * `src/config/schema.ts` — the single source of truth for the full
 * config shape (theme, plugins, export, ai, i18n, …).
 *
 * During M2 the type is intentionally permissive (an open index
 * signature) so `StudioPluginContext.studioConfig` typechecks against
 * any config shape until `core-007` lands the real Zod schema. Plugin
 * authors should treat this as deeply read-only.
 *
 * @see {@link https://github.com/anvilkit/studio/blob/main/docs/tasks/core-007-config-schema.md | core-007}
 */
export interface StudioConfig {
	readonly [key: string]: unknown;
}
