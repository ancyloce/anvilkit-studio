/**
 * @file The plugin compilation step — turns a mixed array of
 * {@link StudioPlugin} and `@puckeditor/core` {@link PuckPlugin}
 * objects into a {@link StudioRuntime} the `<Studio>` shell
 * (`core-014`) can mount.
 *
 * The function is **async** because {@link StudioPlugin.register}
 * may be async. Consumers await it once, at mount time, and then
 * the resulting runtime is a plain synchronous object.
 *
 * ### Error surface
 *
 * Every failure path throws {@link StudioPluginError}, so callers
 * can handle every compile-time plugin error with one `catch`:
 *
 * - Structurally invalid plugin (fails both guards).
 * - `coreVersion` mismatch against {@link CORE_VERSION}.
 * - `register()` throws or rejects.
 * - Duplicate {@link ExportFormatDefinition.id} across two plugins.
 *
 * The offending plugin's id is always on `err.pluginId`, and — for
 * duplicate-id errors — both ids appear in `err.message`.
 *
 * ### Zero React, zero Puck runtime imports
 *
 * The only Puck reference is a type-only import of `Plugin` and
 * `Overrides`. `verbatimModuleSyntax: true` erases both from the
 * emitted JavaScript, so this file ships headless.
 *
 * @see {@link https://github.com/anvilkit/studio/blob/main/docs/tasks/core-008-runtime-plugin-engine.md | core-008}
 */

import type {
	Overrides as PuckOverrides,
	Plugin as PuckPlugin,
} from "@puckeditor/core";

import type { ExportFormatDefinition } from "@/types/export";
import type {
	IRAssetResolver,
	StudioHeaderAction,
	StudioPlugin,
	StudioPluginContext,
	StudioPluginMeta,
	StudioPluginOverlay,
	StudioPluginProvider,
	StudioPluginRegistration,
	StudioPluginSlotContribution,
} from "@/types/plugin";
import { isPuckPlugin, isStudioPlugin } from "./detect-plugin.js";
import { StudioPluginError } from "./errors.js";
import {
	createLifecycleManager,
	type LifecycleManager,
	type LifecycleManagerOptions,
} from "./lifecycle-manager.js";
import { CORE_VERSION } from "./version.js";

/**
 * The compiled, ready-to-mount output of {@link compilePlugins}.
 *
 * Fields are documented on the return statement of `compilePlugins`
 * — see inline JSDoc there for the lifecycle / merge semantics of
 * each one.
 */
export interface StudioRuntime {
	/**
	 * The `meta` block of every Studio plugin that successfully
	 * registered, in declaration order. Diagnostic surface only —
	 * the runtime does not re-read fields from here after compile.
	 */
	readonly pluginMeta: readonly StudioPluginMeta[];
	/**
	 * The raw plugin registrations in declaration order, as returned
	 * by each plugin's `register()`. Primarily consumed by the
	 * `@anvilkit/core/testing` harness so unit tests can drive a
	 * single plugin's lifecycle hooks without re-implementing the
	 * compile-time invariant checks (structural guard, coreVersion
	 * range, duplicate-id detection).
	 */
	readonly registrations: readonly StudioPluginRegistration[];
	/**
	 * The lifecycle dispatcher. See
	 * {@link createLifecycleManager}.
	 */
	readonly lifecycle: LifecycleManager;
	/**
	 * Export formats indexed by {@link ExportFormatDefinition.id},
	 * preserving plugin-declared insertion order.
	 */
	readonly exportFormats: ReadonlyMap<string, ExportFormatDefinition>;
	/**
	 * Runtime-registered asset resolvers, in registration order.
	 *
	 * Exporters that support asset URL rewriting consult this list and
	 * stop at the first resolver that returns a non-null result.
	 */
	readonly assetResolvers: readonly IRAssetResolver[];
	/**
	 * Header action descriptors in the order they were contributed.
	 * Duplicate ids pass through here — `core-009`'s
	 * `composeHeaderActions()` is responsible for dedupe/ordering.
	 */
	readonly headerActions: readonly StudioHeaderAction[];
	/**
	 * Plugin-contributed Puck override slices, in registration order.
	 *
	 * This is the **raw** per-plugin array — `<Studio>` (`core-014`)
	 * runs it through `mergeOverrides([...runtime.overrides, consumer])`
	 * to produce the curried-per-key merge Puck actually receives.
	 * Keeping the array un-composed here means the `runtime/` layer
	 * stays React-free (architecture §17) and the `react/` layer owns
	 * the composition step.
	 *
	 * Entries appear in plugin registration order, first-registered
	 * first — so when {@link mergeOverrides} folds them, the first
	 * plugin becomes the innermost wrapper (closest to the default
	 * render) and later plugins wrap it.
	 */
	readonly overrides: readonly Partial<PuckOverrides>[];
	/**
	 * Plugin-contributed React providers that wrap the Studio tree.
	 *
	 * Sorted ascending by `(order ?? 100, registrationIndex)`. The
	 * provider at index 0 is composed **outermost** by `<Studio>`. The
	 * runtime layer treats the `component` field as opaque — `<Studio>`
	 * is the React boundary that instantiates each provider.
	 */
	readonly providers: readonly StudioPluginProvider[];
	/**
	 * Plugin-contributed top-level overlay components, sorted within
	 * each placement bucket by `(order ?? 100, registrationIndex)`.
	 * `<Studio>` dispatches them by `placement` (canvas / viewport /
	 * notifications).
	 */
	readonly overlays: readonly StudioPluginOverlay[];
	/**
	 * Plugin-contributed named chrome slot contributions. Single-
	 * occupancy: if two plugins contribute the same slot id the first
	 * registration wins (a warn is logged via `ctx.log` on duplicate).
	 * The host's `<Studio>` prop for the same slot still takes
	 * precedence — see e.g. `collaboratorsSlot`.
	 */
	readonly slots: ReadonlyMap<string, StudioPluginSlotContribution>;
	/**
	 * Raw Puck plugin objects, passed through to `<Puck plugins={…}>`
	 * verbatim. These do not participate in the Studio lifecycle.
	 */
	readonly puckPlugins: readonly PuckPlugin[];
}

