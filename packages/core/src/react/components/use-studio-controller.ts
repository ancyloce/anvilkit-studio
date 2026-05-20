/**
 * @file `useStudioController` — the headless orchestration core of the
 * `<Studio>` shell (architecture §6 A1).
 *
 * Everything in this file is *logic, not presentation*: config
 * assembly, the async plugin-compile state machine (generation guard +
 * fingerprint + fail-closed teardown), lifecycle wiring
 * (`onInit`/`onReady`/`onDestroy`), per-instance store creation/
 * hydration, override composition, and the Puck `onChange`/`onPublish`
 * handlers. `Studio.tsx` is now a thin view that calls this hook and
 * renders the provider stack around `<Puck>`.
 *
 * Splitting it out makes the orchestration unit-testable without
 * mounting a React tree (the recompile / on-ready race control was the
 * part previously reachable only through a full `<Studio>` mount), and
 * gives the shell a single, named owner for the concurrency control.
 *
 * ### Runtime identity → engine phase machine (A1 → A2)
 *
 * The shell used to carry three cooperating refs —
 * `compileGenerationRef`, `onInitPromiseRef`, `readyFiredForRef`. A1
 * unified them into one {@link RuntimeIdentity} object; **A2 then
 * moved the `onInit` settle promise and the `onReady` dedupe into the
 * engine** ({@link LifecycleManager.advanceTo}). What remains here is
 * only the compile-generation guard (stale-async-compile detection),
 * which is orthogonal to the lifecycle phase. The controller now just
 * calls `advanceTo("init" | "ready" | "destroyed")`; the engine owns
 * the ordering and once-per-runtime semantics.
 *
 * This module is React-aware (it owns the Studio-shell hooks) but
 * imports **no** provider/JSX chrome beyond the tiny `<PuckApiBinder>`
 * bridge, which must live inside Puck's subtree.
 */

