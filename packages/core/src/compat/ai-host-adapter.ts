/**
 * @file Compatibility shim that wraps the legacy `aiHost` string prop
 * as a real {@link StudioPlugin}.
 *
 * The reference implementation at `ancyloce/anvilkit-puck-studio`
 * accepts an `aiHost` prop on its `<Studio>`-like component and runs
 * AI generation inline. The target architecture moves AI behind a
 * proper plugin (`@anvilkit/plugins/ai-generation` — Phase 3). This
 * adapter is the bridge: existing host apps can pass `aiHost` and
 * keep working while the real plugin lands, with a one-time
 * deprecation `console.warn` nudging migration.
 *
 * ### Why this lives in `src/compat/`
 *
 * 1. **Tree-shake isolation.** Consumers reach the adapter explicitly
 *    at `@anvilkit/core/compat`. The root `@anvilkit/core` barrel
 *    does **not** re-export it, so a host app that doesn't pass
 *    `aiHost` ships zero adapter bytes.
 * 2. **Forces the plugin contract to be usable.** Building this
 *    against {@link StudioPlugin} catches contract bugs before any
 *    real plugin exists — if `isStudioPlugin()` rejects this output,
 *    the contract is wrong, not the detector.
 * 3. **Stable migration story.** The real plugin can deprecate this
 *    file in a future minor release without touching the rest of the
 *    public API.
 *
 * ### Zero React, zero Puck runtime imports
 *
 * The only imports are `import type` references to the plugin
 * contract. Puck's `Data`/`PuckAction` types are pulled in
 * type-only via `StudioPluginContext.getPuckApi()`. The emitted
 * JavaScript has no runtime dependency on `react`, `react-dom`, or
 * `@puckeditor/core` — `verbatimModuleSyntax: true` erases all
 * type imports at build time.
 *
 * @see {@link https://github.com/anvilkit/studio/blob/main/docs/tasks/core-010-compat-ai-host.md | core-010}
 */

import type { Data as PuckData } from "@puckeditor/core";

import type {
	StudioPlugin,
	StudioPluginContext,
} from "../types/plugin.js";

/**
 * Configuration accepted by {@link aiHostAdapter}.
 *
 * Mirrors the shape the legacy `<Studio aiHost="…">` consumed:
 * a single string base URL and an optional path override. Anything
 * richer (auth headers, retry, streaming) belongs to the real
 * `@anvilkit/plugins/ai-generation` package.
 */
export interface AiHostAdapterOptions {
	/**
	 * Base URL of the legacy AI host (e.g.
	 * `"https://ai.example.com"`). The adapter appends
	 * {@link apiPath} (defaulting to `/generate`) and POSTs the
	 * current Puck data to that URL.
	 */
	readonly aiHost: string;

	/**
	 * Optional path appended to {@link aiHost}. Defaults to
	 * `"/generate"`. Override only if your legacy host exposes the
	 * generation endpoint at a different route — most consumers
	 * should leave this unset.
	 */
	readonly apiPath?: string;
}

/**
 * Stable URL for the migration guide. Placeholder — finalized when
 * the migration docs are written in `core-015` or later. Hard-coded
 * here so the warning text is build-deterministic and the
 * `console.warn` call can be string-matched in tests.
 */
const MIGRATION_DOCS_URL =
	"https://anvilkit.dev/docs/migrations/ai-host";

/**
 * Frozen warning message. Hoisted to module scope so the
 * `console.warn` call site stays one line and the constant can be
 * referenced from tests if we ever want exact-text assertions.
 */
const DEPRECATION_MESSAGE = `@anvilkit/core: the \`aiHost\` prop is deprecated. Migrate to createAiGenerationPlugin() from @anvilkit/plugins/ai-generation. See: ${MIGRATION_DOCS_URL}`;

/**
 * Module-scoped one-shot guard for the deprecation warning.
 *
 * **Not** stored on `globalThis` — ESM module identity is
 * process-wide for the same module specifier, so a single
 * `let warned` here is sufficient to dedupe across every
 * `aiHostAdapter()` call within the host process.
 *
 * Tests that need to re-arm the warning use `vi.resetModules()` to
 * force a fresh module instance.
 */
let warned = false;

/**
 * Build a {@link StudioPlugin} that exposes a single header action
 * (`compat-ai-generate`) wired to the legacy AI host endpoint.
 *
 * The first call per process emits a one-time deprecation warning
 * via `console.warn`; subsequent calls are silent. The factory is
 * pure data — no module-load side effects, no globals registered —
 * so unused imports can be tree-shaken away by ESM bundlers.
 *
 * @param options - The legacy {@link AiHostAdapterOptions}.
 *
 * @example
 * ```ts
 * import { createStudioConfig } from "@anvilkit/core";
 * import { aiHostAdapter } from "@anvilkit/core/compat";
 *
 * const config = createStudioConfig({
 *   plugins: [aiHostAdapter({ aiHost: "https://ai.example.com" })],
 * });
 * ```
 */
export function aiHostAdapter(options: AiHostAdapterOptions): StudioPlugin {
	if (!warned) {
		warned = true;
		console.warn(DEPRECATION_MESSAGE);
	}

	// Compute the full endpoint URL once at adapter-creation time so
	// every onClick invocation reuses the same string. Defaults to
	// `${aiHost}/generate` per the legacy contract.
	const endpoint = `${options.aiHost}${options.apiPath ?? "/generate"}`;

	// `meta` is captured by the closure so the inner `register()`
	// can hand the same reference back inside the registration —
	// avoids the `this`-binding fragility of object literal methods.
	const meta = {
		id: "anvilkit-compat-ai-host",
		name: "Legacy aiHost Adapter",
		version: "0.1.0-alpha.0",
		coreVersion: "^0.1.0-alpha",
	} as const;

	return {
		meta,
		register() {
			return {
				meta,
				headerActions: [
					{
						id: "compat-ai-generate",
						label: "Generate with AI",
						group: "secondary",
						icon: "sparkles",
						async onClick(ctx: StudioPluginContext) {
							try {
								const response = await fetch(endpoint, {
									method: "POST",
									headers: { "Content-Type": "application/json" },
									body: JSON.stringify({
										currentData: ctx.getData(),
									}),
								});

								if (!response.ok) {
									ctx.log(
										"error",
										`aiHost request failed with status ${response.status}`,
										{ endpoint, status: response.status },
									);
									return;
								}

								// The legacy server returns the new Puck data
								// directly as the response body. Puck's
								// `setData` action accepts `Partial<Data>` —
								// the most permissive shape — so a single
								// `as Partial<PuckData>` is enough. The
								// `import type` above is erased at build time
								// (`verbatimModuleSyntax: true`), so the
								// emitted JS still has zero `@puckeditor/core`
								// runtime imports.
								const data = (await response.json()) as Partial<PuckData>;

								ctx.getPuckApi().dispatch({ type: "setData", data });
							} catch (error) {
								// Per the spec: minimum-viable error handling.
								// Log and let the user retry. Retry / backoff
								// belongs to `@anvilkit/plugins/ai-generation`.
								ctx.log("error", "aiHost request failed", {
									endpoint,
									error,
								});
							}
						},
					},
				],
			};
		},
	};
}