/**
 * Parsed semver tuple. `prerelease` segments are split on `.` and
 * kept as a mixed string / number array — numeric segments compare
 * numerically, string segments compare lexicographically, matching
 * the semver 2.0 precedence rules.
 */
interface ParsedSemver {
	readonly major: number;
	readonly minor: number;
	readonly patch: number;
	readonly prerelease: readonly (string | number)[];
}

/**
 * Parse a semver-ish string into its components. Returns `null` on
 * malformed input so callers can treat unparseable ranges as
 * unsatisfied (loud failure at the call site, not silent truthy).
 *
 * The regex mirrors the "strict" production in the semver spec's
 * BNF, minus the build metadata suffix — plugins do not use `+build`
 * tags and accepting them complicates range semantics without
 * payoff.
 */
function parseSemver(input: string): ParsedSemver | null {
	const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(
		input.trim(),
	);
	if (match === null) {
		return null;
	}
	const [, majorS, minorS, patchS, prereleaseS] = match;
	const prerelease: (string | number)[] = [];
	if (prereleaseS !== undefined) {
		for (const segment of prereleaseS.split(".")) {
			if (segment.length === 0) {
				return null;
			}
			prerelease.push(/^\d+$/.test(segment) ? Number(segment) : segment);
		}
	}
	return {
		major: Number(majorS),
		minor: Number(minorS),
		patch: Number(patchS),
		prerelease,
	};
}

/**
 * Compare two parsed semver tuples per the semver 2.0 precedence
 * rules. Returns a negative number, zero, or a positive number in
 * the style of `Array.prototype.sort`.
 */
function compareSemver(a: ParsedSemver, b: ParsedSemver): number {
	if (a.major !== b.major) return a.major - b.major;
	if (a.minor !== b.minor) return a.minor - b.minor;
	if (a.patch !== b.patch) return a.patch - b.patch;

	// A version without prerelease > a version with prerelease.
	if (a.prerelease.length === 0 && b.prerelease.length === 0) return 0;
	if (a.prerelease.length === 0) return 1;
	if (b.prerelease.length === 0) return -1;

	const min = Math.min(a.prerelease.length, b.prerelease.length);
	for (let i = 0; i < min; i++) {
		const segA = a.prerelease[i] as string | number;
		const segB = b.prerelease[i] as string | number;
		const numA = typeof segA === "number";
		const numB = typeof segB === "number";
		if (numA && numB) {
			if (segA !== segB) return (segA as number) - (segB as number);
			continue;
		}
		if (numA) return -1;
		if (numB) return 1;
		if (segA !== segB) return segA < segB ? -1 : 1;
	}
	return a.prerelease.length - b.prerelease.length;
}