import type { DeepPartial } from "@anvilkit/utils";
import {
	type Config as PuckConfig,
	type Data as PuckData,
	type OnAction as PuckOnAction,
	type Overrides as PuckOverrides,
	type Plugin as PuckPlugin,
	type UiState as PuckUiState,
	type Viewports as PuckViewports,
	type UserGenerics,
	useGetPuck,
} from "@puckeditor/core";
import {
	createElement,
	Fragment,
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

import type { CollaboratorsSlotValue } from "@/context/chrome-props";
import { DEFAULT_INSERT_SECTIONS } from "@/layout/sidebar/modules/insert/default-sections";
import { mergeOverrides } from "@/overrides/merge-overrides";
import type { StudioChromeMode } from "@/overrides/types";
import { jsonExportPlugin } from "@/runtime/built-in-formats/json-export-plugin";
import { compilePlugins, type StudioRuntime } from "@/runtime/compile-plugins";
import {
	createSidebarRegistryStore,
	type SidebarRegistryStoreApi,
} from "@/state/index";
import {
	type AiStoreApi,
	createAiStore,
	createExportStore,
	createThemeStore,
	type ExportStoreApi,
	type ThemeStoreApi,
} from "@/stores/index";
import type { StudioConfig } from "@/types/config";
import type { StudioPagesSource } from "@/types/pages";
import type {
	StudioLogLevel,
	StudioPlugin,
	StudioPluginContext,
} from "@/types/plugin";

/**
 * Host-supplied structured logger. Re-exported from `Studio.tsx` so
 * the public surface is unchanged.
 */
export type StudioLogger = (
	level: StudioLogLevel,
	message: string,
	meta?: Readonly<Record<string, unknown>>,
) => void;

export interface CompiledStudioRuntime {
	readonly runtime: StudioRuntime;
	readonly studioConfig: StudioConfig;
	readonly ctx: StudioPluginContext;
}

/** Dynamically-loaded AnvilKit chrome assets (null on `chrome="puck"`). */
export interface ChromeAssets {
	readonly studioOverrides: Partial<PuckOverrides>;
	readonly StudioLayout: import("react").ComponentType<
		import("@/layout/StudioLayout").StudioLayoutProps
	>;
}

/**
 * Props accepted by `<Studio>` and consumed by the controller. Lives
 * here (not in `Studio.tsx`) so there is **no import cycle** between
 * the view and its controller — `Studio.tsx` re-exports it to keep the
 * public `@anvilkit/core/react` path (`{ StudioProps }`) unchanged.
 *
 * Mirrors the subset of `<Puck>`'s props meaningful at the Studio
 * shell level, plus the Studio-specific `plugins`, `config`, and
 * legacy `aiHost` slots. Kept a plain interface (not
 * `PropsWithChildren`) because `<Studio>` delegates its entire UI to
 * `<Puck>`.
 */
/**
 * The Puck `Data` shape for a given `UserConfig`, derived from Puck's
 * own `UserGenerics`. Collapses to the broad default `Data` (the prior
 * non-generic `PuckData`) when `UserConfig` is the default
 * `PuckConfig`, so every existing non-generic caller is byte-identical
 * at the type level.
 */
type PuckDataFor<UserConfig extends PuckConfig> =
	UserGenerics<UserConfig>["UserData"];

export interface StudioProps<UserConfig extends PuckConfig = PuckConfig> {
	/**
	 * The Puck component config the editor operates on. Typically
	 * imported from a host-side module like
	 * `apps/demo/lib/puck-demo.ts` that aggregates every
	 * `@anvilkit/*` component package's `componentConfig` into a
	 * single `PuckConfig`. The inferred `UserConfig` flows into
	 * `data`, `onChange`/`onPublish`, `plugins`, and `overrides`, so an
	 * externally-typed `StudioPlugin<UserConfig>` keeps its type
	 * contribution through `<Studio>` (the typing is realized via
	 * {@link StudioPlugin}, not a generic runtime — the runtime erases
	 * to the default at the `compilePlugins` boundary).
	 */
	readonly puckConfig: UserConfig;
	/**
	 * Initial Puck page data. Forwarded to `<Puck>` verbatim and
	 * also captured into a ref so {@link StudioPluginContext.getData}
	 * returns the latest snapshot.
	 */
	readonly data?: PuckDataFor<UserConfig>;
	/**
	 * StudioPlugins (and/or raw `@puckeditor/core` plugins) to mount.
	 * Order matters for override composition: the first plugin's
	 * overrides become the innermost wrapper, later plugins wrap it.
	 *
	 * Consumers that want to recover the contributed capability types
	 * from this set can declare the array `as const` and apply
	 * {@link InferPluginContributions}`<typeof plugins>` — the tuple
	 * preserves each plugin's `StudioPlugin<_, Contributes>` parameter,
	 * which the helper distributes into a union. The runtime erases at
	 * the `compilePlugins` boundary regardless.
	 */
	readonly plugins?: readonly (
		| StudioPlugin<UserConfig>
		| PuckPlugin<UserConfig>
	)[];
	/**
	 * Layer 3 host overrides forwarded to `createStudioConfig`.
	 * `<Studio>` owns the config factory call so descendants get a
	 * single `StudioConfigProvider`-scoped instance.
	 */
	readonly config?: DeepPartial<StudioConfig>;
	/**
	 * Consumer-supplied Puck overrides. Composed **outermost** —
	 * after the plugins' overrides — so the consumer always has the
	 * final word on any given slot.
	 */
	readonly overrides?: Partial<PuckOverrides<UserConfig>>;
	/**
	 * Forwarded to `<Puck onChange>` after the `onDataChange`
	 * lifecycle has fired.
	 */
	readonly onChange?: (data: PuckDataFor<UserConfig>) => void;
	/**
	 * Forwarded to `<Puck onPublish>` **only if** the
	 * `onBeforePublish` lifecycle resolves without throwing.
	 */
	readonly onPublish?: (data: PuckDataFor<UserConfig>) => void | Promise<void>;
	/**
	 * @deprecated Legacy `aiHost` string. When provided, `<Studio>`
	 * dynamically imports `@anvilkit/core/compat/ai-host-adapter` and
	 * prepends the adapter to the plugin list. Migrate to
	 * `createAiGenerationPlugin()` from
	 * `@anvilkit/plugins/ai-generation`.
	 */
	readonly aiHost?: string;
	/**
	 * Which chrome to render. `"anvilkit"` (default) mounts the
	 * AnvilKit Studio shell; `"puck"` ships the raw `@puckeditor/core`
	 * UI (bit-for-bit pre-Phase-5 output).
	 */
	readonly chrome?: StudioChromeMode;
	/**
	 * Initial Puck `UiState` partial. When `chrome="anvilkit"` it is
	 * merged with the chrome's full-width-viewport defaults via
	 * `mergeStudioUi()`.
	 */
	readonly ui?: Partial<PuckUiState>;
	/** Forwarded to `<Puck onAction>` — every Puck action dispatch. */
	readonly onAction?: PuckOnAction<PuckDataFor<UserConfig>>;
	/** Forwarded to `<Puck viewports>`. */
	readonly viewports?: PuckViewports;
	/**
	 * Per-instance store id. Persisted `EditorUiState` keys live under
	 * `anvilkit-ui-${storeId}`, so two `<Studio>` instances on one
	 * page should pass distinct ids.
	 */
	readonly storeId?: string;
	/** Optional "back" handler for the chrome header. Hidden when absent. */
	readonly onBack?: () => void;
	/** Optional "save draft" handler; header surfaces a button when set. */
	readonly onSaveDraft?: () => void | Promise<void>;
	/** Drives the "save draft" button's loading state. */
	readonly isSavingDraft?: boolean;
	/** Timestamp of the last successful save (relative-time hint). */
	readonly lastSavedAt?: Date | null;
	/** Drives the "Publish" button's loading state. */
	readonly isPublishing?: boolean;
	/**
	 * Optional click handler for the panel's "Publish to live" action.
	 * Disabled when omitted. The Puck `onPublish` pipeline still fires
	 * through Puck's own publish UI; this exists so the AnvilKit chrome
	 * can offer a header button wired to the host's publish flow.
	 */
	readonly onPublishClick?: () => void;
	/**
	 * Optional handler invoked from the publish panel's Export submenu
	 * with the format id. The host normalizes Puck data to `PageIR`,
	 * calls `runtime.exportFormats.get(formatId).run(ir, options)`, and
	 * triggers the download. The submenu disables itself when omitted.
	 */
	readonly onExport?: (formatId: string) => void | Promise<void>;
	/**
	 * Optional replacement for the AnvilKit chrome's placeholder
	 * collaborator stack. Accepts a `ReactNode` or a `ComponentType`.
	 * Ignored when `chrome="puck"`.
	 */
	readonly collaboratorsSlot?: CollaboratorsSlotValue;
	/**
	 * Optional diagnostics sink for plugin log records and Studio setup
	 * failures. Metadata is shallow-redacted before delivery.
	 */
	readonly logger?: StudioLogger;
	/**
	 * Optional pages source for the sidebar's `layer` module. Ignored
	 * when `chrome="puck"`.
	 */
	readonly pages?: StudioPagesSource;
	/**
	 * Per-instance i18n overrides forwarded to
	 * `EditorI18nStoreProvider`. Keys are message ids
	 * (`studio.module.*`). Ignored when `chrome="puck"`.
	 */
	readonly messages?: Readonly<Record<string, string>>;
}

/** What the thin `<Studio>` view needs back from the controller. */
export interface StudioControllerState {
	readonly isAnvilkit: boolean;
	readonly compiled: CompiledStudioRuntime | null;
	readonly chromeAssets: ChromeAssets | null;
	readonly mergedOverrides: Partial<PuckOverrides>;
	readonly handleChange: (next: PuckData) => void;
	readonly handlePublish: (next: PuckData) => void;
	readonly themeStore: ThemeStoreApi;
	readonly exportStore: ExportStoreApi;
	readonly aiStore: AiStoreApi;
	readonly sidebarRegistryStore: SidebarRegistryStoreApi;
	readonly resolvedStoreId: string;
	readonly rootRef: RefObject<HTMLDivElement | null>;
}

const FALLBACK_STORE_ID_PREFIX = "anvilkit";
export const DEFAULT_CHROME_MODE: StudioChromeMode = "anvilkit";

/**
 * An empty Puck `Data` snapshot used as the default when the consumer
 * does not pass `data`. Module scope so the reference is stable.
 */
export const EMPTY_DATA: PuckData = {
	root: { props: {} },
	content: [],
	zones: {},
};

/**
 * Debounce window (ms) for `onDataChange` plugin hooks. Puck's
 * `onChange` fires per keystroke; 250 ms balances "feels live" against
 * "does not hammer autosave/telemetry plugins."
 */
const DATA_CHANGE_DEBOUNCE_MS = 250;

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
 * Structural fingerprint for the `config` prop. `JSON.stringify` is
 * cheap for the shallow partial shape and order-sensitive at the key
 * level (a key swap is a genuinely different config).
 *
 * **Non-JSON values fall back to reference identity** (codex-review
 * P2): `StudioConfig.experimental` is a `Record<string, unknown>`, so
 * a host may pass a function/symbol/bigint there. `JSON.stringify`
 * silently drops functions/symbols (and throws on bigint), so two
 * different configs (`{ experimental: { transform: fnA } }` vs
 * `fnB`) would otherwise hash identically (`{"experimental":{}}`) and
 * the compile effect would never re-run — plugins keep seeing a stale
 * `ctx.studioConfig`. When the replacer observes any non-serializable
 * value we cannot structurally compare it, so we key on object
 * identity instead (mirrors {@link fingerprintPlugins}): a new
 * reference re-compiles, which is the safe, correct choice. Pure-JSON
 * configs keep the cheap structural hash (no recompile thrash).
 */
// Dev-only footgun detector: a host that passes an inline
// `config={{ experimental: { transform: fn } }}` without memoizing
// gets a fresh identity every render (the safe identity fallback
// below), which re-runs the whole dynamic-import + `compilePlugins`
// effect each parent render. We can't fix it for them (dropping the
// function would be unsafe) but a one-shot warn surfaces it.
let _nonJsonFingerprintWarned = false;
let _lastNonJsonProjection: string | undefined;
let _lastNonJsonRef: object | undefined;

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

function warnRepeatedConfigRecompile(config: object, projection: string): void {
	if (
		nodeEnv() === "production" ||
		_nonJsonFingerprintWarned ||
		_lastNonJsonRef === undefined
	) {
		_lastNonJsonProjection = projection;
		_lastNonJsonRef = config;
		return;
	}
	// New object identity but structurally-equal projection ⇒ the host
	// is re-creating the same config inline every render.
	if (_lastNonJsonRef !== config && _lastNonJsonProjection === projection) {
		_nonJsonFingerprintWarned = true;
		console.warn(
			"[studio] `config` contains a function/symbol/bigint and is not " +
				"referentially stable across renders. Every render now re-runs " +
				"the full plugin compile. Memoize the config (or hoist it) so " +
				"`<Studio>` can skip the recompile. (Logged once.)",
		);
	}
	_lastNonJsonProjection = projection;
	_lastNonJsonRef = config;
}

function fingerprintConfig(config: unknown): string {
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
}

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
 * Normalize an `Error` to a fully-enumerable shape so `name`/
 * `message`/`stack`/`cause` survive `JSON.stringify` boundaries (Next
 * dev overlay, host loggers, bug reports). `cause` is unwrapped
 * recursively (depth-bounded) because wrapper errors carry the real
 * reason there.
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
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(meta)) {
		out[key] = shouldRedactKey(key) ? "[REDACTED]" : normalizeLogValue(value);
	}
	return out;
}

