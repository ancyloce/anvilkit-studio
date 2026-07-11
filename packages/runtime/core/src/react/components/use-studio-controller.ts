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
import { createEventBus } from "@/runtime/event-bus";
import type { StudioAnalyticsPort } from "@/shared/analytics-port";
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
	trackComponentDropped,
	trackDraftSaved,
	trackSeoUpdated,
} from "./analytics-events.js";
import {
	createConfigFingerprinter,
	fingerprintPlugins,
	mergeLiveI18n,
	stripReactiveConfig,
} from "./plugin-fingerprint.js";
import { runPublishPipeline } from "./publish-pipeline.js";
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

/**
 * Shared already-resolved promise seeding each mount's publish queue.
 * Module scope so `useRef` does not allocate (and discard) a fresh
 * promise on every render.
 */
const RESOLVED_PUBLISH_TAIL: Promise<void> = Promise.resolve();

function useHydrateRuntimeStores(
	compiled: CompiledStudioRuntime | null,
	exportStore: ExportStoreApi,
	themeStore: ThemeStoreApi,
	localeStore: LocaleStoreApi,
	// Controlled-locale mounts skip the seed-once path entirely — the
	// write-through effect owns the store, and the config locale must win
	// over (bypassed) persistence rather than defer to it.
	localeControlled: boolean,
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

		// Same shape for locale (uncontrolled mounts only): `"en"` is the
		// store default, so seed a non-`"en"` config locale — today that can
		// only come from env, `ANVILKIT_I18N__LOCALE`, since an explicit
		// host `config.i18n.locale` makes the mount controlled — only when
		// the user has no persisted choice. Never clobbers a persisted
		// `setLocale`. (P3 handoff.)
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
		if (!localeControlled) {
			seedWhenHydrated(localeStore.persist, applyDefaultLocale);
		}

		return () => {
			for (const unsubscribe of unsubscribers) {
				unsubscribe();
			}
		};
	}, [compiled, exportStore, themeStore, localeStore, localeControlled]);
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
 * {@link useGetPuck}, stores the snapshot on the shared ref, and — when
 * a compiled runtime is mounted — drives the engine to `ready`. JSX-free
 * (`createElement`) so this module stays a `.ts` orchestration file.
 */
