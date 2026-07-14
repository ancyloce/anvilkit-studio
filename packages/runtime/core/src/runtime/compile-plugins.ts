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

import type { RegistryEntry } from "@/i18n/registry";
import type { ExportFormatDefinition } from "@/types/export";
import type {
	IRAssetResolver,
	StudioHeaderAction,
	StudioPlugin,
	StudioPluginContext,
	StudioPluginLifecycleHooks,
	StudioPluginMeta,
	StudioPluginOverlay,
	StudioPluginProvider,
	StudioPluginRegistration,
	StudioPluginSlotContribution,
} from "@/types/plugin";
import type { StudioSidebarUnregister } from "@/types/sidebar";
import { isPuckPlugin, isStudioPlugin } from "./detect-plugin.js";
import { StudioPluginError } from "./errors.js";
import {
	createLifecycleManager,
	type LifecycleManager,
	type LifecycleManagerOptions,
} from "./lifecycle-manager.js";
import { isCoreVersionCompatible } from "./semver.js";
import {
	createSidebarRegistry,
	type StudioSidebarContributions,
} from "./sidebar-registry.js";
import { createSingleOccupancyRegistry } from "./single-occupancy-registry.js";
import { CORE_VERSION } from "./version.js";

/**
 * i18n namespaces owned by core — a plugin may not register messages under
 * any of these (`compilePlugins` throws). `studio` is the chrome catalog and
 * `canvas` is the canvas-editor surface. (`assetManager` was reserved
 * transitionally; `@anvilkit/plugin-asset-manager` now owns it directly.)
 */
const RESERVED_I18N_NAMESPACES: ReadonlySet<string> = new Set([
	"studio",
	"canvas",
]);

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
	 * registered, in compile order (declaration order unless a plugin sets
	 * `order` / `dependsOn`). Diagnostic surface only — the runtime does not
	 * re-read fields from here after compile.
	 */
	readonly pluginMeta: readonly StudioPluginMeta[];
	/**
	 * The raw plugin registrations in compile order (declaration order
	 * unless a plugin sets `order` / `dependsOn`), as returned by each
	 * plugin's `register()`. Primarily consumed by the
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
	 */
	readonly slots: ReadonlyMap<string, StudioPluginSlotContribution>;
	/**
	 * Raw Puck plugin objects, passed through to `<Puck plugins={…}>`
	 * verbatim. These do not participate in the Studio lifecycle.
	 */
	readonly puckPlugins: readonly PuckPlugin[];
	/**
	 * Plugin-contributed sidebar surfaces (insert sections, layer
	 * quick-adds, asset source/actions, copy packs, copilot/history/
	 * design-system panels), collected React-free during compile
	 * (review finding **AR-b**). Mirrors {@link assetResolvers}: the
	 * runtime owns the collection so headless consumers (CLI exporter,
	 * `@anvilkit/core/testing`) read contributions directly, while the
	 * React `sidebar-registry-store` remains the live view the chrome
	 * renders from (both are written in lock-step during compile).
	 */
	readonly sidebar: StudioSidebarContributions;
	/**
	 * Plugin-contributed i18n message bundles, in registration order,
	 * collected React-free during compile via `ctx.registerMessages`. The
	 * React `EditorI18nProvider` prepends the core `studio.*` entry and
	 * merges these so plugin namespaces join the catalog `useMsg` resolves.
	 */
	readonly i18n: {
		readonly entries: readonly RegistryEntry[];
	};
}

