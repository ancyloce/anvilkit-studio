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
import type { StudioPlugin, StudioPluginContext } from "@/types/plugin";
import {
	createConfigFingerprinter,
	fingerprintPlugins,
} from "./plugin-fingerprint.js";
import { type StudioLogger, writeStudioLog } from "./studio-log.js";

// `StudioLogger` + the structured-logging sink (`writeStudioLog`) now
// live in `studio-log.ts` (review finding RX-b). Re-exported here so the
// public `@anvilkit/core/react` surface (`{ StudioLogger }`, threaded
// through `Studio.tsx`) is unchanged.
export type { StudioLogger };

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
 * The compiled runtime as held in state, tagged with the `compileKey`
 * (the input-identity token) that produced it and the chrome assets
 * compiled alongside it. A render whose current `compileKey` no longer
 * matches a stored runtime's treats it as absent — see `activeCompiled`
 * in {@link useStudioController}. Internal: consumers receive the public
 * {@link CompiledStudioRuntime} shape.
 */
interface StoredRuntime extends CompiledStudioRuntime {
	readonly compileKey: object;
	readonly chromeAssets: ChromeAssets | null;
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
	 *
	 * **Keep this stable for a given mount** (review finding Z-b/Z-2):
	 * the injected theme/export/ai stores freeze their resolved store id
	 * via `useState` at create time and do **not** re-key on a live
	 * `storeId` change. To re-target persistence (e.g. switch documents),
	 * remount `<Studio>` with a new React `key` rather than changing
	 * `storeId` in place.
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
	 *
	 * Receives the **live** editor document (read from the Puck API at
	 * click time), so the host publishes current edits rather than a
	 * stale snapshot. A `() => void` handler stays assignable (the data
	 * arg is simply ignored).
	 */
	readonly onPublishClick?: (data: PuckData) => void;
	/**
	 * Optional handler invoked from the publish panel's Export submenu
	 * with the format id. The host normalizes Puck data to `PageIR`,
	 * calls `runtime.exportFormats.get(formatId).run(ir, options)`, and
	 * triggers the download. The submenu disables itself when omitted.
	 */
	readonly onExport?: (formatId: string) => void | Promise<void>;
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
	/**
	 * Optional node rendered while the runtime compiles (and, for
	 * anvilkit chrome, while the lazily-loaded chrome assets resolve).
	 * Lets a host supply its own branded skeleton without wrapping
	 * `<Studio>` in a loading-state machine. A supplied node always wins
	 * over the built-in default.
	 *
	 * Default when omitted:
	 * - `chrome="anvilkit"` (the default): the built-in
	 *   `StudioLoadingScreen` skeleton (skeleton rail / panel / header +
	 *   a spinner-and-text canvas), so the pre-compile window shows the
	 *   editor's shape instead of a blank frame.
	 * - `chrome="puck"`: bare `null`, exactly as before — the legacy path
	 *   stays byte-for-byte identical to pre-Phase-5 Puck.
	 *
	 * Kept a plain `ReactNode` (not a render-prop) so it stays trivially
	 * passthrough and does not couple the host skeleton to runtime
	 * internals — a host that wants to paint deferred-plugin toolbar
	 * placeholders can compute them from its own plugin metas'
	 * `staticHeaderActions` (3.3) and render them inside this node.
	 */
	readonly loading?: ReactNode;
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
		// `ThemeStoreApi` now carries the persist middleware surface (it is
		// inferred from `createThemeStore`), so reach `.persist` directly — no
		// `as unknown as` erasure of the persist API.
		const { persist } = themeStore;
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

	// Per-instance config fingerprinter (review finding RX-2): the
	// dev-only "config is not referentially stable across renders"
	// warning is now closure-scoped, so two `<Studio>` mounts can no
	// longer trip each other's one-shot warning.
	const fingerprintConfigRef = useRef(createConfigFingerprinter());