export function writeStudioLog(
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
		// Apply `defaultMode` only to a user with no persisted
		// preference. The store starts at `"system"` *and* reports
		// `"system"` before rehydration, so writing here pre-hydration
		// would clobber a persisted `"light"`/`"dark"` the moment it
		// loads. `ThemeStoreProvider`'s rehydrate is gated behind the
		// hydration boundary, so wait for `onFinishHydration` (or run
		// now if already hydrated) and decide against the *rehydrated*
		// mode.
		const applyDefaultMode = (): void => {
			if (theme.defaultMode === "system") {
				return;
			}
			if (themeStore.getState().mode === "system") {
				themeStore.getState().setMode(theme.defaultMode);
			}
		};
		const persist = (
			themeStore as unknown as {
				persist: {
					hasHydrated(): boolean;
					onFinishHydration(cb: () => void): () => void;
				};
			}
		).persist;
		if (persist.hasHydrated()) {
			applyDefaultMode();
			return;
		}
		return persist.onFinishHydration(applyDefaultMode);
	}, [compiled, exportStore, themeStore]);
}

/**
 * Drive the engine into the `init` phase once per compiled runtime
 * (architecture §6 A2). The engine fires `onInit` and records its
 * settle promise so the later `advanceTo("ready")` can chain `onReady`
 * strictly after it — the ordering/dedupe the shell used to
 * hand-orchestrate with `onInitPromise` + `queueMicrotask`.
 */