/**
 * Compile an ordered, mixed array of plugin objects into a ready-to-
 * mount {@link StudioRuntime}.
 *
 * See the file-level JSDoc for the error surface. Plugins are first
 * ordered by `dependsOn` (topological) then `(order, declaration index)`
 * — a constraint-free array keeps declaration order exactly — and then
 * processed in that compile order, so error messages refer to the first
 * offending plugin in compile order and the resulting registries (export
 * formats, header actions, override merge) honor the caller's intent.
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
	/**
	 * Polled before each plugin's `register()` call; when it returns `true`
	 * the compile stops and throws instead of continuing. Without this, a
	 * superseded compile (the caller started a newer one — e.g. `<Studio>`'s
	 * plugin-array/config fingerprint changed while this one was still
	 * awaiting a lazy plugin's dynamic import) keeps calling `register()` on
	 * every remaining plugin to completion, racing the newer compile into
	 * the SAME single-occupancy sidebar surfaces / shared registries — two
	 * live compiles can each land a registration before either one's
	 * `onDestroy` has a chance to clear the other's, which reads as a bogus
	 * "surface already registered" warning even though only one compile was
	 * ever meant to win. `<Studio>` passes its existing stale-generation
	 * check here so the loser stops advancing the moment it is superseded,
	 * instead of only noticing after every plugin has already run.
	 */
	readonly isAborted?: () => boolean;
}

/**
 * Thrown by {@link compilePlugins} when `options.isAborted` reports true
 * between two plugins' `register()` calls. Callers that pass `isAborted`
 * already treat "this compile is stale" as a silent no-op (the same path a
 * stale compile's `isStale()` check after `compilePlugins` resolves already
 * takes), so this is a plain `Error`, not a `StudioPluginError` — it never
 * reaches a host's `onError`.
 */
class CompileAbortedError extends Error {
	constructor() {
		super("compilePlugins aborted: superseded by a newer compile");
		this.name = "CompileAbortedError";
	}
}

/**
 * Wrap the per-instance `pluginCtx` so every sidebar-style register
 * call (the ones that return an unregister handle) records its handle
 * in `collected`. Returns a ctx the plugin sees as identical to the
 * base, plus the same unregister handle the plugin can still call
 * itself — the registry's `register*` implementations are idempotent
 * on second unregister, so well-behaved plugins are unaffected.
 *
 * Used together with {@link withAutoTeardown} to invoke every
 * collected handle from `onDestroy`, so a plugin that forgets cleanup
 * cannot leak sidebar registrations across remounts.
 */
function wrapRegisterMethodsForTeardown(
	pluginCtx: StudioPluginContext,
	collected: StudioSidebarUnregister[],
): StudioPluginContext {
	function track<T>(
		fn: ((arg: T) => StudioSidebarUnregister) | undefined,
	): ((arg: T) => StudioSidebarUnregister) | undefined {
		if (fn === undefined) return undefined;
		return (arg) => {
			const handle = fn(arg);
			collected.push(handle);
			return handle;
		};
	}
	return {
		...pluginCtx,
		registerInsertSection: track(pluginCtx.registerInsertSection),
		registerLayerQuickAdd: track(pluginCtx.registerLayerQuickAdd),
		registerAssetSource: track(pluginCtx.registerAssetSource),
		registerAssetAction: track(pluginCtx.registerAssetAction),
		registerCopySnippetPack: track(pluginCtx.registerCopySnippetPack),
		registerCopilotPanel: track(pluginCtx.registerCopilotPanel),
		registerHistoryPanel: track(pluginCtx.registerHistoryPanel),
		registerDesignSystemPanel: track(pluginCtx.registerDesignSystemPanel),
		registerSeoPanel: track(pluginCtx.registerSeoPanel),
		registerPageSettingsSeoFields: track(
			pluginCtx.registerPageSettingsSeoFields,
		),
	};
}

/**
 * Wrap a plugin's lifecycle hooks so the supplied `collected`
 * unregister handles fire **after** the plugin's own `onDestroy`
 * (whether it was defined or not). Iterates in LIFO order and
 * swallows handle errors via `ctx.log` so one bad cleanup cannot
 * abort the rest of the teardown.
 */
