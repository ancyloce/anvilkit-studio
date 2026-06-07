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
import { compilePlugins } from "@/runtime/compile-plugins";
import {
	createEditorStore,
	type EditorStoreBundle,
} from "@/state/editor-store-bundle";
import {
	createSidebarRegistryStore,
	type ExportStoreApi,
	type LocaleStoreApi,
	type SidebarRegistryStoreApi,
	type ThemeStoreApi,
} from "@/state/index";
import type { StudioConfig } from "@/types/config";
import type { StudioPagesSource } from "@/types/pages";
import type { StudioPlugin } from "@/types/plugin";
import {
	createConfigFingerprinter,
	fingerprintPlugins,
} from "./plugin-fingerprint.js";
import { createShellPluginContext } from "./shell-plugin-context.js";
import type {
	ChromeAssets,
	CompiledStudioRuntime,
	GetPuckSnapshot,
	StoredRuntime,
	StudioControllerState,
	StudioProps,
} from "./studio-controller-types.js";
import { type StudioLogger, writeStudioLog } from "./studio-log.js";

// The controller's type surface (`StudioProps`, `CompiledStudioRuntime`,
// `ChromeAssets`, `StudioControllerState`, the internal `StoredRuntime` /
// `GetPuckSnapshot`) lives in `studio-controller-types.ts` (review
// finding P2-1) so this file is orchestration logic, not ~250 lines of
// prop declarations. Re-exported here so the public
// `@anvilkit/core/react` surface (`{ StudioProps }`, threaded through
// `Studio.tsx`) is unchanged.
export type {
	ChromeAssets,
	CompiledStudioRuntime,
	StudioControllerState,
	StudioProps,
} from "./studio-controller-types.js";
// `StudioLogger` + the structured-logging sink (`writeStudioLog`) now
// live in `studio-log.ts` (review finding RX-b). Re-exported here so the
// public `@anvilkit/core/react` surface (`{ StudioLogger }`, threaded
// through `Studio.tsx`) is unchanged.
export type { StudioLogger };

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
	localeStore: LocaleStoreApi,
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
		// loads. The store's rehydrate is gated behind the hydration
		// boundary, so wait for `onFinishHydration` (or run now if
		// already hydrated) and decide against the *rehydrated* mode.
		const applyDefaultMode = (): void => {
			if (theme.defaultMode === "system") {
				return;
			}
			if (themeStore.getState().mode === "system") {
				themeStore.getState().setMode(theme.defaultMode);
			}
		};

		// Same shape for locale: `"en"` is the store default, so seed a
		// non-`"en"` config locale only when the user has no persisted
		// choice. Never clobbers a persisted `setLocale`. (P3 handoff.)
		const i18n = compiled.studioConfig.i18n;
		const applyDefaultLocale = (): void => {
			if (i18n.locale === "en") {
				return;
			}
			if (localeStore.getState().locale === "en") {
				localeStore.getState().setLocale(i18n.locale);
			}
		};

		// Each store is a separate `persist` instance with its own
		// hydration; seed each after *its* rehydration and collect the
		// unsubscribes so the effect tears both down. `*StoreApi` carries
		// the persist middleware surface (inferred from its factory), so
		// reach `.persist` directly — no `as unknown as` erasure.
		const unsubscribers: Array<() => void> = [];
		const seedWhenHydrated = (
			persist: {
				hasHydrated(): boolean;
				onFinishHydration(callback: () => void): () => void;
			},
			apply: () => void,
		): void => {
			if (persist.hasHydrated()) {
				apply();
				return;
			}
			unsubscribers.push(persist.onFinishHydration(apply));
		};
		seedWhenHydrated(themeStore.persist, applyDefaultMode);
		seedWhenHydrated(localeStore.persist, applyDefaultLocale);

		return () => {
			for (const unsubscribe of unsubscribers) {
				unsubscribe();
			}
		};
	}, [compiled, exportStore, themeStore, localeStore]);
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
	// Phase 2: one coordinated bundle (theme/export/ai/ui) created once per
	// mount, instead of three separate `useState` stores. The four slices keep
	// their own factories, reducers, and persist keys — `createEditorStore`
	// just composes them. `themeStore`/`exportStore`/`aiStore` are derived
	// views onto the bundle so the controller's return shape (and the legacy
	// `chrome="puck"` provider trio + `useHydrateRuntimeStores`/teardown) are
	// unchanged.
	const [editorStore] = useState<EditorStoreBundle>(() =>
		createEditorStore({ storeId: resolvedStoreId }),
	);
	const themeStore = editorStore.theme;
	const exportStore = editorStore.export;
	const aiStore = editorStore.ai;
	const localeStore = editorStore.locale;

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

			// Base shell plugin context (review finding P2-1): live-ref
			// getters, host-logger sink, config-locale `t`, and the
			// per-instance sidebar registry proxies. A fresh ctx (and its
			// once-per-ctx `emit` warning latch) per compile, as before.
			const ctx = createShellPluginContext({
				dataRef,
				puckApiRef,
				studioConfig,
				sidebarRegistryStore,
				loggerRef,
			});

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

	useHydrateRuntimeStores(activeCompiled, exportStore, themeStore, localeStore);

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
		editorStore,
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
