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

import type { DeepPartial } from "@anvilkit/utils";
import type {
	Config as PuckConfig,
	Plugin as PuckPlugin,
} from "@puckeditor/core";
import type { StudioConfig } from "@/types/config";
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

/**
 * Project the `config` prop for fingerprinting with the **reactive `i18n`
 * block removed** (config-centric i18n refactor §4.1).
 *
 * Nothing in the compile pipeline (`compilePlugins`, override composition,
 * chrome assets) reads any `i18n.*` key — every consumer is either the
 * controller's locale write-through effect, a render-time React read of the
 * live config overlay ({@link mergeLiveI18n}), or `ctx.t` (live via the
 * locale store). Excluding the block therefore makes `config.i18n.locale` /
 * `messages` / `showLocaleSwitch` changes **recompile-free**: the chrome
 * updates in place instead of tearing down every plugin (e.g. a live collab
 * transport). Any non-`i18n` change still changes the projection and
 * recompiles exactly as before.
 *
 * Returns the input **by reference** when there is no `i18n` key, so
 * configs that never touch i18n fingerprint byte-identically to today.
 * The projection is memoized by the controller on `[config]`, so the
 * identity-fallback path for non-JSON configs keeps the host's reference
 * stability semantics unchanged.
 */
export function stripReactiveConfig(
	config: DeepPartial<StudioConfig> | undefined,
): unknown {
	if (
		config === undefined ||
		config === null ||
		typeof config !== "object" ||
		!("i18n" in config)
	) {
		return config;
	}
	const { i18n: _omit, ...rest } = config as Record<string, unknown>;
	return rest;
}

/** `true` when `value` is a `locale → (key → string)` message map. */
function isMessagesRecord(
	value: unknown,
): value is Readonly<Record<string, Readonly<Record<string, string>>>> {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return false;
	}
	for (const bundle of Object.values(value)) {
		if (
			bundle === null ||
			typeof bundle !== "object" ||
			Array.isArray(bundle)
		) {
			return false;
		}
		for (const message of Object.values(bundle)) {
			if (typeof message !== "string") {
				return false;
			}
		}
	}
	return true;
}

/**
 * Overlay the host's **raw** `config.i18n` partial onto the compiled
 * (validated) `i18n` block — the live half of the fingerprint carve-out
 * ({@link stripReactiveConfig}).
 *
 * Because `config.i18n` changes no longer recompile, the compiled
 * `studioConfig` snapshot goes stale for this one block; the controller
 * rebuilds a `liveStudioConfig` per change by overlaying the latest raw
 * values here. The compiled snapshot already contains the compile-time raw
 * values as Layer 3, so the overlay yields `defaults ⊕ env ⊕ latest raw` —
 * semantically a re-run of `createStudioConfig` for this block.
 *
 * Live updates skip the Zod re-parse, so each key is `typeof`-guarded
 * against the schema shape instead: a mismatched value is **dropped** with
 * a dev-only warning (full validation still runs on every compile-time
 * path, i.e. whenever any non-`i18n` key changes).
 */
export function mergeLiveI18n(
	compiled: StudioConfig["i18n"],
	raw: DeepPartial<StudioConfig>["i18n"],
): StudioConfig["i18n"] {
	if (raw === undefined || raw === null || typeof raw !== "object") {
		return compiled;
	}
	const source = raw as Record<string, unknown>;
	const out: {
		-readonly [K in keyof StudioConfig["i18n"]]: StudioConfig["i18n"][K];
	} = { ...compiled };
	const dropWarn = (key: string, expected: string): void => {
		if (nodeEnv() !== "production") {
			console.warn(
				`[studio] live config.i18n.${key} update dropped: expected ${expected}. ` +
					"(Live i18n values skip schema validation; fix the value or change " +
					"a non-i18n config key to force a fully-validated recompile.)",
			);
		}
	};
	if (source.locale !== undefined) {
		if (typeof source.locale === "string" && source.locale.length > 0) {
			out.locale = source.locale;
		} else {
			dropWarn("locale", "a non-empty string");
		}
	}
	if (source.fallbackLocale !== undefined) {
		if (
			typeof source.fallbackLocale === "string" &&
			source.fallbackLocale.length > 0
		) {
			out.fallbackLocale = source.fallbackLocale;
		} else {
			dropWarn("fallbackLocale", "a non-empty string");
		}
	}
	if (source.showLocaleSwitch !== undefined) {
		if (typeof source.showLocaleSwitch === "boolean") {
			out.showLocaleSwitch = source.showLocaleSwitch;
		} else {
			dropWarn("showLocaleSwitch", "a boolean");
		}
	}
	if (source.messages !== undefined) {
		if (isMessagesRecord(source.messages)) {
			out.messages = source.messages;
		} else {
			dropWarn("messages", "a locale → (key → string) record");
		}
	}
	return out;
}