function withAutoTeardown<UserConfig extends import("@puckeditor/core").Config>(
	hooks: StudioPluginLifecycleHooks<UserConfig> | undefined,
	collected: StudioSidebarUnregister[],
	pluginId: string,
): StudioPluginLifecycleHooks<UserConfig> {
	const userOnDestroy = hooks?.onDestroy;
	return {
		...hooks,
		onDestroy: async (ctx) => {
			if (userOnDestroy !== undefined) {
				try {
					await userOnDestroy(ctx);
				} catch (error) {
					// Pass the raw error — `normalizeLogError` (in the sink) folds in
					// name + message + stack. Pre-extracting `.message` collapses an
					// empty-message Error to `{}` and discards the stack.
					ctx.log("error", `Plugin "${pluginId}" onDestroy threw`, { error });
				}
			}
			for (let i = collected.length - 1; i >= 0; i -= 1) {
				try {
					collected[i]?.();
				} catch (error) {
					// Raw error (see the `onDestroy` catch above).
					ctx.log("error", `Plugin "${pluginId}" auto-teardown handle threw`, {
						error,
					});
				}
			}
			collected.length = 0;
		},
	};
}

/**
 * Default `order` for providers/overlays that omit one — they sort
 * after any explicitly-ordered contribution but keep declaration order
 * among themselves (via the registration-index tiebreaker).
 */
const DEFAULT_PLUGIN_ORDER = 100;

/**
 * Stable-sort comparator for `(order ?? DEFAULT_PLUGIN_ORDER, index)`
 * entries (review finding **N-d** — was duplicated for providers and
 * overlays). Encodes the registration index so the contract holds even
 * if a future engine regresses on `Array.prototype.sort` stability.
 */
function sortByOrderThenIndex<T extends { readonly order?: number }>(
	a: { readonly item: T; readonly index: number },
	b: { readonly item: T; readonly index: number },
): number {
	const aOrder = a.item.order ?? DEFAULT_PLUGIN_ORDER;
	const bOrder = b.item.order ?? DEFAULT_PLUGIN_ORDER;
	if (aOrder !== bOrder) return aOrder - bOrder;
	return a.index - b.index;
}

/**
 * Combine two `unregister()` handles into one (review finding
 * **AR-b**). Used to fan a single plugin `register*` call out to both
 * the runtime sidebar registry and the host ctx's view; either half may
 * be absent (`undefined`) for a hand-written test ctx.
 */
function combineUnregister(
	a: StudioSidebarUnregister,
	b: StudioSidebarUnregister | undefined,
): StudioSidebarUnregister {
	return () => {
		a();
		b?.();
	};
}

/**
 * Topologically order the plugin array so each plugin compiles **after** every
 * plugin it {@link StudioPluginMeta.dependsOn}, breaking ties (plugins with no
 * dependency relation) by `(meta.order ?? DEFAULT_PLUGIN_ORDER, declaration
 * index)`. Puck plugins carry no meta, so they sort at the default order by
 * declaration index.
 *
 * When no plugin declares `order` or `dependsOn`, the input array is returned
 * unchanged — the common case stays byte-for-byte identical. Throws a
 * {@link StudioPluginError} when a `dependsOn` id is absent from the array or
 * the dependency graph contains a cycle.
 */