/**
 * Semver range check for plugin `coreVersion` declarations.
 *
 * Supports the four forms Studio plugins use:
 *
 * 1. Exact — `"0.1.0-alpha.0"` matches only that exact version.
 * 2. Caret — `"^X.Y.Z"` matches every version in the left-most
 *    non-zero component's range. `^1.2.3` matches `>=1.2.3 <2.0.0`;
 *    `^0.2.3` matches `>=0.2.3 <0.3.0`; `^0.0.3` matches
 *    `>=0.0.3 <0.0.4`. A prerelease on the lower bound (`^0.1.0-alpha`)
 *    only restricts which *prerelease* installs qualify; a stable
 *    install in the window still matches (`0.1.3` ✓), per npm
 *    `semver.satisfies` semantics. See {@link prereleaseAllowed}.
 * 3. Tilde — `"~X.Y.Z"` matches every version with the same
 *    `[major, minor]` tuple and `>= X.Y.Z`, with the same prerelease
 *    admission rule as caret.
 * 4. Prefix wildcard — `"X"` or `"X.Y"` (no operator) match any
 *    version starting with those components. Kept for parity with
 *    `npm install` conventions; rarely used by plugins.
 *
 * Returns `false` for malformed input so a typo surfaces as a loud
 * "coreVersion does not match" error instead of a silent accept.
 */
export function isCoreVersionCompatible(
	requested: string,
	installedRaw: string = CORE_VERSION,
): boolean {
	const installed = parseSemver(installedRaw);
	if (installed === null) {
		return false;
	}

	const trimmed = requested.trim();
	if (trimmed.length === 0) {
		return false;
	}

	// Exact match short-circuit: a literal version string is accepted
	// only when it parses identically to the installed tuple.
	if (!/^[\^~]/.test(trimmed) && /^\d+\.\d+\.\d+/.test(trimmed)) {
		const exact = parseSemver(trimmed);
		if (exact === null) return false;
		return compareSemver(exact, installed) === 0;
	}

	// Operator-prefixed ranges.
	if (trimmed.startsWith("^")) {
		return satisfiesCaret(trimmed.slice(1).trim(), installed);
	}
	if (trimmed.startsWith("~")) {
		return satisfiesTilde(trimmed.slice(1).trim(), installed);
	}

	// Prefix wildcard fallback: `"0"` / `"0.1"` etc.
	return satisfiesPrefix(trimmed, installed);
}

/**
 * node-semver's prerelease admission rule, the corner this module used
 * to get wrong. A build that itself carries a prerelease tag only
 * satisfies a range when the matching comparator shares its
 * `[major, minor, patch]` tuple *and* also carries a prerelease. A
 * stable release is never gated by a prerelease that appears only on a
 * range's lower bound: `0.1.3` satisfies `^0.1.0-alpha` exactly like
 * npm's `semver.satisfies`, because the prerelease restriction is about
 * the version under test, not the range. The earlier implementation
 * required every match to share the range's tuple whenever the range
 * carried a prerelease, which wrongly rejected stable `0.1.3` against
 * `^0.1.0-alpha` and stalled `<Studio>` with an opaque compat error.
 */
function prereleaseAllowed(
	base: ParsedSemver,
	installed: ParsedSemver,
): boolean {
	if (installed.prerelease.length === 0) {
		return true;
	}
	if (base.prerelease.length === 0) {
		return false;
	}
	return (
		installed.major === base.major &&
		installed.minor === base.minor &&
		installed.patch === base.patch
	);
}

/**
 * Caret range: `^X.Y.Z` matches `>= X.Y.Z` up to (but not including)
 * the next version that bumps the left-most non-zero component. A
 * prerelease on the range's lower bound only narrows which *prerelease*
 * installs qualify (see {@link prereleaseAllowed}); stable installs in
 * the `[lower, upper)` window always pass — so `^0.1.0-alpha` still
 * keeps `0.2.0-alpha` out (upper bound) while letting `0.1.3` in.
 */
function satisfiesCaret(range: string, installed: ParsedSemver): boolean {
	const base = parseSemver(range);
	if (base === null) return false;

	// Lower bound (prerelease-aware compare).
	if (compareSemver(installed, base) < 0) return false;

	// Upper bound: bump the left-most non-zero component.
	let withinUpper: boolean;
	if (base.major > 0) {
		withinUpper = installed.major === base.major;
	} else if (base.minor > 0) {
		withinUpper = installed.major === 0 && installed.minor === base.minor;
	} else {
		withinUpper =
			installed.major === 0 &&
			installed.minor === 0 &&
			installed.patch === base.patch;
	}
	if (!withinUpper) return false;

	return prereleaseAllowed(base, installed);
}

/**
 * Tilde range: `~X.Y.Z` matches any `X.Y.*` release `>= X.Y.Z`. A
 * prerelease on the range's lower bound follows the same
 * {@link prereleaseAllowed} admission rule as caret.
 */
