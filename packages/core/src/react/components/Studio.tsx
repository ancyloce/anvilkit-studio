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
	type Overrides as PuckOverrides,
	type Plugin as PuckPlugin,
	useGetPuck,
} from "@puckeditor/core";
import {
	type ReactElement,
	type ReactNode,
	type RefObject,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";

import { StudioConfigProvider } from "../../config/provider.js";
import {
	compilePlugins,
	type StudioRuntime,
} from "../../runtime/compile-plugins.js";
import type { StudioConfig } from "../../types/config.js";
import type { StudioPlugin, StudioPluginContext } from "../../types/plugin.js";
import { StudioRuntimeProvider } from "../hooks/use-studio.js";
import { mergeOverrides } from "../overrides/merge-overrides.js";
import { useAiStore } from "../stores/ai-store.js";
import { useExportStore } from "../stores/export-store.js";
import { useThemeStore } from "../stores/theme-store.js";

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
			// Meta is the fingerprint contract for Studio plugins:
			// `compilePlugins()` rejects duplicate `meta.id` values,
			// so plugin authors that wrap/delegate another plugin must
			// publish their own id or version bump when registration
			// behavior changes.
			parts.push(
				`studio:${escapeFingerprintSegment(String(meta.id))}@${escapeFingerprintSegment(String(meta.version))}/${escapeFingerprintSegment(String(meta.coreVersion))}`,
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
 * The default `ctx.log` passes meta straight to `console`, which in
 * dev tools is trivially copy-pasted into screenshots and bug
 * reports. This is a minimum-viable redaction; a host-provided
 * logger (planned post-alpha) will take over the real contract.
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

function redactLogMeta(meta: Record<string, unknown>): Record<string, unknown> {
	// Shallow copy is sufficient — the contract is "don't print
	// obvious secrets," not "deep-scrub arbitrary nested structures."
	// Plugins that pass deeply nested meta with secrets in leaves can
	// upgrade to a host-provided logger when that ships.
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(meta)) {
		out[key] = shouldRedactKey(key) ? "[REDACTED]" : value;
	}
	return out;
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
	"(`onDataChange`, `onBeforePublish`, `onAfterPublish`) so it runs after Puck's effect-time binder has captured the API.";

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
	children,
}: {
	readonly apiRef: RefObject<GetPuckSnapshot | null>;
	readonly children: ReactNode;
}): ReactElement {
	const getPuck = useGetPuck();
	useEffect(() => {
		// `useGetPuck` returns a stable snapshot-getter function for
		// the lifetime of the mount. Re-running on change is cheap and
		// future-proofs against Puck swapping its internal store.
		apiRef.current = getPuck;
	}, [apiRef, getPuck]);
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
	} = props;

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

	// ------------------------------------------------------------------
	// SSR-safe rehydration. The three Zustand stores are declared with
	// `skipHydration: true` so they do not synchronously read
	// `localStorage` at module evaluation — that read would fire on
	// the server (no storage) and again on the client (with storage),
	// producing a React 19 hydration mismatch for any component that
	// subscribes to a persisted field. Kicking rehydrate off in a
	// mount-time effect guarantees the first server-rendered HTML and
	// the first client render agree, and the persisted state flows in
	// on the next tick.
	// ------------------------------------------------------------------
	useEffect(() => {
		void useAiStore.persist.rehydrate();
		void useExportStore.persist.rehydrate();
		void useThemeStore.persist.rehydrate();
	}, []);

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
	const [compiled, setCompiled] = useState<{
		readonly runtime: StudioRuntime;
		readonly studioConfig: StudioConfig;
		readonly ctx: StudioPluginContext;
	} | null>(null);

	// Structural fingerprint of `plugins` + `config` so the compile
	// effect does not thrash when a parent re-render hands us a new
	// array/object reference with identical contents — the idiomatic
	// `<Studio plugins={[...]} config={{ ... }} />` pattern in Next.js
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
		let cancelled = false;
		const basePlugins = plugins ?? [];

		async function setup(): Promise<void> {
			// Dynamic import moves `createStudioConfig` (and therefore
			// all of Zod) into an async chunk. The entry bundle that
			// ships `{ Studio }` stays under the core-015 25 KB gzipped
			// budget because of this one indirection.
			const { createStudioConfig } = await import(
				"../../config/create-config.js"
			);
			if (cancelled) {
				return;
			}
			const studioConfig = createStudioConfig(config);

			let resolvedPlugins: readonly (StudioPlugin | PuckPlugin)[] = basePlugins;
			if (aiHost !== undefined) {
				// Dynamic import keeps the adapter tree-shakable: apps
				// that never pass `aiHost` do not bundle this module.
				const { aiHostAdapter } = await import(
					"../../compat/ai-host-adapter.js"
				);
				if (cancelled) {
					return;
				}
				resolvedPlugins = [aiHostAdapter({ aiHost }), ...basePlugins];
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
					// Cheap console passthrough. A host-provided logger
					// is a later feature — route every severity to its
					// matching `console` method so plugin authors can
					// still observe emit output during development.
					// Meta is redacted first so a plugin that passes an
					// auth token or user prompt through `ctx.log(...)`
					// doesn't trivially leak it into the browser console.
					const method =
						level === "error"
							? "error"
							: level === "warn"
								? "warn"
								: level === "debug"
									? "debug"
									: "info";
					console[method](
						`[studio] ${message}`,
						meta === undefined ? {} : redactLogMeta(meta),
					);
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
			};

			try {
				const runtime = await compilePlugins(resolvedPlugins, ctx, {
					lifecycle: { onDataChangeDebounceMs: DATA_CHANGE_DEBOUNCE_MS },
				});
				if (cancelled) {
					return;
				}
				setCompiled({ runtime, studioConfig, ctx });
			} catch (error) {
				if (cancelled) {
					// Suppress stale-setup logs — a later effect
					// supersedes this one and logging here would be
					// misleading.
					return;
				}
				// Compilation errors are already typed
				// `StudioPluginError` — log and leave `compiled` at
				// `null` so the editor never mounts against a broken
				// plugin set.
				console.error("[studio] plugin compilation failed", error);
			}
		}

		void setup();
		return () => {
			cancelled = true;
		};
	}, [pluginsFingerprint, aiHost, configFingerprint]);

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
	useEffect(() => {
		if (compiled === null) {
			return;
		}
		useExportStore
			.getState()
			.setAvailableFormats([...compiled.runtime.exportFormats.keys()]);

		const theme = compiled.studioConfig.theme;
		const currentMode = useThemeStore.getState().mode;
		if (currentMode === "system" && theme.defaultMode !== "system") {
			useThemeStore.getState().setMode(theme.defaultMode);
		}
	}, [compiled]);

	// ------------------------------------------------------------------
	// 4. Fire `onInit` exactly once per compiled runtime. `useEffect`'s
	//    dep array is `[compiled]`, so a remount with a new runtime
	//    re-fires this correctly.
	// ------------------------------------------------------------------
	useEffect(() => {
		if (compiled === null) {
			return;
		}
		void compiled.runtime.lifecycle.emit("onInit", compiled.ctx);
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
			useExportStore.getState().reset();
			useAiStore.getState().reset();
			// Theme is a user preference that persists across Studio
			// sessions, so it intentionally survives runtime teardown.
		};
	}, [compiled]);

	// ------------------------------------------------------------------
	// 6. Compose overrides. `mergeOverrides` threads each plugin's
	//    contribution through the previous one as `children`, so
	//    multiple plugins touching the same key all run. Consumer
	//    overrides are appended last → outermost wrapper.
	// ------------------------------------------------------------------
	const mergedOverrides = useMemo<Partial<PuckOverrides>>(() => {
		const base: Partial<PuckOverrides>[] = [];
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
				<PuckApiBinder apiRef={puckApiRef}>{children}</PuckApiBinder>
			),
		});

		return mergeOverrides(base);
	}, [compiled, consumerOverrides]);

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

	return (
		<StudioConfigProvider config={compiled.studioConfig}>
			<StudioRuntimeProvider value={compiled.runtime}>
				<Puck
					config={puckConfig}
					data={data ?? EMPTY_DATA}
					overrides={mergedOverrides}
					onChange={handleChange}
					onPublish={handlePublish}
					plugins={[...compiled.runtime.puckPlugins]}
				/>
			</StudioRuntimeProvider>
		</StudioConfigProvider>
	);
}