	// Latest `logger` behind a ref so the compile effect can read it
	// without listing `logger` as a dependency. `plugins`/`config` are
	// fingerprinted to tolerate unstable inline references; a raw `logger`
	// in the compile-effect deps was the one gap — an inline `logger={(…)
	// => …}` (a brand-new identity every render) tore down and recompiled
	// the entire plugin set on every parent render (onDestroy → register →
	// onInit → onReady churn + a `setCompiled(null)` flash). `ctx.log`
	// reads `loggerRef.current`, so the newest logger is always used
	// without a recompile.
	const loggerRef = useRef<StudioLogger | undefined>(logger);

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

	// One stored value, tagged with the `compileKey` that produced it.
	// `setCompiled(null)` on every input change is replaced by deriving
	// `activeCompiled` below: a stored runtime whose key is stale reads as
	// absent, so the editor fails closed and the teardown effect disposes
	// it — without an effect resetting state on a prop change.
	const [stored, setStored] = useState<StoredRuntime | null>(null);

	const pluginsFingerprint = useMemo(
		// generic→default boundary: structural hash only; variance-safe.
		() =>
			fingerprintPlugins(
				plugins as readonly (StudioPlugin | PuckPlugin)[] | undefined,
			),
		[plugins],
	);
	const configFingerprint = useMemo(
		() => fingerprintConfigRef.current(config),
		[config],
	);

	// Identity token recomputed only when an input that requires a full
	// recompile changes. It drives the compile effect's single dependency
	// and is stored alongside the runtime, so the derived `activeCompiled`
	// can mask a runtime built for a now-superseded key.
	const compileKey = useMemo(
		() => ({ pluginsFingerprint, aiHost, configFingerprint, isAnvilkit }),
		[pluginsFingerprint, aiHost, configFingerprint, isAnvilkit],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: `compileKey` folds the plugin/config fingerprints + `aiHost` + chrome flag into one token; raw references stay out of the deps so inline arrays/objects do not thrash the runtime, and `logger` is read through `loggerRef` so an unstable inline logger does not trigger a full plugin recompile.
	useEffect(() => {
		// New compile generation. The prior runtime is *not* reset to
		// `null` here: once `compileKey` changes, the derived
		// `activeCompiled` masks it (fail-closed render) and the
		// `[activeCompiled]` teardown effect disposes it. This effect owns
		// only the async compile and its stale-generation guard.
		identityRef.current.generation += 1;
		const myGen = identityRef.current.generation;
		const isStale = (): boolean => myGen !== identityRef.current.generation;
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
					writeStudioLog(loggerRef.current, level, message, meta);
				},
				emit: (event) => {
					// Reserved/inert until the event bus ships. Do not
					// throw, but do not stay silent: warn exactly once
					// per ctx (every environment — rate-limited, real
					// misuse) so the inert contract is discoverable.
					if (!emitReservedWarned) {
						emitReservedWarned = true;
						writeStudioLog(
							loggerRef.current,
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
					// This compile was superseded before it could mount (a faster
					// config/plugin change, or a StrictMode dev double-invoke).
					// `setStored` is never called, so the `[activeCompiled]`
					// teardown effect never sees this runtime — emit its teardown
					// here, or
					// any resources a plugin allocated in `register()` leak (e.g. a
					// managed collab transport's WebSocket + Y.Doc + Awareness).
					// `onInit` never fired, but `onDestroy` hooks guard on
					// onInit-set state, so this matches a mount→immediate-unmount.
					runtime.lifecycle.advanceTo("destroyed", ctx);
					void runtime.lifecycle.emit("onDestroy", ctx);
					runtime.lifecycle.dispose();
					return;
				}
				setStored({
					runtime,
					studioConfig,
					ctx,
					compileKey,
					chromeAssets: nextChromeAssets,
				});
			} catch (error) {
				if (isStale()) {
					return;
				}
				writeStudioLog(
					loggerRef.current,
					"error",
					"plugin compilation failed",
					{
						error,
					},
				);
			}
		}

		void setup();
		return () => {
			identityRef.current.generation += 1;
		};
	}, [compileKey]);