function satisfiesTilde(range: string, installed: ParsedSemver): boolean {
	const base = parseSemver(range);
	if (base === null) return false;

	if (compareSemver(installed, base) < 0) return false;
	if (installed.major !== base.major || installed.minor !== base.minor) {
		return false;
	}
	return prereleaseAllowed(base, installed);
}

/**
 * Prefix wildcard: `"0"` or `"0.1"` matches any installed version
 * starting with those components. Falls back to the exact-match
 * path when three components are present.
 */
function satisfiesPrefix(range: string, installed: ParsedSemver): boolean {
	const parts = range.split(".");
	if (parts.length === 0 || parts.length > 3) return false;
	for (const part of parts) {
		if (!/^\d+$/.test(part)) return false;
	}
	const [majorS, minorS, patchS] = parts;
	if (majorS !== undefined && Number(majorS) !== installed.major) {
		return false;
	}
	if (minorS !== undefined && Number(minorS) !== installed.minor) {
		return false;
	}
	if (patchS !== undefined && Number(patchS) !== installed.patch) {
		return false;
	}
	// Prefix ranges without a prerelease suffix exclude prereleases,
	// matching npm's default behavior.
	return installed.prerelease.length === 0;
}

/**
 * Compile an ordered, mixed array of plugin objects into a ready-to-
 * mount {@link StudioRuntime}.
 *
 * See the file-level JSDoc for the error surface. Each plugin is
 * processed strictly in declaration order so error messages always
 * refer to the first offending plugin and the resulting registries
 * (export formats, header actions, override merge) honor the
 * caller's intent.
 *
 * @param plugins - The mixed array passed to
 * `createStudioConfig({ plugins })`.
 * @param ctx - The {@link StudioPluginContext} each Studio plugin's
 * `register()` method receives.
 */
/**
 * Options forwarded to `compilePlugins` callers that want to
 * customize downstream runtime behavior. Today only the lifecycle
 * manager's debounce option is exposed — extend as new knobs appear.
 */
export interface CompilePluginsOptions {
	/**
	 * Options forwarded verbatim to {@link createLifecycleManager}.
	 * See {@link LifecycleManagerOptions.onDataChangeDebounceMs} for
	 * the rationale behind the default `<Studio>` picks.
	 */
	readonly lifecycle?: LifecycleManagerOptions;
}