function orderPlugins(
	plugins: readonly (StudioPlugin | PuckPlugin)[],
): readonly (StudioPlugin | PuckPlugin)[] {
	interface PluginNode {
		readonly plugin: StudioPlugin | PuckPlugin;
		readonly index: number;
		readonly id: string | null;
		readonly order: number;
		readonly dependsOn: readonly string[];
		readonly explicitOrder: boolean;
	}
	const nodes: PluginNode[] = plugins.map((plugin, index) =>
		isStudioPlugin(plugin)
			? {
					plugin,
					index,
					id: plugin.meta.id,
					order: plugin.meta.order ?? DEFAULT_PLUGIN_ORDER,
					dependsOn: plugin.meta.dependsOn ?? [],
					explicitOrder: plugin.meta.order !== undefined,
				}
			: {
					plugin,
					index,
					id: null,
					order: DEFAULT_PLUGIN_ORDER,
					dependsOn: [],
					explicitOrder: false,
				},
	);

	// Common case: nobody asked for a specific order → leave the array exactly
	// as declared (zero behavior change for existing plugin sets).
	const hasConstraints = nodes.some(
		(node) => node.dependsOn.length > 0 || node.explicitOrder,
	);
	if (!hasConstraints) {
		return plugins;
	}

	const byId = new Map<string, PluginNode>();
	for (const node of nodes) {
		if (node.id !== null) {
			byId.set(node.id, node);
		}
	}

	const indegree = new Map<PluginNode, number>(nodes.map((node) => [node, 0]));
	const dependents = new Map<PluginNode, PluginNode[]>(
		nodes.map((node) => [node, []]),
	);
	for (const node of nodes) {
		for (const depId of node.dependsOn) {
			const dependency = byId.get(depId);
			if (dependency === undefined) {
				throw new StudioPluginError(
					node.id ?? `#${node.index}`,
					`Plugin "${node.id}" declares dependsOn "${depId}", which is not present in the plugin array.`,
				);
			}
			dependents.get(dependency)?.push(node);
			indegree.set(node, (indegree.get(node) ?? 0) + 1);
		}
	}

	// Kahn's algorithm; among ready (in-degree 0) nodes, emit the lowest
	// `(order, index)` first so `order` and declaration order break ties.
	const byOrderThenIndex = (a: PluginNode, b: PluginNode): number =>
		a.order - b.order || a.index - b.index;
	const ready = nodes.filter((node) => (indegree.get(node) ?? 0) === 0);
	const ordered: PluginNode[] = [];
	while (ready.length > 0) {
		ready.sort(byOrderThenIndex);
		const node = ready.shift();
		if (node === undefined) {
			break;
		}
		ordered.push(node);
		for (const dependent of dependents.get(node) ?? []) {
			const next = (indegree.get(dependent) ?? 0) - 1;
			indegree.set(dependent, next);
			if (next === 0) {
				ready.push(dependent);
			}
		}
	}

	if (ordered.length !== nodes.length) {
		const orderedSet = new Set(ordered);
		const cyclic = nodes.flatMap((node) =>
			orderedSet.has(node) ? [] : [node.id ?? `#${node.index}`],
		);
		throw new StudioPluginError(
			cyclic[0] ?? "(unknown)",
			`Plugin dependency cycle detected among: ${cyclic.join(", ")}.`,
		);
	}
	return ordered.map((node) => node.plugin);
}

