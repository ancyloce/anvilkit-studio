/**
 * @file The public `<Studio>` shell component (task `core-014`).
 *
 * `<Studio>` is the top-level Studio entry point host apps render.
 * It wraps `@puckeditor/core`'s `<Puck>` and takes responsibility for
 * every piece of Core's runtime plumbing:
 *
 * 1. **Config assembly.** Builds a validated {@link StudioConfig} via
 *    {@link createStudioConfig} and publishes it through
 *    {@link StudioConfigProvider} so `useStudioConfig()` works in any
 *    descendant.
 * 2. **Plugin compilation.** Runs the plugin array through
 *    {@link compilePlugins} — async, because plugins may be async —
 *    and publishes the resulting {@link StudioRuntime} through
 *    {@link StudioRuntimeProvider} so `useStudio()` works.
 * 3. **Override composition.** Folds plugin-contributed overrides
 *    (`runtime.overrides`) together with the consumer's own
 *    `overrides` prop via {@link mergeOverrides}. Consumer overrides
 *    are appended last so they compose **outermost** — the consumer
 *    always has the final word on what the user sees.
 * 4. **Lifecycle wiring.** Subscribes Puck's `onChange` and
 *    `onPublish` callbacks to the Studio lifecycle bus:
 *    - `onChange` → `onDataChange` (fire-and-forget) → forward to
 *      consumer.
 *    - `onPublish` → `onBeforePublish` (awaited; first throw aborts
 *      the publish) → consumer's `onPublish` → `onAfterPublish`.
 *    - Mount fires `onInit`, unmount fires `onDestroy` and resets the
 *      export / AI stores so a remount with a different plugin set
 *      does not surface the previous session's state.
 * 5. **Store population.** Writes the compiled export format ids into
 *    `useExportStore.setState({ availableFormats })` on mount so
 *    header UIs can read them reactively.
 * 6. **Legacy `aiHost` compat.** Dynamically imports
 *    `@anvilkit/core/compat/ai-host-adapter` when the legacy
 *    `props.aiHost` string is present and prepends the adapter to the
 *    plugin list. The dynamic import keeps the adapter tree-shakable
 *    — consumers who never pass `aiHost` ship zero adapter bytes.
 *
 * ### Loading state
 *
 * `compilePlugins()` is async, so `<Studio>` renders `null` until the
 * runtime resolves. Per the task spec: **no Suspense, no spinner** —
 * the loading path is deliberately minimal. Host apps that want a
 * branded loading state can render one above `<Studio>` with their
 * own state management.
 *
 * ### `getPuckApi` placement
 *
 * The {@link StudioPluginContext} carries a `getPuckApi()` accessor
 * plugins use to dispatch Puck actions from lifecycle hooks and
 * header-action onClick handlers. Binding the live
 * `usePuck()` result into a ref requires a helper component living
 * **inside** the Puck subtree — which this file does by composing a
 * tiny `<PuckApiBinder>` into the `puck` override slot alongside
 * {@link mergeOverrides}. The binder uses Puck's own `useGetPuck()`
 * hook, writes the returned snapshot function onto a ref, and
 * renders `{children}` verbatim so it does not perturb the editor
 * layout.
 *
 * @see {@link https://github.com/anvilkit/studio/blob/main/docs/tasks/core-014-studio-component.md | core-014}
 */

