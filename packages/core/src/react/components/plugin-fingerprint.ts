/**
 * @file Structural fingerprinting for the `<Studio>` compile effect,
 * extracted from `use-studio-controller.ts` (review finding RX-b).
 *
 * The controller keys its async plugin-compile effect on cheap string
 * fingerprints of the `plugins` array and `config` prop, so an inline
 * array/object literal that is structurally unchanged does not thrash
 * the whole dynamic-import + `compilePlugins` pipeline every render.
 *
 * React-free except for the dev-only recompile warning, which is now a
 * **per-instance** closure ({@link createConfigFingerprinter}) rather
 * than module-global state (review finding RX-2) so two `<Studio>`
 * mounts can no longer trip each other's one-shot warning.
 */

import type {
	Config as PuckConfig,
	Plugin as PuckPlugin,
} from "@puckeditor/core";
import type { StudioPlugin } from "@/types/plugin";

const pluginIdentityTags = new WeakMap<object, string>();
let pluginIdentityCounter = 0;

function identityTagFor(value: object): string {
	let existing = pluginIdentityTags.get(value);
	if (existing === undefined) {
		pluginIdentityCounter += 1;
		existing = `#${pluginIdentityCounter}`;
		pluginIdentityTags.set(value, existing);
	}
	return existing;
}

/**
 * Escape the fingerprint segment separator so a `meta.id` containing
 * `|` or `\` cannot collide with a neighbor's segment boundary.
 */
function escapeFingerprintSegment(segment: string): string {
	return segment.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
}

/**
 * Structural fingerprint for the plugin array. `StudioPlugin` objects
 * hash by `meta` + a WeakMap-stable identity tag (so a host recreating
 * a plugin with the same `meta` but new closures is observable);
 * anything else falls back to an identity tag.
 */
export function fingerprintPlugins(
	plugins: readonly (StudioPlugin | PuckPlugin)[] | undefined,
): string {
	if (plugins === undefined || plugins.length === 0) {
		return "[]";
	}
	const parts: string[] = [];
	for (const plugin of plugins) {
		if (
			plugin !== null &&
			typeof plugin === "object" &&
			"meta" in plugin &&
			plugin.meta !== null &&
			typeof plugin.meta === "object"
		) {
			const meta = plugin.meta as {
				id?: unknown;
				version?: unknown;
				coreVersion?: unknown;
			};
			parts.push(
				`studio:${escapeFingerprintSegment(String(meta.id))}@${escapeFingerprintSegment(String(meta.version))}/${escapeFingerprintSegment(String(meta.coreVersion))}#${identityTagFor(plugin)}`,
			);
			continue;
		}
		if (plugin !== null && typeof plugin === "object") {
			parts.push(`puck:${identityTagFor(plugin)}`);
			continue;
		}
		parts.push(`other:${escapeFingerprintSegment(String(plugin))}`);
	}
	return parts.join("|");
}

/**
 * `NODE_ENV` via `globalThis` — mirrors `config/env-parser`'s
 * environment-agnostic accessor (core's tsconfig has no `@types/node`
 * in `types`, so the bare `process` identifier is untyped). Absent ⇒
 * `undefined` ⇒ treated as non-production (the warn is harmless).
 */
function nodeEnv(): string | undefined {
	return (
		globalThis as unknown as { process?: { env?: Record<string, string> } }
	).process?.env?.NODE_ENV;
}

/**
 * Create a per-`<Studio>` config fingerprinter.
 *
 * Returns `fingerprintConfig(config)`: `JSON.stringify` is cheap for the
 * shallow partial shape and order-sensitive at the key level (a key swap
 * is a genuinely different config).
 *
 * **Non-JSON values fall back to reference identity**:
 * `StudioConfig.experimental` is a `Record<string, unknown>`, so a host
 * may pass a function/symbol/bigint there. `JSON.stringify` silently
 * drops functions/symbols (and throws on bigint), so two different
 * configs would otherwise hash identically and the compile effect would
 * never re-run — plugins keep seeing a stale `ctx.studioConfig`. When
 * the replacer observes any non-serializable value we key on object
 * identity instead (mirrors {@link fingerprintPlugins}): a new reference
 * re-compiles, the safe, correct choice. Pure-JSON configs keep the
 * cheap structural hash (no recompile thrash).
 *
 * The dev-only "host re-creates the same config inline every render"
 * warning is **closure-scoped per instance** (RX-2) so two mounts can't
 * trip a spurious cross-instance warning.
 */
export function createConfigFingerprinter(): (config: unknown) => string {
	// Dev-only footgun detector: a host that passes an inline
	// `config={{ experimental: { transform: fn } }}` without memoizing
	// gets a fresh identity every render (the safe identity fallback
	// below), which re-runs the whole dynamic-import + `compilePlugins`
	// effect each parent render. We can't fix it for them (dropping the
	// function would be unsafe) but a one-shot warn surfaces it.
	let nonJsonFingerprintWarned = false;
	let lastNonJsonProjection: string | undefined;
	let lastNonJsonRef: object | undefined;

	function warnRepeatedConfigRecompile(
		config: object,
		projection: string,
	): void {
		if (
			nodeEnv() === "production" ||
			nonJsonFingerprintWarned ||
			lastNonJsonRef === undefined
		) {
			lastNonJsonProjection = projection;
			lastNonJsonRef = config;
			return;
		}
		// New object identity but structurally-equal projection ⇒ the host
		// is re-creating the same config inline every render.
		if (lastNonJsonRef !== config && lastNonJsonProjection === projection) {
			nonJsonFingerprintWarned = true;
			console.warn(
				"[studio] `config` contains a function/symbol/bigint and is not " +
					"referentially stable across renders. Every render now re-runs " +
					"the full plugin compile. Memoize the config (or hoist it) so " +
					"`<Studio>` can skip the recompile. (Logged once.)",
			);
		}
		lastNonJsonProjection = projection;
		lastNonJsonRef = config;
	}

	return function fingerprintConfig(config: unknown): string {
		if (config === undefined || config === null) {
			return "null";
		}
		try {
			let hasNonJson = false;
			const json = JSON.stringify(config, (_key, value) => {
				const t = typeof value;
				if (t === "function" || t === "symbol" || t === "bigint") {
					hasNonJson = true;
				}
				return value;
			});
			// `json === undefined` when the whole value is non-serializable
			// (e.g. a bare function). Either way, the string lost
			// information → fall back to identity.
			if (hasNonJson || json === undefined) {
				warnRepeatedConfigRecompile(config as object, json ?? "<non-json>");
				return `id:${identityTagFor(config as object)}`;
			}
			return json;
		} catch {
			return identityTagFor(config as object);
		}
	};
}