	// A stored runtime whose `compileKey` no longer matches the current
	// render is a superseded compile still settling. Masking it here gives
	// the fail-closed render (`activeCompiled === null` ⇒ no superseded
	// plugin set mounted) and drives the `[activeCompiled]` teardown effect
	// to dispose it — both previously triggered by `setCompiled(null)`.
	const activeStored =
		stored !== null && stored.compileKey === compileKey ? stored : null;
	const activeCompiled: CompiledStudioRuntime | null = activeStored;
	const activeChromeAssets: ChromeAssets | null =
		activeStored?.chromeAssets ?? null;

	useHydrateRuntimeStores(activeCompiled, exportStore, themeStore);

	useRuntimeInit(activeCompiled);

	// Fired by the Puck-API binder's effect once `getPuckApi()` is
	// safe. The engine phase machine (A2) now owns the
	// once-per-runtime dedupe and the "after onInit settles" ordering
	// the shell used to hand-orchestrate with `readyFiredFor` +
	// `queueMicrotask` + `onInitPromise`. A `ready` that races ahead
	// of `init` is a lenient no-op; the binder effect re-runs and
	// retries, so no microtask defer is needed here.
	const handlePuckBound = useCallback((): void => {
		if (activeCompiled === null) {
			return;
		}
		// Skip a repeat `advanceTo("ready")` for the same runtime + the
		// same bound `getPuck`. `puckApiRef.current` is the live binder
		// identity (set by `PuckApiBinder` immediately before `onBound`).
		const driven = readyDrivenRef.current;
		const getPuck = puckApiRef.current;
		if (
			driven !== null &&
			driven.runtime === activeCompiled &&
			getPuck !== null &&
			driven.getPuck === getPuck
		) {
			return;
		}
		if (getPuck !== null) {
			readyDrivenRef.current = { runtime: activeCompiled, getPuck };
		}
		activeCompiled.runtime.lifecycle.advanceTo("ready", activeCompiled.ctx);
	}, [activeCompiled]);

	useEffect(() => {
		if (activeCompiled === null) {
			return;
		}
		// Re-arm the post-dispose guard for this runtime (a remount via
		// a new `activeCompiled` gets a fresh teardown window).
		disposedRef.current = false;
		const { runtime, ctx } = activeCompiled;
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
	}, [activeCompiled, exportStore, aiStore]);

	const mergedOverrides = useMemo<Partial<PuckOverrides>>(() => {
		const base: Partial<PuckOverrides>[] = [];
		if (isAnvilkit && activeChromeAssets !== null) {
			base.push(activeChromeAssets.studioOverrides);
		}
		if (activeCompiled !== null) {
			base.push(...activeCompiled.runtime.overrides);
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
	}, [
		activeCompiled,
		consumerOverrides,
		isAnvilkit,
		activeChromeAssets,
		handlePuckBound,
	]);

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
		loggerRef.current = logger;
	}, [onChange, onPublish, logger]);

	const handleChange = useCallback(
		(nextData: PuckData): void => {
			dataRef.current = nextData;
			if (activeCompiled !== null) {
				void activeCompiled.runtime.lifecycle.emit(
					"onDataChange",
					activeCompiled.ctx,
					nextData,
				);
			}
			onChangeRef.current?.(nextData);
		},
		[activeCompiled],
	);

	const handlePublish = useCallback(
		(nextData: PuckData): void => {
			const consumerOnPublish = onPublishRef.current;
			// Capture the runtime + compile generation synchronously, at
			// call time, before any await.
			const runtimeAtCall = activeCompiled;
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
						writeStudioLog(
							loggerRef.current,
							"error",
							"publish aborted by plugin",
							{
								error,
							},
						);
						return;
					}
				}

				try {
					await consumerOnPublish?.(nextData);
				} catch (error) {
					writeStudioLog(
						loggerRef.current,
						"error",
						"consumer onPublish threw",
						{
							error,
						},
					);
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
		[activeCompiled],
	);

	return {
		isAnvilkit,
		compiled: activeCompiled,
		chromeAssets: activeChromeAssets,
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
