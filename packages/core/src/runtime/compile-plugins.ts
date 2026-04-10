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

import type { ExportFormatDefinition } from "../types/export.js";
import type {
	StudioHeaderAction,
	StudioPlugin,
	StudioPluginContext,
	StudioPluginMeta,
	StudioPluginRegistration,
} from "../types/plugin.js";
import { isPuckPlugin, isStudioPlugin } from "./detect-plugin.js";
import { StudioPluginError } from "./errors.js";
import {
	createLifecycleManager,
	type LifecycleManager,
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
	 * Raw Puck plugin objects, passed through to `<Puck plugins={…}>`
	 * verbatim. These do not participate in the Studio lifecycle.
	 */
	readonly puckPlugins: readonly PuckPlugin[];
}

/**
 * Minimal, intentionally-naive semver range check.
 *
 * The runtime supports the two forms Studio plugins actually use in
 * the alpha line:
 *
 * 1. Exact match — `"0.1.0-alpha.0"` matches only the current Core.
 * 2. Caret / tilde prefix — `"^0.1.0-alpha"` or `"~0.1.0"` matches
 *    any Core version whose `CORE_VERSION` starts with the stripped
 *    base.
 *
 * **Deliberately not** pulling in `semver` yet — this check stays
 * well under the "~30 lines" threshold the task brief allows before
 * introducing the dependency. If plugins start needing richer ranges
 * (`>=0.1.0 <0.2.0`, disjunctions, etc.) add `semver` then.
 */
function isCoreVersionCompatible(requested: string): boolean {
	// Strip a single leading range operator. Anything else is treated
	// as an exact-version literal.
	const stripped = requested.replace(/^[\^~]/, "").trim();
	if (stripped.length === 0) {
		return false;
	}

	if (CORE_VERSION === stripped) {
		return true;
	}

	// `^0.1.0-alpha` against `0.1.0-alpha.0` → the installed version
	// should start with the stripped range and be followed by either
	// end-of-string or a `.` / `-` separator. Anything else (e.g.
	// `^0.1` against `0.10.0`) would otherwise be a false positive.
	if (CORE_VERSION.startsWith(stripped)) {
		const nextChar = CORE_VERSION.charAt(stripped.length);
		return nextChar === "" || nextChar === "." || nextChar === "-";
	}

	return false;
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
export async function compilePlugins(
	plugins: readonly (StudioPlugin | PuckPlugin)[],
	ctx: StudioPluginContext,
): Promise<StudioRuntime> {
	const pluginMeta: StudioPluginMeta[] = [];
	const registrations: StudioPluginRegistration[] = [];
	const exportFormats = new Map<string, ExportFormatDefinition>();
	// Track the plugin that first registered each export format id
	// so duplicate-id errors can name both plugins.
	const exportOwners = new Map<string, string>();
	const headerActions: StudioHeaderAction[] = [];
	const puckPlugins: PuckPlugin[] = [];
	const overrides: Partial<PuckOverrides>[] = [];

	for (const [index, plugin] of plugins.entries()) {
		if (isStudioPlugin(plugin)) {
			const meta = plugin.meta;

			if (!isCoreVersionCompatible(meta.coreVersion)) {
				throw new StudioPluginError(
					meta.id,
					`Plugin "${meta.id}" requires @anvilkit/core "${meta.coreVersion}" but the installed version is "${CORE_VERSION}"`,
				);
			}

			let registration: StudioPluginRegistration;
			try {
				registration = await plugin.register(ctx);
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

	return {
		pluginMeta,
		lifecycle: createLifecycleManager(registrations),
		exportFormats,
		headerActions,
		overrides,
		puckPlugins,
	};
}