function useRuntimeInit(compiled: CompiledStudioRuntime | null): void {
	useEffect(() => {
		if (compiled === null) {
			return;
		}
		compiled.runtime.lifecycle.advanceTo("init", compiled.ctx);
	}, [compiled]);
}

/**
 * Error thrown by {@link StudioPluginContext.getPuckApi} when a plugin
 * reads the Puck API before {@link PuckApiBinder} binds it. Hoisted so
 * tests can match the exact message.
 */
const PUCK_API_UNBOUND_MESSAGE =
	"StudioPluginContext.getPuckApi() was called before <Puck> finished mounting. " +
	"Move the call into a header action or a post-mount lifecycle hook " +
	"(`onReady`, `onDataChange`, `onBeforePublish`, `onAfterPublish`) so it runs after Puck's effect-time binder has captured the API.";

type GetPuckSnapshot = ReturnType<typeof useGetPuck>;

/**
 * Runs inside Puck's subtree, captures the live `PuckApi` via
 * {@link useGetPuck}, stores the snapshot on the shared ref, and
 * renders `children` verbatim. JSX-free (`createElement`) so this
 * module stays a `.ts` orchestration file.
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
		apiRef.current = getPuck;
		onBound?.();
	}, [apiRef, getPuck, onBound]);
	return createElement(Fragment, null, children);
}

/**
 * Per-runtime compile identity. A1 unified three refs into this
 * object; A2 then moved the `onInit` settle promise and the `onReady`
 * dedupe **into the engine phase machine**, so only the compile
 * generation guard remains here (it tracks stale async compiles, a
 * concern orthogonal to the lifecycle phase).
 */