export async function compilePlugins(
	plugins: readonly (StudioPlugin | PuckPlugin)[],
	ctx: StudioPluginContext,
	options: CompilePluginsOptions = {},
): Promise<StudioRuntime> {
	const pluginMeta: StudioPluginMeta[] = [];
	const registrations: StudioPluginRegistration[] = [];
	const exportFormats = new Map<string, ExportFormatDefinition>();
	const assetResolvers: IRAssetResolver[] = [];
	// Track the plugin that first registered each export format id
	// so duplicate-id errors can name both plugins.
	const exportOwners = new Map<string, string>();
	// Track the index of the plugin that registered each meta.id so a
	// second plugin with the same id produces a loud compile error
	// instead of silently coexisting (which would duplicate lifecycle
	// hook invocations and double-register header actions).
	const pluginIdOwners = new Set<string>();
	const headerActions: StudioHeaderAction[] = [];
	const puckPlugins: PuckPlugin[] = [];
	const overrides: Partial<PuckOverrides>[] = [];
	// Stable-sortable buffers: capture (item, registrationIndex) so the
	// final sort can use the index as a tiebreaker, preserving
	// declaration order when `order` values tie.
	const providerEntries: { item: StudioPluginProvider; index: number }[] = [];
	const overlayEntries: { item: StudioPluginOverlay; index: number }[] = [];
	const slots = new Map<string, StudioPluginSlotContribution>();
	// Track which plugin first claimed each slot id so a duplicate warn
	// can name the original owner.
	const slotOwners = new Map<string, string>();
	const pluginCtx: StudioPluginContext = {
		...ctx,
		registerAssetResolver: (resolver) => {
			assetResolvers.push(resolver);
			ctx.registerAssetResolver(resolver);
		},
		getAssetResolvers: () => assetResolvers,
	};

	for (const [index, plugin] of plugins.entries()) {
		if (isStudioPlugin(plugin)) {
			const meta = plugin.meta;

			if (pluginIdOwners.has(meta.id)) {
				throw new StudioPluginError(
					meta.id,
					`Plugin "${meta.id}" is registered more than once. Plugin meta.id must be unique across the plugin array.`,
				);
			}
			pluginIdOwners.add(meta.id);

			if (!isCoreVersionCompatible(meta.coreVersion)) {
				throw new StudioPluginError(
					meta.id,
					`Plugin "${meta.id}" requires @anvilkit/core "${meta.coreVersion}" but the installed version is "${CORE_VERSION}"`,
				);
			}

			let registration: StudioPluginRegistration;
			try {
				registration = await plugin.register(pluginCtx);
			} catch (error) {
				if (error instanceof StudioPluginError) {
					throw error;
				}
				throw new StudioPluginError(
					meta.id,
					`Plugin "${meta.id}" failed to register`,
					{ cause: error },
				);
			}

			pluginMeta.push(meta);
			registrations.push(registration);

			// Header actions: pass through verbatim. `core-009`'s
			// `composeHeaderActions()` is responsible for dedupe and
			// ordering — duplicate ids are not an error here.
			if (registration.headerActions) {
				for (const action of registration.headerActions) {
					headerActions.push(action);
				}
			}

			// Export formats: strict duplicate-id detection. Two
			// plugins contributing the same format id is a compile
			// error because the dispatch layer keys on `id`.
			if (registration.exportFormats) {
				for (const format of registration.exportFormats) {
					const existingOwner = exportOwners.get(format.id);
					if (existingOwner !== undefined) {
						throw new StudioPluginError(
							meta.id,
							`Plugins "${existingOwner}" and "${meta.id}" both register an export format with id "${format.id}"`,
						);
					}
					exportOwners.set(format.id, meta.id);
					exportFormats.set(format.id, format);
				}
			}

			// Overrides: push the raw per-plugin slice onto the
			// registration-ordered array. The curried per-key composition
			// happens in `mergeOverrides()` (`core-014`) — keeping it out
			// of `runtime/` preserves the React-free boundary
			// (architecture §17).
			if (registration.overrides) {
				overrides.push(registration.overrides as Partial<PuckOverrides>);
			}

			// Providers / overlays / slots: opaque React contributions
			// the `<Studio>` shell (`core-014`) consumes. The runtime
			// layer never instantiates these — it only routes them.
			if (registration.providers) {
				for (const provider of registration.providers) {
					providerEntries.push({ item: provider, index });
				}
			}
			if (registration.overlays) {
				for (const overlay of registration.overlays) {
					overlayEntries.push({ item: overlay, index });
				}
			}
			if (registration.slots) {
				for (const slot of registration.slots) {
					const existingOwner = slotOwners.get(slot.id);
					if (existingOwner !== undefined) {
						// First registration wins — warn the host so a
						// silent collision doesn't go unnoticed, but do not
						// throw (slots are presentation, not correctness).
						pluginCtx.log(
							"warn",
							`Plugin "${meta.id}" tried to claim slot "${slot.id}" but plugin "${existingOwner}" already registered it. First registration wins.`,
							{ slotId: slot.id, attemptedBy: meta.id, owner: existingOwner },
						);
						continue;
					}
					slotOwners.set(slot.id, meta.id);
					slots.set(slot.id, slot);
				}
			}

			continue;
		}

		if (isPuckPlugin(plugin)) {
			puckPlugins.push(plugin);
			continue;
		}

		// Neither guard matched — fabricate an id from the array
		// index so the error message is still actionable.
		throw new StudioPluginError(
			`plugin[${index}]`,
			`Element at index ${index} is neither a StudioPlugin nor a PuckPlugin`,
		);
	}

	// Stable-sort providers and overlays by `(order ?? 100, index)`.
	// `Array.prototype.sort` is stable in Node ≥ 12 / all evergreen
	// browsers, but we encode the registration index in the compare so
	// the contract holds even if a future engine regresses.
	const sortedProviders = providerEntries
		.slice()
		.sort((a, b) => {
			const aOrder = a.item.order ?? 100;
			const bOrder = b.item.order ?? 100;
			if (aOrder !== bOrder) return aOrder - bOrder;
			return a.index - b.index;
		})
		.map((entry) => entry.item);
	const sortedOverlays = overlayEntries
		.slice()
		.sort((a, b) => {
			const aOrder = a.item.order ?? 100;
			const bOrder = b.item.order ?? 100;
			if (aOrder !== bOrder) return aOrder - bOrder;
			return a.index - b.index;
		})
		.map((entry) => entry.item);

	return {
		pluginMeta,
		registrations,
		lifecycle: createLifecycleManager(registrations, options.lifecycle),
		exportFormats,
		assetResolvers,
		headerActions,
		overrides,
		providers: sortedProviders,
		overlays: sortedOverlays,
		slots,
		puckPlugins,
	};
}