export async function compilePlugins(
	plugins: readonly (StudioPlugin | PuckPlugin)[],
	ctx: StudioPluginContext,
	options: CompilePluginsOptions = {},
): Promise<StudioRuntime> {
	// Order by `dependsOn` (topological) then `(order, declaration index)`
	// before compiling, so first-registration-wins contributions resolve in
	// the host's intended order. A constraint-free array passes through
	// unchanged; a missing dependency / cycle throws here.
	const orderedPlugins = orderPlugins(plugins);
	const pluginMeta: StudioPluginMeta[] = [];
	const registrations: StudioPluginRegistration[] = [];
	const assetResolvers: IRAssetResolver[] = [];
	// AR-b: the runtime owns a React-free collection of every sidebar
	// contribution, exposed on `runtime.sidebar` for headless consumers.
	const sidebar = createSidebarRegistry();
	// A-6: plugin-id and export-format-id uniqueness are now enforced
	// through single-occupancy registries with a `conflict: "error"`
	// policy (the first owner wins; a duplicate throws a typed
	// StudioPluginError from `onConflict`) instead of bespoke imperative
	// `has()`/throw dances. `entries()` preserves declaration order.
	const pluginIdRegistry = createSingleOccupancyRegistry<true>({
		conflict: "error",
		onConflict: (info) => {
			throw new StudioPluginError(
				info.incomingOwner,
				`Plugin "${info.incomingOwner}" is registered more than once. Plugin meta.id must be unique across the plugin array.`,
			);
		},
	});
	const exportFormatRegistry =
		createSingleOccupancyRegistry<ExportFormatDefinition>({
			conflict: "error",
			onConflict: (info) => {
				throw new StudioPluginError(
					info.incomingOwner,
					`Plugins "${info.currentOwner}" and "${info.incomingOwner}" both register an export format with id "${info.id}"`,
				);
			},
		});
	const headerActions: StudioHeaderAction[] = [];
	const puckPlugins: PuckPlugin[] = [];
	const overrides: Partial<PuckOverrides>[] = [];
	// Stable-sortable buffers: capture (item, registrationIndex) so the
	// final sort can use the index as a tiebreaker, preserving
	// declaration order when `order` values tie.
	const providerEntries: { item: StudioPluginProvider; index: number }[] = [];
	const overlayEntries: { item: StudioPluginOverlay; index: number }[] = [];
	// i18n: collect each plugin's namespaced message bundle React-free.
	// Reserved namespaces are core-owned; a plugin must use its own slug,
	// and must register a given namespace at most once per compile.
	const messageEntries: RegistryEntry[] = [];
	const registeredI18nNamespaces = new Set<string>();
	const pluginCtx: StudioPluginContext = {
		...ctx,
		registerMessages: (entry) => {
			const { namespace } = entry;
			if (RESERVED_I18N_NAMESPACES.has(namespace)) {
				throw new StudioPluginError(
					namespace,
					`i18n namespace "${namespace}" is reserved by core — a plugin must register under its own unique slug.`,
				);
			}
			if (registeredI18nNamespaces.has(namespace)) {
				throw new StudioPluginError(
					namespace,
					`i18n namespace "${namespace}" is already registered — each plugin must use a unique namespace and register it once.`,
				);
			}
			registeredI18nNamespaces.add(namespace);
			messageEntries.push(entry);
		},
		registerAssetResolver: (resolver) => {
			assetResolvers.push(resolver);
			ctx.registerAssetResolver(resolver);
		},
		getAssetResolvers: () => assetResolvers,
		// AR-b: record each sidebar contribution into the runtime
		// registry (so `runtime.sidebar` is populated for headless
		// consumers) AND delegate to the host ctx's view (the React
		// `sidebar-registry-store`, which drives the live chrome) —
		// mirroring the `registerAssetResolver` push-then-delegate
		// pattern. The combined unregister removes from both halves;
		// `wrapRegisterMethodsForTeardown` collects it for auto-teardown.
		registerInsertSection: (section) =>
			combineUnregister(
				sidebar.registerInsertSection(section),
				ctx.registerInsertSection?.(section),
			),
		registerLayerQuickAdd: (item) =>
			combineUnregister(
				sidebar.registerLayerQuickAdd(item),
				ctx.registerLayerQuickAdd?.(item),
			),
		registerAssetSource: (source) =>
			combineUnregister(
				sidebar.registerAssetSource(source),
				ctx.registerAssetSource?.(source),
			),
		registerAssetAction: (action) =>
			combineUnregister(
				sidebar.registerAssetAction(action),
				ctx.registerAssetAction?.(action),
			),
		registerCopySnippetPack: (pack) =>
			combineUnregister(
				sidebar.registerCopySnippetPack(pack),
				ctx.registerCopySnippetPack?.(pack),
			),
		registerCopilotPanel: (panel) =>
			combineUnregister(
				sidebar.registerCopilotPanel(panel),
				ctx.registerCopilotPanel?.(panel),
			),
		registerHistoryPanel: (panel) =>
			combineUnregister(
				sidebar.registerHistoryPanel(panel),
				ctx.registerHistoryPanel?.(panel),
			),
		registerDesignSystemPanel: (panel) =>
			combineUnregister(
				sidebar.registerDesignSystemPanel(panel),
				ctx.registerDesignSystemPanel?.(panel),
			),
		registerSeoPanel: (panel) =>
			combineUnregister(
				sidebar.registerSeoPanel(panel),
				ctx.registerSeoPanel?.(panel),
			),
		registerPageSettingsSeoFields: (fields) =>
			combineUnregister(
				sidebar.registerPageSettingsSeoFields(fields),
				ctx.registerPageSettingsSeoFields?.(fields),
			),
	};
	// Slots are single-occupancy with a "first registration wins"
	// policy. The policy is now a value (A4) instead of an imperative
	// has()/warn()/continue dance; `onConflict` keeps the exact
	// host-facing warn at this layer.
	const slotRegistry =
		createSingleOccupancyRegistry<StudioPluginSlotContribution>({
			conflict: "first",
			onConflict: (info) => {
				pluginCtx.log(
					"warn",
					`Plugin "${info.incomingOwner}" tried to claim slot "${info.id}" but plugin "${info.currentOwner}" already registered it. First registration wins.`,
					{
						slotId: info.id,
						attemptedBy: info.incomingOwner,
						owner: info.currentOwner,
					},
				);
			},
		});

	for (const [index, plugin] of orderedPlugins.entries()) {
		if (options.isAborted?.()) {
			throw new CompileAbortedError();
		}
		if (isStudioPlugin(plugin)) {
			const meta = plugin.meta;

			// Throws via `onConflict` on a duplicate meta.id (A-6).
			pluginIdRegistry.claim(meta.id, meta.id, true);

			if (!isCoreVersionCompatible(meta.coreVersion)) {
				throw new StudioPluginError(
					meta.id,
					`Plugin "${meta.id}" requires @anvilkit/core "${meta.coreVersion}" but the installed version is "${CORE_VERSION}"`,
				);
			}

			const collectedUnregisters: StudioSidebarUnregister[] = [];
			const wrappedCtx = wrapRegisterMethodsForTeardown(
				pluginCtx,
				collectedUnregisters,
			);

			let registration: StudioPluginRegistration;
			try {
				registration = await plugin.register(wrappedCtx);
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
			registrations.push({
				...registration,
				hooks: withAutoTeardown(
					registration.hooks,
					collectedUnregisters,
					meta.id,
				),
			});

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
			// error because the dispatch layer keys on `id`. The
			// single-occupancy registry throws via `onConflict` (A-6).
			if (registration.exportFormats) {
				for (const format of registration.exportFormats) {
					exportFormatRegistry.claim(format.id, meta.id, format);
				}
			}

			// Overrides: push the raw per-plugin slice onto the
			// registration-ordered array. The curried per-key composition
			// happens in `mergeOverrides()` (`core-014`) — keeping it out
			// of `runtime/` preserves the React-free boundary
			// (architecture §17). `registration.overrides` is already
			// `Partial<PuckOverrides>` at the default config (TS-e).
			if (registration.overrides) {
				overrides.push(registration.overrides);
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
					// Single-occupancy: registry enforces "first wins"
					// and fires the warn via onConflict. Slots are
					// presentation, not correctness, so no throw.
					slotRegistry.claim(slot.id, meta.id, slot);
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

	// Stable-sort providers and overlays by
	// `(order ?? DEFAULT_PLUGIN_ORDER, index)` via the shared comparator
	// (N-d). `Array.prototype.sort` is stable in Node ≥ 12 / all
	// evergreen browsers, but the comparator encodes the registration
	// index so the contract holds even if a future engine regresses.
	const sortedProviders = providerEntries
		.slice()
		.sort(sortByOrderThenIndex)
		.map((entry) => entry.item);
	const sortedOverlays = overlayEntries
		.slice()
		.sort(sortByOrderThenIndex)
		.map((entry) => entry.item);

	return {
		pluginMeta,
		registrations,
		lifecycle: createLifecycleManager(registrations, options.lifecycle),
		exportFormats: new Map(exportFormatRegistry.entries()),
		assetResolvers,
		headerActions,
		overrides,
		providers: sortedProviders,
		overlays: sortedOverlays,
		slots: new Map(slotRegistry.entries()),
		puckPlugins,
		sidebar: sidebar.snapshot(),
		i18n: { entries: messageEntries },
	};
}