interface RuntimeIdentity {
	/** Monotonic compile generation; bumped per pass + on cleanup. */
	generation: number;
}

/**
 * Headless orchestration for `<Studio>`. Hook-call order is identical
 * to the pre-extraction component so React's effect sequencing,
 * StrictMode double-invoke behavior, and ref identity are unchanged.
 */
// `StudioProps` is generic so an external `StudioPlugin<UserConfig>`
// keeps its types through the public boundary. The controller's
// internals (runtime, lifecycle, refs) stay non-generic — `UserConfig`
// is a compile-time boundary contract only, erased to the default via
// the localized casts marked "generic→default boundary" below. This
// keeps `compilePlugins`/`StudioRuntime` (deliberately non-generic)
// untouched while every existing non-generic caller is unaffected.
export function useStudioController<UserConfig extends PuckConfig = PuckConfig>(
	props: StudioProps<UserConfig>,
): StudioControllerState {
	const {
		plugins,
		config,
		overrides: consumerOverrides,
		onChange,
		onPublish,
		aiHost,
		chrome = DEFAULT_CHROME_MODE,
		data,
		storeId,
		logger,
	} = props;
	const isAnvilkit = chrome === "anvilkit";

	// generic→default boundary: `data` is `PuckDataFor<UserConfig>`;
	// the ref + lifecycle/`getData()` operate on the broad default.
	const dataRef = useRef<PuckData>(
		(data as PuckData | undefined) ?? EMPTY_DATA,
	);
	useLayoutEffect(() => {
		if (data !== undefined) {
			dataRef.current = data as PuckData;
		}
	}, [data]);

	const puckApiRef = useRef<GetPuckSnapshot | null>(null);

	// Compile-generation guard (A1 unified the refs; A2 moved the
	// onInit/onReady bookkeeping into the engine phase machine).
	const identityRef = useRef<RuntimeIdentity>({ generation: 0 });

	// Single-flight publish chain: serialize overlapping publishes so
	// the onBeforePublish → onPublish → onAfterPublish chains never
	// interleave. The tail promise is replaced on every call; each
	// queued task awaits the previous tail.
	const publishQueueRef = useRef<Promise<void>>(Promise.resolve());
	// Flipped by the teardown effect's cleanup. A slow consumer
	// onPublish can resolve after dispose(); this lets the queued
	// continuation skip a post-dispose onAfterPublish emit against a
	// disposed runtime / reset stores.
	const disposedRef = useRef(false);

	// `onReady` dedupe per `(runtime, getPuck)` pair. The engine phase
	// machine is already idempotent for a given runtime, but Puck can
	// re-initialize mid-session (new `getPuck`) while `compiled` is
	// unchanged; this skips the redundant `advanceTo("ready")` churn so
	// the intent ("ready is driven exactly once per runtime") is
	// legible at the call site and not solely an engine invariant.
	const readyDrivenRef = useRef<{
		runtime: CompiledStudioRuntime;
		getPuck: GetPuckSnapshot;
	} | null>(null);

	const rootRef = useRef<HTMLDivElement>(null);

	const [sidebarRegistryStore] = useState<SidebarRegistryStoreApi>(() => {
		const store = createSidebarRegistryStore();
		for (const section of DEFAULT_INSERT_SECTIONS) {
			store.getState().registerInsertSection(section);
		}
		return store;
	});

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

	const [compiled, setCompiled] = useState<CompiledStudioRuntime | null>(null);
	const [chromeAssets, setChromeAssets] = useState<ChromeAssets | null>(null);

	const pluginsFingerprint = useMemo(
		// generic→default boundary: structural hash only; variance-safe.
		() =>
			fingerprintPlugins(
				plugins as readonly (StudioPlugin | PuckPlugin)[] | undefined,
			),
		[plugins],
	);
	const configFingerprint = useMemo(() => fingerprintConfig(config), [config]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: fingerprints intentionally replace raw references so inline arrays/objects do not thrash the runtime.
	useEffect(() => {
		// New compile generation; tear down the prior runtime + chrome.
		// Fails closed: while plugins/config/chrome change (or if the
		// new compile rejects) the editor renders `null` instead of
		// keeping a superseded plugin set mounted.
		identityRef.current.generation += 1;
		const myGen = identityRef.current.generation;
		const isStale = (): boolean => myGen !== identityRef.current.generation;
		setCompiled(null);
		setChromeAssets(null);
		// generic→default boundary: the runtime is non-generic.
		const basePlugins = (plugins ?? []) as readonly (
			| StudioPlugin
			| PuckPlugin
		)[];

		async function setup(): Promise<void> {
			const { createStudioConfig } = await import("@/config/create-config");
			if (isStale()) {
				return;
			}
			const studioConfig = createStudioConfig(config);

			let nextChromeAssets: ChromeAssets | null = null;
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
					StudioLayout: layoutMod.StudioLayout,
				};
			}

			let resolvedPlugins: readonly (StudioPlugin | PuckPlugin)[] = [
				jsonExportPlugin,
				...basePlugins,
			];
			if (aiHost !== undefined) {
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

			// `ctx.emit` is reserved (architecture §12 / A4): warn once
			// per ctx instead of a silent no-op.
			let emitReservedWarned = false;

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
				emit: (event) => {
					// Reserved/inert until the event bus ships. Do not
					// throw, but do not stay silent: warn exactly once
					// per ctx (every environment — rate-limited, real
					// misuse) so the inert contract is discoverable.
					if (!emitReservedWarned) {
						emitReservedWarned = true;
						writeStudioLog(
							logger,
							"warn",
							`ctx.emit("${event}") is reserved and inert: the plugin-to-plugin event bus is not implemented yet (architecture §12). No subscriber will receive this event. This warning fires once per plugin context.`,
							{ event },
						);
					}
				},
				registerAssetResolver: () => {
					// compilePlugins() passes plugins a wrapper context
					// with a runtime-backed collector; this base context
					// stays immutable for the rest of the shell.
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
				registerDesignSystemPanel: (panel) =>
					sidebarRegistryStore.getState().registerDesignSystemPanel(panel),
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
					return;
				}
				writeStudioLog(logger, "error", "plugin compilation failed", {
					error,
				});
			}
		}

		void setup();
		return () => {
			identityRef.current.generation += 1;
		};
	}, [pluginsFingerprint, aiHost, configFingerprint, isAnvilkit, logger]);

	useHydrateRuntimeStores(compiled, exportStore, themeStore);

	useRuntimeInit(compiled);

	// Fired by the Puck-API binder's effect once `getPuckApi()` is
	// safe. The engine phase machine (A2) now owns the
	// once-per-runtime dedupe and the "after onInit settles" ordering
	// the shell used to hand-orchestrate with `readyFiredFor` +
	// `queueMicrotask` + `onInitPromise`. A `ready` that races ahead
	// of `init` is a lenient no-op; the binder effect re-runs and
	// retries, so no microtask defer is needed here.
	const handlePuckBound = useCallback((): void => {
		if (compiled === null) {
			return;
		}
		// Skip a repeat `advanceTo("ready")` for the same runtime + the
		// same bound `getPuck`. `puckApiRef.current` is the live binder
		// identity (set by `PuckApiBinder` immediately before `onBound`).
		const driven = readyDrivenRef.current;
		const getPuck = puckApiRef.current;
		if (
			driven !== null &&
			driven.runtime === compiled &&
			getPuck !== null &&
			driven.getPuck === getPuck
		) {
			return;
		}
		if (getPuck !== null) {
			readyDrivenRef.current = { runtime: compiled, getPuck };
		}
		compiled.runtime.lifecycle.advanceTo("ready", compiled.ctx);
	}, [compiled]);

	useEffect(() => {
		if (compiled === null) {
			return;
		}
		// Re-arm the post-dispose guard for this runtime (a remount via
		// a new `compiled` gets a fresh teardown window).
		disposedRef.current = false;
		const { runtime, ctx } = compiled;
		return () => {
			// Mark disposed *before* dispose()/store resets so an
			// in-flight queued publish bails out of `onAfterPublish`.
			disposedRef.current = true;
			// `onDestroy` stays a shell-emitted event so it closes over
			// the exact runtime/ctx pair that fired `onInit`; the phase
			// marker keeps a late `onInit`-settle `.then` from firing a
			// post-teardown `onReady`.
			runtime.lifecycle.advanceTo("destroyed", ctx);
			void runtime.lifecycle.emit("onDestroy", ctx);
			runtime.lifecycle.dispose();
			exportStore.getState().reset();
			aiStore.getState().reset();
			// Theme persists across sessions — survives teardown.
		};
	}, [compiled, exportStore, aiStore]);

	const mergedOverrides = useMemo<Partial<PuckOverrides>>(() => {
		const base: Partial<PuckOverrides>[] = [];
		if (isAnvilkit && chromeAssets !== null) {
			base.push(chromeAssets.studioOverrides);
		}
		if (compiled !== null) {
			base.push(...compiled.runtime.overrides);
		}
		if (consumerOverrides !== undefined) {
			// generic→default boundary: merge operates structurally.
			base.push(consumerOverrides as Partial<PuckOverrides>);
		}
		// Puck-API binder is outermost-of-all so it always runs
		// `useGetPuck()` inside the Puck subtree; composed (not
		// clobbering) any consumer `puck` override.
		base.push({
			puck: ({ children }) =>
				createElement(PuckApiBinder, {
					apiRef: puckApiRef,
					onBound: handlePuckBound,
					children,
				}),
		});
		return mergeOverrides(base);
	}, [compiled, consumerOverrides, isAnvilkit, chromeAssets, handlePuckBound]);

	// generic→default boundary: the public callbacks are typed against
	// `PuckDataFor<UserConfig>`; internally Puck hands us the broad
	// default `Data`, so the refs hold the erased default signature.
	type DefaultOnChange = (data: PuckData) => void;
	type DefaultOnPublish = (data: PuckData) => void | Promise<void>;
	const onChangeRef = useRef<DefaultOnChange | undefined>(
		onChange as DefaultOnChange | undefined,
	);
	const onPublishRef = useRef<DefaultOnPublish | undefined>(
		onPublish as DefaultOnPublish | undefined,
	);
	useLayoutEffect(() => {
		onChangeRef.current = onChange as DefaultOnChange | undefined;
		onPublishRef.current = onPublish as DefaultOnPublish | undefined;
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

	const handlePublish = useCallback(
		(nextData: PuckData): void => {
			const consumerOnPublish = onPublishRef.current;
			// Capture the runtime + compile generation synchronously, at
			// call time, before any await.
			const runtimeAtCall = compiled;
			const myGen = identityRef.current.generation;
			// The plugin lifecycle emits are runtime-bound: skip them if
			// the runtime was disposed or superseded by a recompile while
			// this publish sat in the queue. The consumer callback is
			// NOT gated — dropping a host's save would be data loss.
			const runtimeLive = (): boolean =>
				!disposedRef.current &&
				identityRef.current.generation === myGen &&
				runtimeAtCall !== null;

			// Single-flight: chain onto the queue tail so overlapping
			// publishes serialize (onBeforePublish → onPublish →
			// onAfterPublish never interleave). `.catch` keeps the chain
			// alive — one failed publish must not poison the next.
			const task = publishQueueRef.current.then(async () => {
				if (runtimeAtCall !== null && runtimeLive()) {
					try {
						await runtimeAtCall.runtime.lifecycle.emit(
							"onBeforePublish",
							runtimeAtCall.ctx,
							nextData,
						);
					} catch (error) {
						writeStudioLog(logger, "error", "publish aborted by plugin", {
							error,
						});
						return;
					}
				}

				try {
					await consumerOnPublish?.(nextData);
				} catch (error) {
					writeStudioLog(logger, "error", "consumer onPublish threw", {
						error,
					});
					return;
				}

				if (runtimeAtCall !== null && runtimeLive()) {
					await runtimeAtCall.runtime.lifecycle.emit(
						"onAfterPublish",
						runtimeAtCall.ctx,
						nextData,
					);
				}
			});
			publishQueueRef.current = task.catch(() => {
				// Swallowed: a failed publish must not poison the queue.
			});
		},
		[compiled, logger],
	);

	return {
		isAnvilkit,
		compiled,
		chromeAssets,
		mergedOverrides,
		handleChange,
		handlePublish,
		themeStore,
		exportStore,
		aiStore,
		sidebarRegistryStore,
		resolvedStoreId,
		rootRef,
	};
}

// Re-export Puck/Studio prop types the view also needs, so `Studio.tsx`
// has a single import site for controller surface.
export type {
	CollaboratorsSlotValue,
	DeepPartial,
	PuckConfig,
	PuckData,
	PuckOnAction,
	PuckOverrides,
	PuckPlugin,
	PuckUiState,
	PuckViewports,
	StudioChromeMode,
	StudioConfig,
	StudioPagesSource,
};