import type { DeepPartial } from "@anvilkit/utils";
import {
	Puck,
	type Config as PuckConfig,
	type Data as PuckData,
	type OnAction as PuckOnAction,
	type Overrides as PuckOverrides,
	type Plugin as PuckPlugin,
	type UiState as PuckUiState,
	type Viewports as PuckViewports,
	useGetPuck,
} from "@puckeditor/core";
import {
	type ComponentType,
	type ReactElement,
	type ReactNode,
	type RefObject,
	useCallback,
	useEffect,
	useId,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";

import { StudioConfigProvider } from "@/config/provider";
import {
	ChromePropsProvider,
	type CollaboratorsSlotValue,
} from "@/context/chrome-props";
import { StudioPagesSourceProvider } from "@/context/pages-source";
import { StudioPluginContextProvider } from "@/context/plugin-context";
import { StudioRuntimeProvider } from "@/hooks/use-studio";
import { DEFAULT_INSERT_SECTIONS } from "@/layout/sidebar/modules/insert/default-sections";
import { mergeOverrides } from "@/overrides/merge-overrides";
import type { StudioChromeMode } from "@/overrides/types";
import { Toaster } from "@/primitives/sonner";
import { TooltipProvider } from "@/primitives/tooltip";
import { jsonExportPlugin } from "@/runtime/built-in-formats/json-export-plugin";
import { compilePlugins, type StudioRuntime } from "@/runtime/compile-plugins";
import {
	createSidebarRegistryStore,
	EditorI18nStoreProvider,
	EditorUiStoreProvider,
	SidebarRegistryProvider,
	type SidebarRegistryStoreApi,
	StudioRootProvider,
} from "@/state/index";
import {
	type AiStoreApi,
	AiStoreProvider,
	createAiStore,
	createExportStore,
	createThemeStore,
	type ExportStoreApi,
	ExportStoreProvider,
	type ThemeStoreApi,
	ThemeStoreProvider,
} from "@/stores/index";
import {
	mergeStudioUi,
	resolveStudioViewports,
} from "@/studio/ui/merge-studio-ui";
import { useThemeSync } from "@/theme/use-theme-sync";
import type { StudioConfig } from "@/types/config";
import type { StudioPagesSource } from "@/types/pages";
import type {
	StudioLogLevel,
	StudioPlugin,
	StudioPluginContext,
	StudioPluginOverlay,
	StudioPluginProvider,
	StudioPluginSlotContribution,
} from "@/types/plugin";

/**
 * Prefix for the per-instance fallback `storeId` derived from
 * `useId()` when the host omits the prop. Replaces the old shared
 * `"default"` literal so two `<Studio>` instances never collide on
 * persisted store keys (review finding H3).
 */
const FALLBACK_STORE_ID_PREFIX = "anvilkit";
const DEFAULT_CHROME_MODE: StudioChromeMode = "anvilkit";

export type StudioLogger = (
	level: StudioLogLevel,
	message: string,
	meta?: Readonly<Record<string, unknown>>,
) => void;

interface CompiledStudioRuntime {
	readonly runtime: StudioRuntime;
	readonly studioConfig: StudioConfig;
	readonly ctx: StudioPluginContext;
}

/**
 * Tiny hook-runner so `useThemeSync` can sit inside the provider
 * tree without `<Studio>` itself becoming a hook-only consumer of
 * the store. Returns null — this component only exists for its
 * effect.
 */
function ThemeSyncBoundary(): null {
	useThemeSync();
	return null;
}

/**
 * Reduce a sorted array of plugin-contributed providers into a single
 * wrapped subtree. The provider at index 0 of the sorted array becomes
 * the **outermost** wrapper; the rightmost provider sits closest to
 * the children.
 *
 * The caller is responsible for passing providers in already-sorted
 * order. `compilePlugins()` does the sort (`(order ?? 100,
 * registrationIndex)`), so consumers of `runtime.providers` can pass
 * the array verbatim.
 *
 * Exported so the contract can be unit-tested without mounting the
 * entire `<Studio>` shell.
 */
export function composePluginProviders(
	providers: readonly StudioPluginProvider[],
	children: ReactNode,
): ReactNode {
	return providers.reduceRight<ReactNode>((wrapped, provider) => {
		const ProviderComponent = provider.component;
		return <ProviderComponent key={provider.id}>{wrapped}</ProviderComponent>;
	}, children);
}

/**
 * Partition a flat overlay array into the three placement buckets the
 * AnvilKit chrome renders. Each overlay surfaces at most once — the
 * partition is a straightforward filter by `placement`, preserving
 * input order (which `compilePlugins()` has already sorted by
 * `(order ?? 100, registrationIndex)`).
 *
 * Returns three arrays so the caller can place each bucket at the
 * correct DOM position around `{puckElement}`.
 */
export function splitOverlaysByPlacement(
	overlays: readonly StudioPluginOverlay[],
): {
	readonly viewport: readonly StudioPluginOverlay[];
	readonly canvas: readonly StudioPluginOverlay[];
	readonly notifications: readonly StudioPluginOverlay[];
} {
	const viewport: StudioPluginOverlay[] = [];
	const canvas: StudioPluginOverlay[] = [];
	const notifications: StudioPluginOverlay[] = [];
	for (const overlay of overlays) {
		if (overlay.placement === "viewport") viewport.push(overlay);
		else if (overlay.placement === "canvas") canvas.push(overlay);
		else if (overlay.placement === "notifications") notifications.push(overlay);
	}
	return { viewport, canvas, notifications };
}

/**
 * Resolve which `collaboratorsSlot` value the chrome should receive.
 * Host prop wins over any plugin contribution — this matches the
 * "host has the final word" composition rule used elsewhere in the
 * override merge.
 *
 * Returns the host value when defined, otherwise the plugin's slot
 * component (if any), otherwise `undefined` (the chrome's built-in
 * placeholder takes over downstream via
 * `renderCollaboratorsSlot`).
 */
export function resolveCollaboratorsSlot(
	hostValue: CollaboratorsSlotValue | undefined,
	runtimeSlots: ReadonlyMap<string, StudioPluginSlotContribution>,
): CollaboratorsSlotValue | undefined {
	if (hostValue !== undefined) return hostValue;
	return runtimeSlots.get("collaborators")?.component;
}

/**
 * Props accepted by {@link Studio}. Mirrors the subset of `<Puck>`'s
 * props that are meaningful at the Studio shell level, plus the
 * Studio-specific `plugins`, `config`, and legacy `aiHost` slots.
 *
 * Kept as a plain interface (not `PropsWithChildren`) because
 * `<Studio>` delegates its entire UI to `<Puck>` — passing arbitrary
 * children would require a different composition model than the
 * Puck render tree expects.
 */
export interface StudioProps {
	/**
	 * The Puck component config the editor operates on. Typically
	 * imported from a host-side module like
	 * `apps/demo/lib/puck-demo.ts` that aggregates every
	 * `@anvilkit/*` component package's `componentConfig` into a
	 * single `PuckConfig`.
	 */
	readonly puckConfig: PuckConfig;
	/**
	 * Initial Puck page data. Forwarded to `<Puck>` verbatim and
	 * also captured into a ref so {@link StudioPluginContext.getData}
	 * returns the latest snapshot.
	 */
	readonly data?: PuckData;
	/**
	 * StudioPlugins (and/or raw `@puckeditor/core` plugins) to mount.
	 * Order matters for override composition: the first plugin's
	 * overrides become the innermost wrapper, later plugins wrap it.
	 */
	readonly plugins?: readonly (StudioPlugin | PuckPlugin)[];
	/**
	 * Layer 3 host overrides forwarded to
	 * {@link createStudioConfig}. `<Studio>` owns the config factory
	 * call so descendants get a single
	 * {@link StudioConfigProvider}-scoped instance.
	 */
	readonly config?: DeepPartial<StudioConfig>;
	/**
	 * Consumer-supplied Puck overrides. Composed **outermost** —
	 * after the plugins' overrides — so the consumer always has the
	 * final word on any given slot.
	 */
	readonly overrides?: Partial<PuckOverrides>;
	/**
	 * Forwarded to `<Puck onChange>` after the `onDataChange`
	 * lifecycle has fired. Consumers that need the canonical latest
	 * data should read from here rather than calling
	 * `useGetPuck()` inside their own overrides.
	 */
	readonly onChange?: (data: PuckData) => void;
	/**
	 * Forwarded to `<Puck onPublish>` **only if** the
	 * `onBeforePublish` lifecycle resolves without throwing. A
	 * plugin that throws from `onBeforePublish` aborts publish and
	 * this callback is not called.
	 */
	readonly onPublish?: (data: PuckData) => void | Promise<void>;
	/**
	 * @deprecated Legacy `aiHost` string from the reference
	 * implementation. When provided, `<Studio>` dynamically imports
	 * `@anvilkit/core/compat/ai-host-adapter` and prepends the
	 * resulting adapter to the plugin list. Migrate to
	 * `createAiGenerationPlugin()` from
	 * `@anvilkit/plugins/ai-generation`.
	 */
	readonly aiHost?: string;
	/**
	 * Which chrome to render. `"anvilkit"` (the default) prepends the
	 * default override preset and mounts the AnvilKit Studio shell.
	 * `"puck"` is a single-prop opt-out that ships the raw
	 * `@puckeditor/core` UI — bit-for-bit identical to the pre-Phase-5
	 * `<Studio>` output (PRD §6.1 + §11 decision 1).
	 */
	readonly chrome?: StudioChromeMode;
	/**
	 * Initial Puck `UiState` partial. When `chrome="anvilkit"`, this
	 * is merged with the chrome's full-width-viewport defaults via
	 * `mergeStudioUi()` so consumers can preset the sidebar
	 * visibility, viewport selection, etc. without losing the
	 * chrome's defaults.
	 */
	readonly ui?: Partial<PuckUiState>;
	/**
	 * Forwarded to `<Puck onAction>` — fires on every Puck action
	 * dispatch (insert / move / delete / etc.). Independent of
	 * `onChange`, which fires once per debounced data update.
	 */
	readonly onAction?: PuckOnAction<PuckData>;
	/**
	 * Forwarded to `<Puck viewports>`. Overrides the chrome's
	 * full-width-viewport default block when provided.
	 */
	readonly viewports?: PuckViewports;
	/**
	 * Per-instance store id (default `"default"`). Persisted
	 * `EditorUiState` keys live under `anvilkit-ui-${storeId}`, so
	 * two `<Studio>` instances on the same page should pass distinct
	 * ids to avoid collisions.
	 */
	readonly storeId?: string;
	/**
	 * Optional "back" handler for the chrome's header. Hidden when
	 * absent.
	 */
	readonly onBack?: () => void;
	/**
	 * Optional "save draft" handler. The header surfaces a button
	 * when this is provided.
	 */
	readonly onSaveDraft?: () => void | Promise<void>;
	/**
	 * Drives the "save draft" button's loading state. Host owns the
	 * boolean — `<Studio>` only renders it.
	 */
	readonly isSavingDraft?: boolean;
	/**
	 * Timestamp of the last successful save. Renders as a relative
	 * time hint next to the publish button.
	 */
	readonly lastSavedAt?: Date | null;
	/**
	 * Drives the "Publish" button's loading state.
	 */
	readonly isPublishing?: boolean;
	/**
	 * Optional click handler for the panel's "Publish to live" action.
	 * When omitted, the action is rendered disabled. The Puck `onPublish`
	 * pipeline (`onBeforePublish` → consumer `onPublish` → `onAfterPublish`)
	 * still fires through Puck's own publish UI; this handler exists so
	 * the AnvilKit chrome can offer a header button that the host wires
	 * to its own publish flow.
	 */
	readonly onPublishClick?: () => void;
	/**
	 * Optional handler invoked from the publish panel's Export submenu
	 * with the format id (e.g. `"json"`, `"html"`, `"react"`). The host
	 * normalizes Puck data to {@link PageIR}, calls
	 * `runtime.exportFormats.get(formatId).run(ir, options)`, and
	 * triggers the browser download. Optional — the Export submenu
	 * disables itself when omitted.
	 */
	readonly onExport?: (formatId: string) => void | Promise<void>;
	/**
	 * Optional replacement for the AnvilKit chrome's placeholder
	 * `<CollaboratorStack>` (the avatars between the `lastSavedAt`
	 * chip and the Share button). Host apps with a real
	 * collaboration backend pass their own peer-aware widget here
	 * (e.g. `<PeerAvatarStack>` from `@anvilkit/collab-ui`). Accepts
	 * either a `ReactNode` (rendered verbatim) or a `ComponentType`
	 * (instantiated on every render so the component's own hooks
	 * fire). Ignored when `chrome="puck"`.
	 */
	readonly collaboratorsSlot?: CollaboratorsSlotValue;
	/**
	 * Optional diagnostics sink for plugin log records and Studio
	 * setup failures. Metadata is shallow-redacted before delivery
	 * using the same policy as the console fallback.
	 */
	readonly logger?: StudioLogger;
	/**
	 * Optional pages source for the sidebar's `layer` module. The host
	 * supplies the page list and routing callbacks; the sidebar renders
	 * the rows, route badge, and "+" add-page dialog. When omitted, the
	 * Pages sub-panel renders the `studio.module.layer.pages.empty`
	 * state (PRD §6.4). Ignored when `chrome="puck"` (no AnvilKit
	 * sidebar).
	 */
	readonly pages?: StudioPagesSource;
	/**
	 * Per-instance i18n overrides forwarded to
	 * {@link EditorI18nStoreProvider}. Keys are message ids
	 * (`studio.module.*`); values are the localized strings.
	 *
	 * The provider also honors PRD §10.2 deprecated-key aliases — an
	 * override on a legacy `studio.tab.*` key resolves through the
	 * alias map for callers asking the new key, until the deprecation
	 * window closes. The exhaustive resolution-order test lives at
	 * `state/__tests__/editor-i18n-store.alias.test.tsx`.
	 *
	 * Ignored when `chrome="puck"` (no AnvilKit i18n surface).
	 */
	readonly messages?: Readonly<Record<string, string>>;
}

/**
 * An empty Puck `Data` snapshot used as the default when the
 * consumer does not pass `data`. Declared at module scope so the
 * reference stays stable across renders.
 */
const EMPTY_DATA: PuckData = {
	root: { props: {} },
	content: [],
	zones: {},
};

/**
 * Debounce window (ms) for `onDataChange` plugin hooks. Puck's
 * `onChange` fires on every keystroke; a naive fire-and-forget loop
 * floods autosave / telemetry plugins with 20 requests/second during
 * typing. 250 ms strikes a balance between "feels live" and "does not
 * hammer the network" — plugins that need every keystroke can opt in
 * to Puck's own `onChange` via a consumer `onChange` prop.
 */
const DATA_CHANGE_DEBOUNCE_MS = 250;

/**
 * Identity tag appended to the plugin fingerprint when a plugin
 * cannot be structurally serialized (captures closures, Symbols,
 * etc.). `WeakMap`-backed so the tag stays stable for the life of
 * the plugin object; two separate constructions of the same adapter
 * get distinct tags, which is exactly what we want — their backing
 * closures may differ.
 */
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
 * Structural fingerprint for the plugin array. `StudioPlugin` objects
 * are hashed by their `meta` block (ids are unique and version-bumped
 * intentionally); `PuckPlugin` objects and anything else fall back to
 * an identity tag so a *different* object produces a *different*
 * fingerprint. An inline array of the same plugins produces the same
 * string on every render, which keeps the compile effect from
 * thrashing under the idiomatic React pattern.
 */
function fingerprintPlugins(
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
			// Meta identifies the plugin; the appended `#<identityTag>`
			// (WeakMap-stable per object, distinct per construction) makes
			// a host recreating a plugin with the same `meta` but new
			// runtime options/closures/header-action behavior observable
			// to the compile effect, so stale registrations are rebuilt.
			// `compilePlugins()` still rejects duplicate `meta.id` values.
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
 * Escape the fingerprint segment separator. A `meta.id` that ever
 * contains `|` or `\` would otherwise collide with a neighbor's
 * segment boundary — extremely unlikely given reverse-DNS plugin id
 * conventions, but cheap to close.
 */
function escapeFingerprintSegment(segment: string): string {
	return segment.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
}

/**
 * Case-insensitive substrings that mark a log-meta key as sensitive.
 * The default `ctx.log` passes meta to either the host logger or
 * `console`, which is easily copied into screenshots and bug reports.
 * This is a minimum-viable redaction layer for both destinations.
 */
const REDACTED_META_KEYS = [
	"token",
	"secret",
	"password",
	"apikey",
	"api_key",
	"authorization",
	"cookie",
	"bearer",
] as const;

function shouldRedactKey(key: string): boolean {
	const normalized = key.toLowerCase();
	for (const needle of REDACTED_META_KEYS) {
		if (normalized.includes(needle)) {
			return true;
		}
	}
	return false;
}

/**
 * `Error`'s `name`/`message`/`stack`/`cause` are non-enumerable own
 * properties, so an `Error` passed as log meta survives `Object.entries`
 * but serializes to `{}` (or `{ "name": ... }`) under `JSON.stringify`.
 * Every meta destination this layer targets — the Next.js dev overlay,
 * `JSON.stringify`-based host loggers, copy-pasted bug reports — would
 * otherwise destroy the actual failure detail. Normalize to a plain,
 * fully-enumerable shape so the message and stack survive the boundary.
 *
 * `cause` is normalized recursively because wrapper errors carry the
 * real reason there: `compilePlugins` rejects with a generic
 * `StudioPluginError("Plugin \"x\" failed to register")` whose
 * `{ cause }` holds the developer-facing detail. Without unwrapping
 * `cause`, "[studio] plugin compilation failed" still loses the only
 * actionable line. Depth-bounded so a cyclic `cause` chain can't
 * recurse forever.
 */
function normalizeLogError(
	error: Error,
	depth: number,
): Record<string, unknown> {
	const normalized: Record<string, unknown> = {
		name: error.name,
		message: error.message,
		stack: error.stack,
	};
	const { cause } = error;
	if (cause !== undefined && depth > 0) {
		normalized.cause =
			cause instanceof Error ? normalizeLogError(cause, depth - 1) : cause;
	}
	return normalized;
}

function normalizeLogValue(value: unknown): unknown {
	if (value instanceof Error) {
		return normalizeLogError(value, 4);
	}
	return value;
}

function redactLogMeta(
	meta: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
	// Shallow copy is sufficient — the contract is "don't print
	// obvious secrets," not "deep-scrub arbitrary nested structures."
	// Plugins that pass deeply nested meta with secrets in leaves can
	// upgrade to a host-provided logger when that ships.
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(meta)) {
		out[key] = shouldRedactKey(key) ? "[REDACTED]" : normalizeLogValue(value);
	}
	return out;
}

function writeStudioLog(
	logger: StudioLogger | undefined,
	level: StudioLogLevel,
	message: string,
	meta: Readonly<Record<string, unknown>> | undefined,
): void {
	const redactedMeta = meta === undefined ? undefined : redactLogMeta(meta);
	if (logger !== undefined) {
		try {
			logger(level, message, redactedMeta);
		} catch (error) {
			console.error("[studio] logger threw", error);
		}
		return;
	}

	const method =
		level === "error"
			? "error"
			: level === "warn"
				? "warn"
				: level === "debug"
					? "debug"
					: "info";
	console[method](`[studio] ${message}`, redactedMeta ?? {});
}

function useHydrateRuntimeStores(
	compiled: CompiledStudioRuntime | null,
	exportStore: ExportStoreApi,
	themeStore: ThemeStoreApi,
): void {
	useEffect(() => {
		if (compiled === null) {
			return;
		}
		exportStore
			.getState()
			.setAvailableFormats([...compiled.runtime.exportFormats.keys()]);

		const theme = compiled.studioConfig.theme;
		const currentMode = themeStore.getState().mode;
		if (currentMode === "system" && theme.defaultMode !== "system") {
			themeStore.getState().setMode(theme.defaultMode);
		}
	}, [compiled, exportStore, themeStore]);
}

function useRuntimeInit(
	compiled: CompiledStudioRuntime | null,
	onInitPromiseRef: RefObject<Promise<void> | null>,
): void {
	useEffect(() => {
		if (compiled === null) {
			onInitPromiseRef.current = null;
			return;
		}
		// Capture the emit promise so the post-mount `onReady` trigger
		// can chain strictly after `onInit` has been dispatched (and
		// settled), regardless of whether the Puck-API binder's effect
		// fires before or after this parent effect in the commit.
		onInitPromiseRef.current = compiled.runtime.lifecycle.emit(
			"onInit",
			compiled.ctx,
		);
		void onInitPromiseRef.current;
	}, [compiled, onInitPromiseRef]);
}

/**
 * Structural fingerprint for the `config` prop. `JSON.stringify` is
 * cheap for the shallow-ish partial shape `StudioConfig` accepts and
 * order-insensitive at the value level, though not at the key level —
 * which matches how we want merge precedence to work: swapping keys
 * is a genuinely different config.
 */
function fingerprintConfig(config: unknown): string {
	if (config === undefined || config === null) {
		return "null";
	}
	try {
		return JSON.stringify(config);
	} catch {
		// Circular reference or BigInt — fall back to identity so a
		// new object reference still re-runs compile but we do not
		// crash the component tree.
		return identityTagFor(config as object);
	}
}

/**
 * Error thrown by {@link StudioPluginContext.getPuckApi} when a
 * plugin tries to read the Puck API before the
 * {@link PuckApiBinder} below has had a chance to bind it. Hoisted
 * to module scope so tests can match on the exact message.
 */
const PUCK_API_UNBOUND_MESSAGE =
	"StudioPluginContext.getPuckApi() was called before <Puck> finished mounting. " +
	"Move the call into a header action or a post-mount lifecycle hook " +
	"(`onReady`, `onDataChange`, `onBeforePublish`, `onAfterPublish`) so it runs after Puck's effect-time binder has captured the API.";

/**
 * Type alias for the snapshot-getter function Puck's `useGetPuck`
 * hook returns. Stored on a ref by {@link PuckApiBinder} and read
 * by the context's `getPuckApi()` accessor. Kept as a local alias
 * so the ref and component signatures read cleanly.
 */
type GetPuckSnapshot = ReturnType<typeof useGetPuck>;

/**
 * Tiny helper component that runs inside Puck's own subtree,
 * captures the live `PuckApi` via {@link useGetPuck}, and stores
 * the snapshot function on the shared ref `<Studio>` hands to
 * plugins. Returns `children` verbatim so the `puck` override slot
 * continues to render normally.
 *
 * Declared as a local component (not exported) because it exists
 * solely to bridge the "inside vs. outside Puck" boundary — consumer
 * code should never render it directly.
 */
function PuckApiBinder({
	apiRef,
	onBound,
	children,
}: {
	readonly apiRef: RefObject<GetPuckSnapshot | null>;
	readonly onBound?: () => void;
	readonly children: ReactNode;
}): ReactElement {
	const getPuck = useGetPuck();
	useEffect(() => {
		// `useGetPuck` returns a stable snapshot-getter function for
		// the lifetime of the mount. Re-running on change is cheap and
		// future-proofs against Puck swapping its internal store.
		apiRef.current = getPuck;
		// Signal that `getPuckApi()` is now safe to call. The Studio
		// side dedupes per compiled runtime, so re-running this effect
		// (StrictMode double-invoke, getPuck identity churn, recompile)
		// fires `onReady` at most once per runtime.
		onBound?.();
	}, [apiRef, getPuck, onBound]);
	return <>{children}</>;
}

/**
 * The public Studio shell. See the file header for the full
 * responsibilities matrix — in short: build config, compile
 * plugins, compose overrides, wire lifecycle, populate stores,
 * render `<Puck>`.
 *
 * @example
 * ```tsx
 * import { Studio } from "@anvilkit/core/react";
 * import { puckDemoConfig } from "./lib/puck-demo";
 * import { exportHtmlPlugin } from "@anvilkit/plugin-export-html";
 *
 * export default function EditorPage() {
 *   return (
 *     <Studio
 *       puckConfig={puckDemoConfig}
 *       plugins={[exportHtmlPlugin()]}
 *       onPublish={async (data) => {
 *         await fetch("/api/publish", {
 *           method: "POST",
 *           body: JSON.stringify(data),
 *         });
 *       }}
 *     />
 *   );
 * }
 * ```
 */
export function Studio(props: StudioProps): ReactElement | null {
	const {
		puckConfig,
		data,
		plugins,
		config,
		overrides: consumerOverrides,
		onChange,
		onPublish,
		aiHost,
		chrome = DEFAULT_CHROME_MODE,
		ui,
		onAction,
		viewports,
		storeId,
		onBack,
		onSaveDraft,
		isSavingDraft,
		lastSavedAt,
		isPublishing,
		onPublishClick,
		onExport,
		collaboratorsSlot,
		logger,
		pages,
		messages,
	} = props;
	const isAnvilkit = chrome === "anvilkit";

	// ------------------------------------------------------------------
	// 1. Refs for the plugin context. `getData()` is a late-bound
	//    accessor that always returns the most recent `onChange`
	//    payload; `getPuckApi()` reads from the `PuckApiBinder` ref
	//    below, which is `null` until the first render inside Puck.
	// ------------------------------------------------------------------
	const dataRef = useRef<PuckData>(data ?? EMPTY_DATA);
	useLayoutEffect(() => {
		if (data !== undefined) {
			dataRef.current = data;
		}
	}, [data]);

	const puckApiRef = useRef<GetPuckSnapshot | null>(null);
	// Holds the `onInit` emit promise for the current compiled runtime
	// so `onReady` can chain strictly after it. `readyFiredForRef`
	// tracks the runtime `onReady` already fired for, so a recompile
	// (new runtime → new `onInit`) correctly re-fires it while
	// re-renders / StrictMode double-invokes do not.
	const onInitPromiseRef = useRef<Promise<void> | null>(null);
	const readyFiredForRef = useRef<CompiledStudioRuntime | null>(null);

	// Monotonic compile generation. Bumped at the start of every
	// compile pass and again on effect cleanup, so an in-flight async
	// setup whose generation no longer matches the latest one bails
	// out instead of committing a superseded runtime. Replaces the
	// per-effect `cancelled` boolean with a value that also lets us
	// distinguish "this run was superseded" from "first mount".
	const compileGenerationRef = useRef(0);

	// Root element of this Studio instance. Provided via
	// `StudioRootProvider` so iframe DOM queries (`use-theme-sync`,
	// `Splitter`) scope to THIS editor's subtree — Puck hardcodes
	// `id="preview-frame"`, so two editors otherwise both resolve the
	// first iframe (review finding H3).
	const rootRef = useRef<HTMLDivElement>(null);

	// ------------------------------------------------------------------
	// Per-instance sidebar registry. Created lazily inside `useState`
	// so React's strict-mode double-invocation does not produce two
	// stores during dev. Plugins register sidebar surfaces (insert
	// sections, layer quick-adds, asset source / actions, copy snippet
	// packs) through `ctx.register*` — those calls land in this store
	// and the sidebar reads from it via the provider below.
	//
	// Default `insert` sections (`recommended` / `navigation` / `top` /
	// `team`) are seeded synchronously here so the first paint of the
	// `insert` module already shows the sectioned library — registering
	// them in a `useEffect` would produce a one-frame flash of "no
	// sections" before hydration. Plugins that call
	// `registerInsertSection()` later merge into the same registry
	// without conflict.
	const [sidebarRegistryStore] = useState<SidebarRegistryStoreApi>(() => {
		const store = createSidebarRegistryStore();
		for (const section of DEFAULT_INSERT_SECTIONS) {
			store.getState().registerInsertSection(section);
		}
		return store;
	});

	// ------------------------------------------------------------------
	// Per-instance store id + the three Core-owned stores. The host
	// rarely passes `storeId`; deriving a stable per-mount fallback
	// from `useId()` (instead of the old shared `"default"`) keeps two
	// `<Studio>` instances on one page from colliding on persisted
	// keys (review finding H3). The store instances are created here so
	// `<Studio>` can both wire them into the providers below and drive
	// them imperatively (export-format hydration, unmount reset). Each
	// provider owns SSR-safe rehydration (`skipHydration` + a
	// mount-time effect), so no rehydrate effect lives here anymore.
	// ------------------------------------------------------------------
	const reactId = useId();
	const resolvedStoreId =
		storeId ?? `${FALLBACK_STORE_ID_PREFIX}-${reactId.replace(/:/g, "")}`;
	const [themeStore] = useState<ThemeStoreApi>(() =>
		createThemeStore({ storeId: resolvedStoreId }),
	);
	const [exportStore] = useState<ExportStoreApi>(() =>
		createExportStore({ storeId: resolvedStoreId }),
	);
	const [aiStore] = useState<AiStoreApi>(() =>
		createAiStore({ storeId: resolvedStoreId }),
	);

	// ------------------------------------------------------------------
	// 2. Resolve plugins, build the studio config, and compile. All
	//    three steps run in a single async effect so the Zod-heavy
	//    `createStudioConfig` can be loaded via **dynamic import** and
	//    live in an async chunk rather than the main entry bundle.
	//
	//    This is a bundle-size trade-off, not a behavioral one: the
	//    component already renders `null` until `compilePlugins`
	//    resolves, so folding `createStudioConfig` into that same wait
	//    adds no user-visible delay — Zod's ~60 KB of locale data just
	//    happens to load during the same microtask as the plugin
	//    compile step. The `check:bundle-budget` gate in `core-015`
	//    enforces this indirection: move `createStudioConfig` back to
	//    a static import and the gate fails immediately.
	//
	//    If `aiHost` is supplied, the compat adapter is also loaded via
	//    dynamic import (on its own async chunk) and prepended to the
	//    plugin list before compilation.
	// ------------------------------------------------------------------
	const [compiled, setCompiled] = useState<CompiledStudioRuntime | null>(null);

	// Dynamically-loaded AnvilKit chrome assets. Stays `null` for
	// `chrome="puck"`, keeping the preset + layout out of the
	// `<Studio>` entry chunk. The compile effect populates it during
	// the same async setup pass that loads `createStudioConfig`, so
	// host apps see a single render gap for both.
	const [chromeAssets, setChromeAssets] = useState<{
		readonly studioOverrides: Partial<PuckOverrides>;
		readonly StudioLayout: ComponentType<unknown>;
	} | null>(null);

	// Structural fingerprint of `plugins` + `config` so the compile
	// effect does not thrash when a parent re-render hands us a new
	// array/object reference with identical contents — the idiomatic
	// `<Studio plugins={[...]} config={{ ... }} />` pattern in Next
	// App Router and Puck's own examples otherwise re-runs
	// compilePlugins() on every navigation event.
	//
	// The hash is stable across renders: two arrays containing the
	// same plugin meta hash to the same string, and
	// `JSON.stringify(config)` is order-sensitive only at the key
	// level, not reference level. Plugin objects that cannot be
	// structurally fingerprinted (functions captured in closures) fall
	// through to a per-plugin identity marker so the hash still
	// changes when the plugin array is genuinely different.
	const pluginsFingerprint = useMemo(
		() => fingerprintPlugins(plugins),
		[plugins],
	);
	const configFingerprint = useMemo(() => fingerprintConfig(config), [config]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: fingerprints intentionally replace raw references so inline arrays/objects do not thrash the runtime.
	useEffect(() => {
		// Start a new compile generation and immediately tear down the
		// previously compiled runtime + chrome. This fails closed: while
		// plugins/config/chrome change (or if the new compile rejects),
		// the editor renders the `null` loading state instead of keeping
		// stale plugin hooks, providers, sidebar registrations, and
		// header actions mounted for a plugin set the host has replaced.
		compileGenerationRef.current += 1;
		const myGen = compileGenerationRef.current;
		const isStale = (): boolean => myGen !== compileGenerationRef.current;
		setCompiled(null);
		setChromeAssets(null);
		const basePlugins = plugins ?? [];

		async function setup(): Promise<void> {
			// Dynamic import moves `createStudioConfig` (and therefore
			// all of Zod) into an async chunk. The entry bundle that
			// ships `{ Studio }` stays under the core-015 25 KB gzipped
			// budget because of this one indirection.
			const { createStudioConfig } = await import("@/config/create-config");
			if (isStale()) {
				return;
			}
			const studioConfig = createStudioConfig(config);

			// AnvilKit chrome assets — preset + layout — load as
			// separate async chunks. The `chrome="puck"` path skips
			// both imports entirely so the entry bundle for hosts that
			// pin to the legacy chrome stays under budget.
			let nextChromeAssets: typeof chromeAssets = null;
			if (isAnvilkit) {
				const [presetMod, layoutMod] = await Promise.all([
					import("@/overrides/preset"),
					import("@/layout/StudioLayout"),
				]);
				if (isStale()) {
					return;
				}
				nextChromeAssets = {
					studioOverrides: presetMod.studioOverrides,
					StudioLayout: layoutMod.StudioLayout as ComponentType<unknown>,
				};
			}

			let resolvedPlugins: readonly (StudioPlugin | PuckPlugin)[] = [
				jsonExportPlugin,
				...basePlugins,
			];
			if (aiHost !== undefined) {
				// Dynamic import keeps the adapter tree-shakable: apps
				// that never pass `aiHost` do not bundle this module.
				const { aiHostAdapter } = await import("@/compat/ai-host-adapter");
				if (isStale()) {
					return;
				}
				resolvedPlugins = [
					aiHostAdapter({ aiHost }),
					jsonExportPlugin,
					...basePlugins,
				];
			}

			// Build the plugin context against the freshly resolved
			// `studioConfig` so plugins see the final merged value.
			// `dataRef` and `puckApiRef` live outside the closure, so
			// the accessors here stay stable even though `ctx` itself
			// is rebuilt whenever the config changes.
			const ctx: StudioPluginContext = {
				getData: () => dataRef.current,
				getPuckApi: () => {
					const snapshot = puckApiRef.current;
					if (snapshot === null) {
						throw new Error(PUCK_API_UNBOUND_MESSAGE);
					}
					return snapshot() as ReturnType<StudioPluginContext["getPuckApi"]>;
				},
				studioConfig,
				log: (level, message, meta) => {
					writeStudioLog(logger, level, message, meta);
				},
				emit: () => {
					// The plugin-to-plugin event bus is scoped to a
					// later milestone (architecture §12). For now,
					// `emit` is a silent no-op so plugins that call it
					// at lifecycle time do not crash.
				},
				registerAssetResolver: () => {
					// `compilePlugins()` passes plugins a wrapper context with
					// a runtime-backed collector, keeping this base context
					// immutable for the rest of the Studio shell.
				},
				registerInsertSection: (section) =>
					sidebarRegistryStore.getState().registerInsertSection(section),
				registerLayerQuickAdd: (item) =>
					sidebarRegistryStore.getState().registerLayerQuickAdd(item),
				registerAssetSource: (source) =>
					sidebarRegistryStore.getState().registerAssetSource(source),
				registerAssetAction: (action) =>
					sidebarRegistryStore.getState().registerAssetAction(action),
				registerCopySnippetPack: (pack) =>
					sidebarRegistryStore.getState().registerCopySnippetPack(pack),
				registerCopilotPanel: (panel) =>
					sidebarRegistryStore.getState().registerCopilotPanel(panel),
				registerHistoryPanel: (panel) =>
					sidebarRegistryStore.getState().registerHistoryPanel(panel),
			};

			try {
				const runtime = await compilePlugins(resolvedPlugins, ctx, {
					lifecycle: { onDataChangeDebounceMs: DATA_CHANGE_DEBOUNCE_MS },
				});
				if (isStale()) {
					return;
				}
				setCompiled({ runtime, studioConfig, ctx });
				setChromeAssets(nextChromeAssets);
			} catch (error) {
				if (isStale()) {
					// Suppress stale-setup logs — a later compile
					// generation supersedes this one and logging here
					// would be misleading.
					return;
				}
				// Compilation errors are already typed
				// `StudioPluginError`. `compiled`/`chromeAssets` were
				// cleared at the top of this pass and are left `null`, so
				// a failed recompile fails closed — the editor never
				// keeps the host's previous (now-replaced) plugin set
				// mounted, nor mounts against a broken one.
				writeStudioLog(logger, "error", "plugin compilation failed", {
					error,
				});
			}
		}

		void setup();
		return () => {
			// Invalidate this generation so an in-flight `setup()` whose
			// async work resolves after teardown sees `isStale()` and
			// never commits a superseded runtime.
			compileGenerationRef.current += 1;
		};
	}, [pluginsFingerprint, aiHost, configFingerprint, isAnvilkit, logger]);

	// ------------------------------------------------------------------
	// 3. Populate the export store once the runtime is ready. Writing
	//    through the store's setter is deliberate — the store exposes a
	//    `setAvailableFormats` action that accepts a list, no reason to
	//    go through `setState` directly.
	//
	//    Also seed the theme store from `studioConfig.theme.defaultMode`
	//    so the config block is actually load-bearing — it was dead
	//    prior to this wiring. Only applied when the persisted mode is
	//    still at its `"system"` default: a user who has explicitly
	//    picked a preference on a prior visit should not have their
	//    choice silently overwritten by a host-set default.
	// ------------------------------------------------------------------
	useHydrateRuntimeStores(compiled, exportStore, themeStore);

	// ------------------------------------------------------------------
	// 4. Fire `onInit` exactly once per compiled runtime. `useEffect`'s
	//    dep array is `[compiled]`, so a remount with a new runtime
	//    re-fires this correctly.
	// ------------------------------------------------------------------
	useRuntimeInit(compiled, onInitPromiseRef);

	// Fired by the Puck-API binder's effect once `getPuckApi()` is
	// safe to call. Emits `onReady` exactly once per compiled runtime,
	// strictly after `onInit` has settled — `queueMicrotask` defers
	// past the synchronous effect flush so `useRuntimeInit`'s parent
	// effect has populated `onInitPromiseRef` even when the binder's
	// child effect ran first.
	const handlePuckBound = useCallback((): void => {
		if (compiled === null || readyFiredForRef.current === compiled) {
			return;
		}
		readyFiredForRef.current = compiled;
		const runtime = compiled;
		queueMicrotask(() => {
			const initDone = Promise.resolve(onInitPromiseRef.current ?? undefined);
			const fireReady = (): void => {
				void runtime.runtime.lifecycle.emit("onReady", runtime.ctx);
			};
			initDone.then(fireReady, fireReady);
		});
	}, [compiled]);

	// ------------------------------------------------------------------
	// 5. Unmount cleanup: fire `onDestroy` and reset the Core-owned
	//    Zustand stores so a subsequent remount with a different plugin
	//    set never surfaces the previous session's state. Kept as a
	//    separate effect from step 4 so the cleanup closes over the
	//    same runtime/ctx pair that fired `onInit`.
	// ------------------------------------------------------------------
	useEffect(() => {
		if (compiled === null) {
			return;
		}
		const { runtime, ctx } = compiled;
		return () => {
			void runtime.lifecycle.emit("onDestroy", ctx);
			// Tear down the lifecycle manager so any pending
			// `onDataChange` debounce timer does not fire after the
			// host has dropped its reference to the runtime (which
			// would run hooks against a stale ctx whose
			// `getPuckApi()` now throws).
			runtime.lifecycle.dispose();
			exportStore.getState().reset();
			aiStore.getState().reset();
			// Theme is a user preference that persists across Studio
			// sessions, so it intentionally survives runtime teardown.
		};
	}, [compiled, exportStore, aiStore]);

	// ------------------------------------------------------------------
	// 6. Compose overrides. `mergeOverrides` threads each plugin's
	//    contribution through the previous one as `children`, so
	//    multiple plugins touching the same key all run. Consumer
	//    overrides are appended last → outermost wrapper.
	// ------------------------------------------------------------------
	const mergedOverrides = useMemo<Partial<PuckOverrides>>(() => {
		const base: Partial<PuckOverrides>[] = [];
		// Default chrome preset is INNERMOST when `chrome="anvilkit"`
		// — plugins can wrap and consumers can wrap further out.
		// `chrome="puck"` skips the prepend, so the merge result is
		// bit-for-bit what `<Studio>` produced before Phase 5.
		if (isAnvilkit && chromeAssets !== null) {
			base.push(chromeAssets.studioOverrides);
		}
		if (compiled !== null) {
			base.push(...compiled.runtime.overrides);
		}
		if (consumerOverrides !== undefined) {
			base.push(consumerOverrides);
		}

		// Add the Puck-API binder as the outermost `puck` override
		// so it gets a chance to run `useGetPuck()` inside the Puck
		// subtree on every render. Done via one more entry in the
		// merge so the binder composes with any consumer `puck`
		// override instead of clobbering it.
		base.push({
			puck: ({ children }) => (
				<PuckApiBinder apiRef={puckApiRef} onBound={handlePuckBound}>
					{children}
				</PuckApiBinder>
			),
		});

		return mergeOverrides(base);
	}, [compiled, consumerOverrides, isAnvilkit, chromeAssets, handlePuckBound]);

	// ------------------------------------------------------------------
	// 7. Puck `onChange` / `onPublish` handlers.
	//
	//    Idiomatic usage passes inline arrows for these props, so each
	//    parent render produces a new identity. Late-binding through
	//    refs keeps the memoized handler identity stable across parent
	//    re-renders → Puck does not see a fresh `onChange` prop on
	//    every keystroke. We still want the latest closure to be
	//    invoked, so the effect below mirrors the prop into the ref
	//    on every render.
	//
	//    `useLayoutEffect` (not `useEffect`) so the refs are updated
	//    synchronously after commit — before any child layout effects
	//    fire and before browser paint. A passive `useEffect` runs
	//    after paint, leaving a window where a child layout effect or
	//    an immediate publish can read a stale closure.
	// ------------------------------------------------------------------
	const onChangeRef = useRef(onChange);
	const onPublishRef = useRef(onPublish);
	useLayoutEffect(() => {
		onChangeRef.current = onChange;
		onPublishRef.current = onPublish;
	}, [onChange, onPublish]);

	const handleChange = useCallback(
		(nextData: PuckData): void => {
			dataRef.current = nextData;
			if (compiled !== null) {
				void compiled.runtime.lifecycle.emit(
					"onDataChange",
					compiled.ctx,
					nextData,
				);
			}
			onChangeRef.current?.(nextData);
		},
		[compiled],
	);

	// ------------------------------------------------------------------
	// 8. Puck `onPublish` handler: sequential `onBeforePublish` →
	//    consumer `onPublish` → fire-and-forget `onAfterPublish`. A
	//    throw from any `onBeforePublish` hook aborts the publish —
	//    this is the only lifecycle event with veto power.
	// ------------------------------------------------------------------
	const handlePublish = useCallback(
		(nextData: PuckData): void => {
			// Capture the consumer callback BEFORE the async
			// `onBeforePublish` await. If the parent re-renders with a
			// different `onPublish` while a hook is validating, reading
			// `onPublishRef.current` after the await would call the
			// newer handler — a race that surfaces as "publish ran
			// against a function the user never associated with this
			// publish event." Snapshotting here pins one publish
			// operation to one consumer callback.
			const consumerOnPublish = onPublishRef.current;
			void (async () => {
				if (compiled !== null) {
					try {
						await compiled.runtime.lifecycle.emit(
							"onBeforePublish",
							compiled.ctx,
							nextData,
						);
					} catch (error) {
						console.error("[studio] publish aborted by plugin:", error);
						return;
					}
				}

				try {
					await consumerOnPublish?.(nextData);
				} catch (error) {
					console.error("[studio] consumer onPublish threw:", error);
					// Deliberately do NOT fire `onAfterPublish` — an
					// `onAfterPublish` following a consumer failure
					// would imply a success the host never observed.
					return;
				}

				if (compiled !== null) {
					void compiled.runtime.lifecycle.emit(
						"onAfterPublish",
						compiled.ctx,
						nextData,
					);
				}
			})();
		},
		[compiled],
	);

	// ------------------------------------------------------------------
	// 9. Loading state. Deliberately `null` — no spinner, no fallback
	//    UI. Host apps that want a branded loading state can render one
	//    above `<Studio>` with their own state management.
	// ------------------------------------------------------------------
	if (compiled === null) {
		return null;
	}
	// AnvilKit chrome must wait for the dynamically-loaded preset +
	// layout to resolve before rendering, otherwise `<Puck>` would
	// see plain Puck overrides without the chrome's `puck` slot
	// wrapping `<StudioLayout>`. Hold the `null` render until both
	// state slots agree.
	if (isAnvilkit && chromeAssets === null) {
		return null;
	}

	const puckUi = isAnvilkit ? mergeStudioUi(ui, viewports) : ui;
	const chromeViewports = isAnvilkit
		? resolveStudioViewports(puckUi, viewports)
		: undefined;
	const puckElement = (
		<Puck
			config={puckConfig}
			data={data ?? EMPTY_DATA}
			overrides={mergedOverrides}
			onChange={handleChange}
			onPublish={handlePublish}
			plugins={[...compiled.runtime.puckPlugins]}
			ui={puckUi}
			onAction={onAction}
			viewports={viewports}
		/>
	);

	if (!isAnvilkit) {
		// Bit-for-bit pre-Phase-5 output: same provider stack, same
		// JSX nesting. The new `ui` / `onAction` / `viewports` props
		// pass through to `<Puck>` only if the consumer set them.
		// The three Core-owned stores are chrome-agnostic — a host on
		// the legacy `chrome="puck"` path may still mount panels that
		// read `useExportStore` / `useAiStore` / `useThemeStore`, and
		// each `<Studio>` must stay isolated (H3). Root ref scopes any
		// iframe query to this instance's subtree.
		return (
			<StudioConfigProvider config={compiled.studioConfig}>
				<StudioRuntimeProvider value={compiled.runtime}>
					<ThemeStoreProvider storeId={resolvedStoreId} store={themeStore}>
						<ExportStoreProvider storeId={resolvedStoreId} store={exportStore}>
							<AiStoreProvider storeId={resolvedStoreId} store={aiStore}>
								<StudioRootProvider rootRef={rootRef}>
									<div ref={rootRef} style={{ display: "contents" }}>
										{puckElement}
									</div>
								</StudioRootProvider>
							</AiStoreProvider>
						</ExportStoreProvider>
					</ThemeStoreProvider>
				</StudioRuntimeProvider>
			</StudioConfigProvider>
		);
	}

	// AnvilKit chrome: layered providers around `<Puck>`. Order from
	// outermost to innermost — config / runtime first so descendants
	// can read them; plugin context next so chrome components
	// (header actions, etc.) see the live ctx; per-instance editor
	// stores last so the chrome reads its own state slice without
	// reaching higher.
	//
	// `<ThemeSyncBoundary />` sits inside the editor stores so its
	// effect can read the theme store (already a global) but writes
	// the resolved value where every chrome surface picks it up.
	// `_chromeAssets` is referenced so the linter does not flag it
	// as an unused destructure — the actual `<StudioLayout>` mount
	// happens inside the `puck` slot of `studioOverrides`.
	const _chromeAssets = chromeAssets;
	void _chromeAssets;

	// Resolve `collaboratorsSlot` precedence: host prop wins over any
	// plugin slot contribution. When both are absent the chrome's
	// built-in placeholder kicks in downstream (`renderCollaboratorsSlot`).
	const resolvedCollaboratorsSlot = resolveCollaboratorsSlot(
		collaboratorsSlot,
		compiled.runtime.slots,
	);

	// Group plugin overlays by placement so each bucket can mount at
	// the correct DOM position around `{puckElement}`.
	const {
		viewport: viewportOverlays,
		canvas: canvasOverlays,
		notifications: notificationOverlays,
	} = splitOverlaysByPlacement(compiled.runtime.overlays);

	// The innermost render: theme sync + toaster + overlays interleaved
	// with the editor. Overlay placement contract:
	//   viewport → before {puckElement}
	//   canvas → after {puckElement} (layers above the editor via CSS)
	//   notifications → after all canvas overlays (toast / dialog stack)
	const studioBody = (
		<TooltipProvider delay={200}>
			<ThemeSyncBoundary />
			<Toaster position="bottom-right" closeButton />
			{viewportOverlays.map((overlay) => {
				const OverlayComponent = overlay.component;
				return <OverlayComponent key={overlay.id} />;
			})}
			{puckElement}
			{canvasOverlays.map((overlay) => {
				const OverlayComponent = overlay.component;
				return <OverlayComponent key={overlay.id} />;
			})}
			{notificationOverlays.map((overlay) => {
				const OverlayComponent = overlay.component;
				return <OverlayComponent key={overlay.id} />;
			})}
		</TooltipProvider>
	);

	// Plugin-contributed providers compose **inside** the core provider
	// stack (so each one may call `useStudio()`, `useChromeProps()`,
	// `useMsg()`, etc.) and **outside** `<TooltipProvider>` + the
	// editor render. Lowest-`order` provider is outermost. See
	// `composePluginProviders` for the fold semantics.
	const wrappedBody = composePluginProviders(
		compiled.runtime.providers,
		studioBody,
	);

	return (
		<StudioConfigProvider config={compiled.studioConfig}>
			<StudioRuntimeProvider value={compiled.runtime}>
				<StudioPluginContextProvider value={compiled.ctx}>
					<SidebarRegistryProvider value={sidebarRegistryStore}>
						<StudioPagesSourceProvider value={pages}>
							<EditorUiStoreProvider storeId={resolvedStoreId}>
								<ThemeStoreProvider
									storeId={resolvedStoreId}
									store={themeStore}
								>
									<ExportStoreProvider
										storeId={resolvedStoreId}
										store={exportStore}
									>
										<AiStoreProvider storeId={resolvedStoreId} store={aiStore}>
											<EditorI18nStoreProvider messages={messages}>
												<ChromePropsProvider
													value={{
														onBack,
														onSaveDraft,
														isSavingDraft,
														lastSavedAt,
														isPublishing,
														onPublishClick,
														onExport,
														collaboratorsSlot: resolvedCollaboratorsSlot,
														viewports: chromeViewports,
													}}
												>
													<StudioRootProvider rootRef={rootRef}>
														<div ref={rootRef} style={{ display: "contents" }}>
															{wrappedBody}
														</div>
													</StudioRootProvider>
												</ChromePropsProvider>
											</EditorI18nStoreProvider>
										</AiStoreProvider>
									</ExportStoreProvider>
								</ThemeStoreProvider>
							</EditorUiStoreProvider>
						</StudioPagesSourceProvider>
					</SidebarRegistryProvider>
				</StudioPluginContextProvider>
			</StudioRuntimeProvider>
		</StudioConfigProvider>
	);
}
