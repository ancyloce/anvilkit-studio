/**
 * @file The authoritative Zod schema for `StudioConfig`.
 *
 * This file is the single source of truth for the shape consumers
 * pass to `<Studio>`. `src/types/config.ts` re-exports
 * `z.infer<typeof StudioConfigSchema>` so the runtime validator and
 * the compile-time type can never drift.
 *
 * ### Zod v4 notes
 *
 * 1. **`.prefault({})`, not `.default({})`.** In Zod v4, `.default()`
 *    short-circuits parsing — if the input is `undefined`, the
 *    default value is returned as-is without being re-parsed through
 *    the schema. That means `.default({})` on a nested object would
 *    yield a literal `{}`, **not** the fully-defaulted shape we
 *    want. `.prefault({})` re-parses the prefault value through the
 *    schema, applying every inner field default. This is the Zod v4
 *    idiom for "give me this object fully populated with defaults
 *    when the caller omits it".
 *    @see https://zod.dev/api#prefaults
 *
 * 2. **`z.strictObject`, not `.strict()`.** Zod v4 deprecates the
 *    `.strict()` method in favor of a top-level `z.strictObject`.
 *    We wrap the top-level schema in `z.strictObject` so that
 *    unknown root keys are rejected loudly — a typo in a host app's
 *    config should fail fast, not be silently dropped.
 *    @see https://zod.dev/v4/changelog#deprecates-strict-and-passthrough
 *
 * 3. **`z.url()`, not `z.string().url()`.** String format validators
 *    moved to the top level in Zod v4 for tree-shakability. The old
 *    method form still works but is deprecated.
 *    @see https://zod.dev/v4/changelog#zstring-updates
 *
 * 4. **`z.record(keySchema, valueSchema)`.** The single-argument
 *    record form was dropped in Zod v4; the two-argument form is
 *    required for `experimental`'s `Record<string, unknown>` bag.
 *    @see https://zod.dev/v4/changelog#zrecord
 *
 * ### Usage
 *
 * Host apps should NOT call `StudioConfigSchema.parse(...)` directly.
 * They should call `createStudioConfig(...)` (shipping in `core-011`),
 * which layers defaults, `ANVILKIT_*` environment variables, and
 * host overrides before running the schema. This file exists so
 * that runtime layer has something to validate against.
 *
 * @see architecture §9 "Configuration System"
 * @see {@link https://github.com/anvilkit/studio/blob/main/docs/tasks/core-007-config-schema.md | core-007}
 */

import { z } from "zod";

/**
 * The root schema for `StudioConfig`.
 *
 * Every level is wrapped in `z.strictObject` so unknown keys are
 * rejected — a mistyped section name (`"feature"` instead of
 * `"features"`) or a typo'd flag (`"enableExprot"` inside
 * `features`) fails the host app's config load rather than silently
 * disappearing.
 *
 * Every nested section is wrapped in `.prefault({})` so callers can
 * omit entire sections and still receive the fully-defaulted shape.
 * Inner fields use plain `.default(...)` because they are not
 * objects (leaf defaults do not need the pre-parse round-trip).
 *
 * Consumers: **use `createStudioConfig()`**, not `.parse()` directly.
 */