function PuckApiBinder({
	apiRef,
	compiled,
	children,
}: {
	readonly apiRef: RefObject<GetPuckSnapshot | null>;
	readonly compiled: CompiledStudioRuntime | null;
	readonly children?: ReactNode;
}): ReactElement {
	const getPuck = useGetPuck();
	useEffect(() => {
		apiRef.current = getPuck;
		// Drive `ready` for this exact (runtime, getPuck) pair, strictly
		// after the binding above so `getPuckApi()` is safe for `onReady`
		// hooks. The deps array IS the once-per-pair dedupe the shell used
		// to hand-track with a `readyDrivenRef`: the effect re-runs only
		// when Puck re-initializes (new `getPuck`) or a new compile lands
		// (new `compiled`), and the engine's `advanceTo` is idempotent per
		// runtime — a repeat call (StrictMode remount) or a `ready` racing
		// ahead of `init` is absorbed there (see lifecycle-manager.ts).
		if (compiled !== null) {
			compiled.runtime.lifecycle.advanceTo("ready", compiled.ctx);
		}
		return () => {
			// Clear the shared ref when this Puck tree unmounts so a
			// disposed/unmounted editor can't keep serving its API to a
			// later compile's plugins via `getPuckApi()` (P1: stale API
			// ref survives teardown). Guard on identity: a newer binder may
			// have already rebound `apiRef` to its own `getPuck`, and this
			// stale cleanup must not clobber the live one.
			if (apiRef.current === getPuck) {
				apiRef.current = null;
			}
		};
	}, [apiRef, getPuck, compiled]);
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
		onPublishClick,
		onAction,
		onSaveDraft,
		analytics,
		aiHost,
		chrome = DEFAULT_CHROME_MODE,
		data,
		storeId,
		logger,
		messages,
		onLocaleChange,
		onError,
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

	// Latest `plugins`/`config` behind refs (same rationale as `loggerRef`
	// below): the compile effect re-runs only when `compileKey` changes —
	// the structural fingerprints inside the key stand in for these raw
	// references — and reads the live values at run time, so an inline
	// `plugins={[…]}` or `config={{…}}` (new identity, same content every
	// render) neither recompiles the plugin set nor goes stale.
	const pluginsRef = useRef(plugins);
	const configRef = useRef(config);
	useLayoutEffect(() => {
		pluginsRef.current = plugins;
		configRef.current = config;
	}, [plugins, config]);

	const puckApiRef = useRef<GetPuckSnapshot | null>(null);

	// Compile-generation guard (A1 unified the refs; A2 moved the
	// onInit/onReady bookkeeping into the engine phase machine).
	const identityRef = useRef<RuntimeIdentity>({ generation: 0 });

	// Per-instance config fingerprinter (review finding RX-2): the
	// dev-only "config is not referentially stable across renders"
	// warning is now closure-scoped, so two `<Studio>` mounts can no
	// longer trip each other's one-shot warning.
	const fingerprintConfigRef = useRef<
		ReturnType<typeof createConfigFingerprinter>
	>(null!);
	if (!fingerprintConfigRef.current) {
		fingerprintConfigRef.current = createConfigFingerprinter();
	}

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

	// Latest `onLocaleChange` behind a ref (same rationale as `loggerRef`):
	// the locale store's `requestLocale` reads it at call time, so an inline
	// handler never re-creates the store or recompiles anything. Created
	// before the store bundle so the cell can be handed to the factory.
	const onLocaleChangeRef = useRef<((locale: string) => void) | undefined>(
		onLocaleChange,
	);

	// Latest `onError` behind a ref (same rationale as `loggerRef`): the
	// compile-failure path reads it at call time, so an inline handler
	// never triggers a recompile.
	const onErrorRef = useRef<((error: unknown) => void) | undefined>(onError);

	// Controlled-locale latch (config-centric i18n §4.2): an explicit host
	// `config.i18n.locale` on the RAW prop — never the compiled config,
	// whose schema default `"en"` / env-resolved values must not flip
	// hosts into controlled mode — at FIRST render decides the mode for
	// the lifetime of the mount, mirroring the frozen-`storeId` rule.
	// Remount with a new React `key` to switch modes.
	const [latchedConfigLocale] = useState<string | undefined>(
		() => config?.i18n?.locale,
	);
	const isLocaleControlled = latchedConfigLocale !== undefined;

	// Single-flight publish chain: serialize overlapping publishes so
	// the onBeforePublish → onPublish → onAfterPublish chains never
	// interleave. The tail promise is replaced on every call; each
	// queued task awaits the previous tail.
	const publishQueueRef = useRef<Promise<void>>(RESOLVED_PUBLISH_TAIL);
	// Flipped by the teardown effect's cleanup. A slow consumer
	// onPublish can resolve after dispose(); this lets the queued
	// continuation skip a post-dispose onAfterPublish emit against a
	// disposed runtime / reset stores.
	const disposedRef = useRef(false);

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
		createEditorStore({
			storeId: resolvedStoreId,
			locale: {
				controlled: isLocaleControlled,
				initialLocale: latchedConfigLocale,
				onLocaleRequestRef: onLocaleChangeRef,
			},
		}),
	);
	const themeStore = editorStore.theme;
	const exportStore = editorStore.export;
	const aiStore = editorStore.ai;
	const localeStore = editorStore.locale;

	// Live `i18n` block for `ctx.t` (config-centric i18n §4.6): the ctx
	// object is frozen per compile, but `ctx.t` must answer in the active
	// language after a recompile-free `config.i18n.*` change. Kept current
	// with the live overlay by a layout effect below; `ctx.t` falls back to
	// its compile-time snapshot while this is still `null` (first compile
	// in flight / register-time calls).
	const liveI18nRef = useRef<StudioConfig["i18n"] | null>(null);

	// One stored value, tagged with the `compileKey` that produced it.
	// `setCompiled(null)` on every input change is replaced by deriving
	// `activeCompiled` below: a stored runtime whose key is stale reads as
	// absent, so the editor fails closed and the teardown effect disposes
	// it — without an effect resetting state on a prop change.
	const [stored, setStored] = useState<StoredRuntime | null>(null);
	// Surfaces a plugin-compile failure to the view (P1). `null` while a
	// compile is in flight or succeeded; set to the thrown value when
	// `compilePlugins` rejects, and reset on the next compile attempt so a
	// recompile/retry clears the prior error.
	const [compileError, setCompileError] = useState<unknown>(null);
	// Bumped by `retry()` to force a fresh compile with the SAME inputs
	// (a failed compile leaves `compileKey` unchanged, so without this a
	// Retry action would have nothing to re-trigger). Folded into
	// `compileKey` below.
	const [retryNonce, setRetryNonce] = useState(0);
	const retry = useCallback(() => {
		setRetryNonce((n) => n + 1);
	}, []);

	const pluginsFingerprint = useMemo(
		// generic→default boundary: structural hash only; variance-safe.
		() =>
			fingerprintPlugins(
				plugins as readonly (StudioPlugin | PuckPlugin)[] | undefined,
			),
		[plugins],
	);
	// Fingerprint a projection with the reactive `i18n` block REMOVED
	// (config-centric i18n §4.1): `config.i18n.*` changes update the live
	// overlay below instead of recompiling the plugin set. Memoized on
	// `[config]` so the identity-fallback path for non-JSON configs keeps
	// the host's reference-stability semantics unchanged. If a compile-path
	// consumer of `config.i18n` is ever added, widen `stripReactiveConfig`
	// accordingly — the "i18n-only change ⇒ no recompile" RTL test is the
	// tripwire.
	const configForFingerprint = useMemo(
		() => stripReactiveConfig(config),
		[config],
	);
	const configFingerprint = useMemo(
		() => fingerprintConfigRef.current(configForFingerprint),
		[configForFingerprint],
	);

	// Identity token recomputed only when an input that requires a full
	// recompile changes. It drives the compile effect's single dependency
	// and is stored alongside the runtime, so the derived `activeCompiled`
	// can mask a runtime built for a now-superseded key.
	const compileKey = useMemo(
		() => ({
			pluginsFingerprint,
			aiHost,
			configFingerprint,
			isAnvilkit,
			retryNonce,
		}),
		[pluginsFingerprint, aiHost, configFingerprint, isAnvilkit, retryNonce],
	);

	useEffect(() => {
		// `compileKey` is the single compile trigger; `aiHost` and the
		// chrome flag are read back off the key (shadowing the render-scope
		// bindings) so they cannot drift from what the key encodes, and the
		// raw `plugins`/`config` come through the refs above. `logger` is
		// read through `loggerRef` so an unstable inline logger does not
		// trigger a full plugin recompile.
		const { aiHost, isAnvilkit } = compileKey;
		// New compile generation. The prior runtime is *not* reset to
		// `null` here: once `compileKey` changes, the derived
		// `activeCompiled` masks it (fail-closed render) and the
		// `[activeCompiled]` teardown effect disposes it. This effect owns
		// only the async compile and its stale-generation guard.
		identityRef.current.generation += 1;
		const myGen = identityRef.current.generation;
		const isStale = (): boolean => myGen !== identityRef.current.generation;
		// A fresh compile attempt clears any prior failure (also how a retry
		// recovers). No-op re-render when already `null` (React bails out).
		setCompileError(null);
		// generic→default boundary: the runtime is non-generic.
		const basePlugins = (pluginsRef.current ?? []) as readonly (
			| StudioPlugin
			| PuckPlugin
		)[];

		// The per-compile event bus backing `ctx.emit`/`ctx.on`. Created
		// synchronously here — not inside the async `setup` (which awaits
		// dynamic imports first) — so this effect's cleanup always holds the
		// handle and is the SINGLE owner of its end-of-life: the cleanup
		// `close()`s it unconditionally on unmount/recompile (covering even a
		// hanging async `register` that never settles), and `close()` seals
		// the bus so a `ctx` that resumes after teardown can neither emit nor
		// subscribe. The catch below also `close()`s on a reject that leaves
		// the component mounted (where this cleanup would not run).
		const eventBus = createEventBus({
			log: (level, message, meta) =>
				writeStudioLog(loggerRef.current, level, message, meta),
		});

		async function setup(): Promise<void> {
			const { createStudioConfig } = await import("@/config/create-config");
			if (isStale()) {
				return;
			}
			const studioConfig = createStudioConfig(configRef.current);

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
			// per-instance sidebar registry proxies. The per-compile
			// `eventBus` (created in the effect body above) is injected so
			// `ctx.emit`/`ctx.on` share one channel across plugins and the
			// effect cleanup can clear it on teardown.
			const ctx = createShellPluginContext({
				dataRef,
				puckApiRef,
				studioConfig,
				sidebarRegistryStore,
				loggerRef,
				localeStore,
				liveI18nRef,
				eventBus,
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
					// The bus is closed by this run's effect cleanup (which
					// already ran — that's why the compile is stale), so no
					// explicit close is needed here.
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
				// Compilation failed. If the component stays mounted (same
				// `compileKey`), this effect's cleanup will NOT run, so close
				// the abandoned bus here — dropping any subscriptions an
				// earlier plugin made before the throw and sealing it so a
				// retained ctx can't deliver to a half-built, discarded set.
				eventBus.close();
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
				// Surface the failure to the view (drives `errorFallback` /
				// the built-in error screen) and notify the host. Read the
				// handler through the ref so an inline `onError` never forces
				// a recompile.
				setCompileError(error);
				onErrorRef.current?.(error);
			}
		}

		void setup();
		return () => {
			identityRef.current.generation += 1;
			// Single owner of the per-compile bus's end-of-life: close it
			// unconditionally on every unmount/recompile. This covers a
			// compile abandoned while still pending (a hanging async
			// `register`), a stored runtime being torn down, and the
			// commit-window where `setStored` was enqueued but never
			// committed — all without depending on a separate effect. `close`
			// also seals the bus, so a `ctx` that resumes later is inert.
			// (Trade-off: an `onDestroy` hook that emits is not delivered —
			// the bus is sealed with the runtime; no plugin relies on that.)
			eventBus.close();
		};
	}, [compileKey, localeStore, sidebarRegistryStore]);

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

	// ── Reactive `config.i18n` (config-centric i18n §4.1) ────────────────
	// The block is excluded from `configFingerprint`, so its changes reach
	// the editor through two recompile-free channels instead: the locale
	// write-through (controlled mounts) and the `liveStudioConfig` overlay
	// (every React reader via `StudioConfigProvider`).
	const rawConfigLocale = config?.i18n?.locale;

	// Controlled write-through: the prop is authoritative. The equality
	// guard breaks host feedback loops (onLocaleChange → router → rerender
	// with the same locale ⇒ no write, no churn).
	useEffect(() => {
		if (!isLocaleControlled || rawConfigLocale === undefined) {
			return;
		}
		const state = localeStore.getState();
		if (state.locale !== rawConfigLocale) {
			state.setLocale(rawConfigLocale);
		}
	}, [isLocaleControlled, rawConfigLocale, localeStore]);

	// Mode-flip detector: adding/removing `config.i18n.locale` after mount
	// is ignored (controlled-ness is latched, like `storeId`) — warn once
	// so the no-op is discoverable.
	const localeModeFlipWarnedRef = useRef(false);
	useEffect(() => {
		if (localeModeFlipWarnedRef.current) {
			return;
		}
		if ((rawConfigLocale !== undefined) !== isLocaleControlled) {
			localeModeFlipWarnedRef.current = true;
			writeStudioLog(
				loggerRef.current,
				"warn",
				`config.i18n.locale was ${
					isLocaleControlled ? "removed" : "added"
				} after mount; locale controlled-ness is latched at first render and this change is ignored. Remount <Studio> with a new React key to switch modes.`,
				undefined,
			);
		}
	}, [rawConfigLocale, isLocaleControlled]);

	// One-shot deprecation warning for the legacy flat `messages` prop.
	const messagesDeprecationWarnedRef = useRef(false);
	useEffect(() => {
		if (messagesDeprecationWarnedRef.current || messages === undefined) {
			return;
		}
		messagesDeprecationWarnedRef.current = true;
		writeStudioLog(
			loggerRef.current,
			"warn",
			"<Studio messages> is deprecated: use config.i18n.messages (a per-locale `locale → (messageKey → string)` map) instead. The flat prop applies to every locale, still wins over config.i18n.messages during the migration window, and will be removed in 0.2.0.",
			undefined,
		);
	}, [messages]);

	// JSON-stable memo of the raw `i18n` slice so an inline `config`
	// literal (new identity, same content every render) doesn't churn the
	// live overlay / config context.
	const rawI18n = config?.i18n;
	const rawI18nKey = useMemo(() => {
		if (rawI18n === undefined) {
			return "";
		}
		try {
			return JSON.stringify(rawI18n) ?? "";
		} catch {
			// Non-JSON content (bigint/circular) — key on best effort; the
			// fallback constant means such configs only update the overlay
			// alongside a structural `config` change.
			return "<non-json>";
		}
	}, [rawI18n]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: deliberately keyed on the JSON projection (`rawI18nKey`), not the raw reference — see the memo note above.
	const stableRawI18n = useMemo(() => rawI18n, [rawI18nKey]);

	// The config React readers see: the compiled (validated) snapshot with
	// the latest raw `i18n` overlaid. `ctx`/compile internals keep the
	// frozen `activeCompiled.studioConfig`.
	const liveStudioConfig = useMemo<StudioConfig | null>(() => {
		if (activeCompiled === null) {
			return null;
		}
		if (stableRawI18n === undefined) {
			return activeCompiled.studioConfig;
		}
		return {
			...activeCompiled.studioConfig,
			i18n: mergeLiveI18n(activeCompiled.studioConfig.i18n, stableRawI18n),
		};
	}, [activeCompiled, stableRawI18n]);

	// Keep `ctx.t`'s live view current (layout-timed so plugin lifecycle
	// hooks firing in effects this same pass read the fresh block).
	useLayoutEffect(() => {
		liveI18nRef.current = liveStudioConfig?.i18n ?? null;
	}, [liveStudioConfig]);

	// Inert-switcher footgun: a controlled mount showing the built-in
	// switcher without an `onLocaleChange` handler renders a dropdown
	// whose selections visibly do nothing. Warn once.
	const inertSwitcherWarnedRef = useRef(false);
	useEffect(() => {
		if (inertSwitcherWarnedRef.current) {
			return;
		}
		if (
			isLocaleControlled &&
			onLocaleChange === undefined &&
			liveStudioConfig?.i18n.showLocaleSwitch === true
		) {
			inertSwitcherWarnedRef.current = true;
			writeStudioLog(
				loggerRef.current,
				"warn",
				"config.i18n.showLocaleSwitch is on and config.i18n.locale is host-controlled, but no onLocaleChange handler is set — the built-in LanguageSwitcher will appear inert. Pass onLocaleChange and re-render with the new config.i18n.locale to apply switches.",
				undefined,
			);
		}
	}, [isLocaleControlled, onLocaleChange, liveStudioConfig]);

	useHydrateRuntimeStores(
		activeCompiled,
		exportStore,
		themeStore,
		localeStore,
		isLocaleControlled,
	);

	useRuntimeInit(activeCompiled);

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
			// Drop the bound Puck API before emitting `onDestroy`/disposing
			// so a plugin's teardown hook (or a later compile's plugins)
			// can't read the API of this now-unmounted runtime via
			// `getPuckApi()` (P1: stale API ref survives teardown). The
			// next compile's `PuckApiBinder` rebinds the ref on mount.
			puckApiRef.current = null;
			// `onDestroy` stays a shell-emitted event so it closes over
			// the exact runtime/ctx pair that fired `onInit`; the phase
			// marker keeps a late `onInit`-settle `.then` from firing a
			// post-teardown `onReady`.
			runtime.lifecycle.advanceTo("destroyed", ctx);
			void runtime.lifecycle.emit("onDestroy", ctx);
			runtime.lifecycle.dispose();
			exportStore.getState().reset();
			aiStore.getState().reset();
			// Theme persists across sessions — survives teardown. The
			// per-compile event bus is closed by the compile effect's
			// cleanup (the single owner), not here.
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
		// clobbering) any consumer `puck` override. The binder itself
		// drives the engine to `ready` once `getPuckApi()` is safe (A2:
		// the phase machine owns the "after onInit settles" ordering the
		// shell used to hand-orchestrate with `readyFiredFor` +
		// `queueMicrotask` + `onInitPromise`).
		base.push({
			puck: ({ children }) =>
				createElement(
					PuckApiBinder,
					{ apiRef: puckApiRef, compiled: activeCompiled },
					children,
				),
		});
		return mergeOverrides(base);
	}, [activeCompiled, consumerOverrides, isAnvilkit, activeChromeAssets]);

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
	// The AnvilKit chrome's `PublishPanel` calls `onPublishClick` (not Puck's
	// native `onPublish`), so the controller wraps it through the SAME
	// `runPublishPipeline` below — otherwise a chrome publish would skip
	// `page_published`. Held behind a ref so the wrapped handler stays stable.
	const onPublishClickRef = useRef<((data: PuckData) => void) | undefined>(
		onPublishClick as ((data: PuckData) => void) | undefined,
	);
	// F9 analytics: latest adapter + host onAction/onSaveDraft behind refs so
	// the wrapped handlers stay stable while always reading the newest values.
	const analyticsRef = useRef<StudioAnalyticsPort | undefined>(analytics);
	const onActionRef = useRef<PuckOnAction | undefined>(
		onAction as PuckOnAction | undefined,
	);
	const onSaveDraftRef = useRef<(() => void | Promise<void>) | undefined>(
		onSaveDraft,
	);
	useLayoutEffect(() => {
		onChangeRef.current = onChange as DefaultOnChange | undefined;
		onPublishRef.current = onPublish as DefaultOnPublish | undefined;
		onPublishClickRef.current = onPublishClick as
			| ((data: PuckData) => void)
			| undefined;
		analyticsRef.current = analytics;
		onActionRef.current = onAction as PuckOnAction | undefined;
		onSaveDraftRef.current = onSaveDraft;
		loggerRef.current = logger;
		onLocaleChangeRef.current = onLocaleChange;
		onErrorRef.current = onError;
	}, [
		onChange,
		onPublish,
		onPublishClick,
		analytics,
		onAction,
		onSaveDraft,
		logger,
		onLocaleChange,
		onError,
	]);

	const handleChange = useCallback(
		(nextData: PuckData): void => {
			// F9: emit `seo_updated` when a `root.props.seo` field changes
			// (the PageSeoPlugin dispatches its edits through this seam).
			// Diff against the previous document BEFORE overwriting the ref;
			// the emitter forwards only the changed field names.
			trackSeoUpdated(analyticsRef.current, dataRef.current, nextData);
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

	// Shared single-flight publish runner. Both the native Puck `onPublish`
	// path and the AnvilKit chrome's `PublishPanel` (`onPublishClick`) call
	// this with their own consumer fn, so `page_published` is owned in ONE
	// place and emitted exactly once per publish, on success only. The queue
	// tail serializes overlapping publishes so the onBefore → consumer →
	// onAfter chains never interleave; the per-publish sequence itself lives
	// in the pure `runPublishPipeline` (unit-tested without a `<Studio>` mount).
	const runPublishTask = useCallback(
		(
			nextData: PuckData,
			consumerPublish: ((data: PuckData) => void | Promise<void>) | undefined,
		): void => {
			// Capture the runtime + compile generation synchronously, at call
			// time, before any await — the plugin lifecycle emits are
			// runtime-bound and must skip a runtime disposed/superseded while
			// this publish sat in the queue.
			const runtimeAtCall = activeCompiled;
			const myGen = identityRef.current.generation;
			const isRuntimeLive = (): boolean =>
				!disposedRef.current &&
				identityRef.current.generation === myGen &&
				runtimeAtCall !== null;

			// `.catch` keeps the chain alive — one failed publish must not poison
			// the next. The args object is built INSIDE the `.then` so the latest
			// `analyticsRef`/`loggerRef` are read at execution time, not enqueue.
			const task = publishQueueRef.current.then(() =>
				runPublishPipeline(nextData, {
					isRuntimeLive,
					consumerPublish,
					analytics: analyticsRef.current,
					log: (level, message, meta) =>
						writeStudioLog(loggerRef.current, level, message, meta),
					emitBeforePublish:
						runtimeAtCall === null
							? undefined
							: () =>
									runtimeAtCall.runtime.lifecycle.emit(
										"onBeforePublish",
										runtimeAtCall.ctx,
										nextData,
									),
					emitAfterPublish:
						runtimeAtCall === null
							? undefined
							: () =>
									runtimeAtCall.runtime.lifecycle.emit(
										"onAfterPublish",
										runtimeAtCall.ctx,
										nextData,
									),
				}),
			);
			publishQueueRef.current = task.catch(() => {
				// Swallowed: a failed publish must not poison the queue.
			});
		},
		[activeCompiled],
	);

	// Native Puck `onPublish` → shared runner with the host's `onPublish`.
	const handlePublish = useCallback(
		(nextData: PuckData): void => {
			runPublishTask(nextData, onPublishRef.current);
		},
		[runPublishTask],
	);

	// Chrome `PublishPanel` "Publish to live" → shared runner with the host's
	// `onPublishClick`. Exposed as `undefined` when the host wired no
	// `onPublishClick`, so the panel's button stays disabled exactly as before
	// (it gates on `onPublishClick === undefined`).
	const hasPublishClick = onPublishClick !== undefined;
	const handlePublishClick = useMemo<
		((data: PuckData) => void) | undefined
	>(() => {
		if (!hasPublishClick) return undefined;
		return (nextData: PuckData): void => {
			runPublishTask(nextData, onPublishClickRef.current);
		};
	}, [hasPublishClick, runPublishTask]);

	// F9: wrap Puck `onAction` to emit `component_dropped` on insert, then
	// forward to the host's handler. Stable identity (reads refs).
	const handleAction = useCallback<PuckOnAction>((action, appState, prev) => {
		trackComponentDropped(analyticsRef.current, action);
		onActionRef.current?.(action, appState, prev);
	}, []);

	// F9: wrap the host save-draft handler to emit `draft_saved` (with a real
	// duration) once it resolves. `undefined` when the host has no save handler
	// so the chrome's save affordance stays hidden.
	const hasSaveDraft = onSaveDraft !== undefined;
	const handleSaveDraft = useMemo<(() => Promise<void>) | undefined>(() => {
		if (!hasSaveDraft) return undefined;
		return async (): Promise<void> => {
			const start = Date.now();
			try {
				await onSaveDraftRef.current?.();
			} finally {
				trackDraftSaved(
					analyticsRef.current,
					dataRef.current?.content?.length ?? 0,
					Date.now() - start,
				);
			}
		};
	}, [hasSaveDraft]);

	return {
		isAnvilkit,
		compiled: activeCompiled,
		compileError,
		retry,
		liveStudioConfig,
		chromeAssets: activeChromeAssets,
		mergedOverrides,
		handleChange,
		handlePublish,
		handlePublishClick,
		handleAction,
		handleSaveDraft,
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