export const StudioConfigSchema = z
	.strictObject({
		/**
		 * Feature flag block. Every flag defaults to `false` so a
		 * fresh install has no surprise behavior enabled — hosts opt
		 * in explicitly.
		 */
		features: z
			.strictObject({
				/**
				 * When `true`, the export registry is compiled and the
				 * host may call `exportAs(formatId)`. When `false`,
				 * exporter plugins register but their header actions
				 * are hidden and `exportAs` throws `StudioExportError`.
				 */
				enableExport: z.boolean().default(false),
				/**
				 * When `true`, the AI copilot plugin (if installed)
				 * mounts its panel and the `generatePage()` pipeline
				 * is active. No-op when the AI plugin is not in the
				 * host's plugin array.
				 */
				enableAi: z.boolean().default(false),
				/**
				 * When `true`, the real-time collaboration plugin
				 * (if installed) mounts its presence / cursor layer.
				 * Placeholder for post-alpha work — no collaboration
				 * plugin ships in `0.1.x`.
				 */
				enableCollaboration: z.boolean().default(false),
			})
			.prefault({}),
		/**
		 * Branding block for the editor chrome — app name, logo,
		 * and accent color surfaced in the Studio header.
		 */
		branding: z
			.strictObject({
				/**
				 * Display name shown in the editor header and the
				 * browser tab. Defaults to `"AnvilKit Studio"` so an
				 * un-configured host still looks intentional.
				 */
				appName: z.string().default("AnvilKit Studio"),
				/**
				 * Optional URL of a logo rendered in the header.
				 * Validated as a URL via `z.url()` (top-level format
				 * in Zod v4). Omit to fall back to the default
				 * wordmark.
				 */
				logoUrl: z.url().optional(),
				/**
				 * Optional primary accent color for the editor
				 * chrome. Free-form string so hosts can pass a
				 * CSS variable reference (`"var(--brand)"`) or any
				 * CSS color value.
				 */
				primaryColor: z.string().optional(),
			})
			.prefault({}),
		/**
		 * Theme block — the initial color mode and whether the
		 * built-in theme toggle is shown.
		 */
		theme: z
			.strictObject({
				/**
				 * Initial color mode. `"system"` respects the user's
				 * OS preference via `prefers-color-scheme` and is
				 * the default. `"light"` and `"dark"` force the
				 * editor into that mode regardless of OS setting.
				 */
				defaultMode: z.enum(["light", "dark", "system"]).default("system"),
				/**
				 * When `true`, the built-in theme toggle button is
				 * rendered in the header. Hosts that manage theme
				 * externally can set this to `false` and drive the
				 * theme via their own controls.
				 */
				allowToggle: z.boolean().default(true),
			})
			.prefault({}),
		/**
		 * Internationalization block — the active locale, the fallback
		 * locale, optional per-locale message overrides, and the built-in
		 * language-switcher flag.
		 *
		 * The whole block is **reactive**: it is excluded from the plugin
		 * compile fingerprint (`stripReactiveConfig`), so changing any
		 * `i18n.*` value at runtime updates the editor chrome in place —
		 * no plugin recompile, no editor teardown.
		 *
		 * The env override nests: `ANVILKIT_I18N__LOCALE=zh` maps to
		 * `i18n.locale` (the `__` separator). A bare `ANVILKIT_LOCALE` is
		 * rejected — the root schema is `strictObject`, so a top-level
		 * `locale` key is unknown.
		 */
		i18n: z
			.strictObject({
				/**
				 * Active locale (BCP-47-ish tag, e.g. `"en"`, `"zh"`).
				 *
				 * When the host **explicitly sets** this on the raw
				 * `<Studio config>` prop, the instance is locale-**controlled**:
				 * this value is authoritative and reactive (changing it switches
				 * the language live), the built-in `localStorage` persistence is
				 * bypassed, and internal switch requests (the built-in
				 * `LanguageSwitcher`) only fire `onLocaleChange` — the host
				 * applies them by re-rendering with the new value. Controlled-ness
				 * is latched at mount (remount with a new React `key` to switch
				 * modes).
				 *
				 * When absent, the instance is uncontrolled: the locale store
				 * defaults to `"en"`, persists per `storeId`, and a non-`"en"`
				 * value resolved from env (`ANVILKIT_I18N__LOCALE`) seeds the
				 * store once when no persisted choice exists. Env values never
				 * trigger controlled mode.
				 */
				locale: z.string().default("en"),
				/**
				 * Locale whose {@link messages} entries back-fill keys missing
				 * from the active locale's overrides. Defaults to `"en"`.
				 */
				fallbackLocale: z.string().default("en"),
				/**
				 * Optional per-locale message overrides, keyed
				 * `locale → (messageKey → string)`. Applied to the rendered
				 * chrome catalog for the active locale (with
				 * {@link fallbackLocale} back-fill) and to `ctx.t`. Beats the
				 * built-in catalog and plugin packs; the deprecated flat
				 * `<Studio messages>` prop still wins over these during its
				 * migration window. Omit to use the built-in English catalog
				 * plus any plugin packs.
				 */
				messages: z
					.record(z.string(), z.record(z.string(), z.string()))
					.optional(),
				/**
				 * When `true`, the built-in `<LanguageSwitcher>` renders in the
				 * header between the plugin header actions and the host
				 * `headerEnd` node. Defaults to `false` (opt-in, like
				 * `features.*`) so existing mounts — including hosts already
				 * rendering their own switcher via `headerEnd` — see no change.
				 */
				showLocaleSwitch: z.boolean().default(false),
			})
			.prefault({}),
		/**
		 * Brand-kit block (I3-4) — shared colors + font families the
		 * Canvas Studio editor surfaces (color pickers, font menus) so
		 * designs stay on-brand. Distinct from `branding`, which styles
		 * the editor *chrome*: `brandKit` is design content the canvas
		 * reads via its `useBrandKit()` hook. `plugin-canvas-studio`
		 * maps these entries to the editor's `BrandKit` shape.
		 */
		brandKit: z
			.strictObject({
				/**
				 * Named brand color swatches. Each `value` is any CSS
				 * color (`"#2563eb"`, `"var(--brand)"`). Empty by default.
				 */
				colors: z
					.array(
						z.strictObject({
							/** Human label, e.g. "Primary". */
							name: z.string(),
							/** CSS color value. */
							value: z.string(),
						}),
					)
					.default([]),
				/**
				 * Brand font families, e.g. `["Inter", "Poppins"]`. The
				 * first entry is treated as the brand default. Empty by
				 * default.
				 */
				fonts: z.array(z.string()).default([]),
			})
			.prefault({}),
		/**
		 * Export pipeline block — configuration for the export
		 * registry and download flow.
		 */
		export: z
			.strictObject({
				/**
				 * Optional id of the format to pre-select in export
				 * menus (e.g. `"html"`, `"react"`). Resolved at
				 * runtime against the registered format registry —
				 * an id that does not match any registered format
				 * falls back to the first registered format.
				 */
				defaultFormat: z.string().optional(),
				/**
				 * Filename prefix for downloads. The export pipeline
				 * appends the format's extension (e.g.
				 * `"page.html"`). Defaults to `"page"` — hosts
				 * typically override with a slug derived from the
				 * current page title.
				 */
				filenamePrefix: z.string().default("page"),
			})
			.prefault({}),
		/**
		 * AI block. Intentionally carries **no credentials** —
		 * API keys, endpoint URLs, and auth tokens belong to the
		 * host backend, and the AI copilot plugin factory receives
		 * a `generatePage()` callback that wraps whatever network
		 * path the host has set up. Architecture §9 is explicit
		 * about this boundary.
		 */
		ai: z
			.strictObject({
				/**
				 * Optional hint for the AI plugin about which model
				 * to request by default (e.g. `"claude-opus-4-6"`).
				 * Plugins are free to ignore this if their host-side
				 * implementation is locked to a specific model.
				 */
				defaultModel: z.string().optional(),
				/**
				 * Maximum number of retries for a failed AI
				 * generation call. Clamped to `[0, 10]` so hosts
				 * cannot accidentally enable unbounded retry
				 * storms. Defaults to `3`.
				 */
				maxRetries: z.number().int().min(0).max(10).default(3),
			})
			.prefault({}),
		/**
		 * Grab-bag for experimental flags plugin authors stash
		 * here to avoid bumping the schema for every opt-in.
		 *
		 * Declared as `z.record(z.string(), z.unknown())` (the
		 * two-argument form required in Zod v4). The inner shape
		 * is intentionally not validated — consumers that care
		 * about a specific flag should validate it in their own
		 * code, not in the root schema.
		 */
		experimental: z.record(z.string(), z.unknown()).prefault({}),
	})
	.prefault({});
