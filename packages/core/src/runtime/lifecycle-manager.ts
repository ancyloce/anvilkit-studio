/**
 * @file The Studio plugin lifecycle event dispatcher.
 *
 * `createLifecycleManager()` takes the aggregated
 * {@link StudioPluginRegistration} array produced by
 * `compilePlugins()` and returns a small event object with two
 * methods:
 *
 * - `emit(event, ctx, payload?)` — invokes every plugin's hook for
 *   the named event in plugin registration order, then fires all
 *   in-process observers registered via `subscribe()`.
 * - `subscribe(event, handler)` — registers an observer for a
 *   single event and returns an unsubscribe function.
 *
 * ### Error semantics
 *
 * - `onBeforePublish` runs **sequentially**. The first hook to throw
 *   aborts the remaining plugins and rethrows from `emit()` — this
 *   is how a validation plugin cancels a publish. All other
 *   `StudioPluginError`-derived errors are caught and rethrown
 *   verbatim so host apps see the original plugin id.
 * - Every other event (`onInit`, `onDataChange`, `onAfterPublish`,
 *   `onDestroy`) runs **in parallel** via `Promise.allSettled`. Any
 *   rejected hook is routed through `ctx.log("error", …)` but does
 *   not abort the other hooks — per the architecture §17 rule that
 *   a buggy plugin must not crash the editor.
 *
 * ### Subscribers
 *
 * The subscribe/unsubscribe API exists primarily for tests and
 * in-process observers (dev tooling, telemetry). Subscriber errors
 * are caught and ignored — a crashing observer must not corrupt
 * plugin state. Subscribers fire **after** the plugin hooks have
 * settled for that event, so tests can assert final state safely.
 *
 * ### `onDataChange` debouncing — test vs. production contract
 *
 * `createLifecycleManager(registrations)` defaults to **no debounce**
 * (`onDataChangeDebounceMs: 0`) so unit tests that drive `emit(...)`
 * directly observe hooks firing synchronously after each call. The
 * `<Studio>` shell opts in at 250 ms via
 * {@link CompilePluginsOptions} so keystroke-rate `onChange` events
 * coalesce before they reach autosave / telemetry plugins.
 *
 * The consequence for plugin authors: a hook observed firing 20×
 * during a unit test may only fire once in production behind
 * `<Studio>`. Tests that pin per-keystroke counts should either pass
 * the same debounce option the shell uses or add their own quiet
 * period before asserting.
 *
 * ### Zero React, zero Puck
 *
 * The payload type for data-bearing events is a bare `PuckData`
 * imported via `import type`, so this file still ships as pure JS
 * with no runtime dependency on `@puckeditor/core`.
 *
 * @see {@link https://github.com/anvilkit/studio/blob/main/docs/tasks/core-008-runtime-plugin-engine.md | core-008}
 */

import type { Data as PuckData } from "@puckeditor/core";

import type {
	StudioPluginContext,
	StudioPluginLifecycleHooks,
	StudioPluginRegistration,
} from "../types/plugin.js";
import { StudioPluginError } from "./errors.js";

/**
 * Best-effort `.message` extraction. Used when wrapping an unknown
 * rejection so the wrapper's `message` still carries a readable root
 * cause for log pipelines that only render `err.message`.
 */
function extractErrorMessage(error: unknown): string {
	if (error instanceof Error && typeof error.message === "string") {
		return error.message;
	}
	if (typeof error === "string") {
		return error;
	}
	try {
		return String(error);
	} catch {
		return "<unserializable error>";
	}
}

/**
 * The closed union of lifecycle event names the runtime fires.
 *
 * Mirrors the optional keys on {@link StudioPluginLifecycleHooks}
 * one-for-one, so adding a new hook there is a compile-time forcing
 * function to update this union (and the `emit` dispatch table).
 */
export type LifecycleEventName =
	| "onInit"
	| "onDataChange"
	| "onBeforePublish"
	| "onAfterPublish"
	| "onDestroy";

/**
 * Handler signature registered via {@link LifecycleManager.subscribe}.
 *
 * Receives the same `ctx` and `payload` the plugin hooks receive so
 * observers can inspect the live state of the running session.
 */
export type LifecycleSubscriber = (
	ctx: StudioPluginContext,
	payload: PuckData | undefined,
) => void;

/**
 * The public shape returned by {@link createLifecycleManager}.
 */
export interface LifecycleManager {
	/**
	 * Fire the named lifecycle event through every registered plugin
	 * and every live subscriber.
	 *
	 * Resolves once every plugin hook has settled (sequentially for
	 * `onBeforePublish`, in parallel otherwise) and all subscribers
	 * have been invoked. Rethrows the first {@link StudioPluginError}
	 * caught during `onBeforePublish` and swallows everything else
	 * through `ctx.log("error", …)`.
	 */
	readonly emit: (
		event: LifecycleEventName,
		ctx: StudioPluginContext,
		payload?: PuckData,
	) => Promise<void>;

	/**
	 * Register an observer for a single event.
	 *
	 * @returns An unsubscribe function. Calling it is idempotent and
	 * detaches the handler immediately.
	 */
	readonly subscribe: (
		event: LifecycleEventName,
		handler: LifecycleSubscriber,
	) => () => void;

	/**
	 * Release any in-flight debounce timers and forget every live
	 * subscriber so the manager can be garbage-collected cleanly.
	 *
	 * `<Studio>` calls this from the unmount cleanup that follows
	 * `onDestroy`. Without it, a pending `onDataChange` debounce
	 * timer would fire after the host dropped its reference to the
	 * runtime — running plugin hooks against a stale context whose
	 * `getPuckApi()` now throws.
	 *
	 * Safe to call multiple times; subsequent calls are no-ops.
	 */
	readonly dispose: () => void;
}

/**
 * Options accepted by {@link createLifecycleManager}.
 */
export interface LifecycleManagerOptions {
	/**
	 * Coalesce rapid `onDataChange` emits into a single hook
	 * invocation after this many milliseconds of quiet. `<Studio>`
	 * opts in with a sensible default so plugin authors don't need to
	 * debounce every `onDataChange` hook by hand — an autosave plugin
	 * posting to `/api/draft` otherwise floods the backend on every
	 * keystroke.
	 *
	 * - `0` (or omitted) → preserves pre-debounce behavior: every
	 *   emit synchronously schedules hook invocation.
	 * - `> 0` → only the most recent emit within a sliding window
	 *   fires; earlier payloads are dropped. Subscribers observe the
	 *   same debounced fire, so in-process observers stay consistent
	 *   with the plugin hooks they complement.
	 *
	 * The debounce covers `onDataChange` only. Every other event
	 * fires synchronously because they carry veto (`onBeforePublish`)
	 * or one-shot (`onInit` / `onDestroy` / `onAfterPublish`)
	 * semantics where coalescing would be wrong.
	 */
	readonly onDataChangeDebounceMs?: number;
}

/**
 * Create a lifecycle manager bound to a frozen array of plugin
 * registrations.
 *
 * The registrations are snapshotted at construction time — adding
 * or removing plugins at runtime would require rebuilding the
 * manager, which mirrors Puck's mount-time plugin array semantics.
 *
 * @param registrations - The aggregated registrations returned by
 * each plugin's `register()` method, in plugin declaration order.
 * @param options - Optional {@link LifecycleManagerOptions}; see the
 * field docs for semantics.
 */
export function createLifecycleManager(
	registrations: readonly StudioPluginRegistration[],
	options: LifecycleManagerOptions = {},
): LifecycleManager {
	// Subscribers bucketed by event name. A fresh `Set` per event
	// makes unsubscribe O(1) and avoids iteration-order footguns when
	// a handler detaches itself mid-broadcast.
	const subscribers: Record<LifecycleEventName, Set<LifecycleSubscriber>> = {
		onInit: new Set(),
		onDataChange: new Set(),
		onBeforePublish: new Set(),
		onAfterPublish: new Set(),
		onDestroy: new Set(),
	};
	let disposed = false;

	/**
	 * Resolve the hook function a given registration contributes for
	 * the named event, or `undefined` if the plugin did not opt in.
	 *
	 * Typed narrowly so the callers see the exact hook signature
	 * instead of a union of every possible hook.
	 */
	function getHook(
		registration: StudioPluginRegistration,
		event: LifecycleEventName,
	): StudioPluginLifecycleHooks[LifecycleEventName] | undefined {
		return registration.hooks?.[event];
	}

	/**
	 * Invoke a single plugin hook, normalizing its signature so both
	 * no-payload events (`onInit`, `onDestroy`) and data-bearing
	 * events (`onDataChange`, `onBeforePublish`, `onAfterPublish`)
	 * go through the same call site.
	 *
	 * Always returns a promise so callers can uniformly `await` or
	 * feed into `Promise.allSettled`.
	 */
	function invokeHook(
		event: LifecycleEventName,
		registration: StudioPluginRegistration,
		ctx: StudioPluginContext,
		payload: PuckData | undefined,
	): Promise<void> {
		const hook = getHook(registration, event);
		if (!hook) {
			return Promise.resolve();
		}

		// Cast through `unknown` — the union of hook signatures is
		// mutually exclusive on payload arity and TypeScript cannot
		// prove the dispatch table matches at this level of
		// indirection. The runtime invariant is enforced by the
		// `LifecycleEventName` union.
		const run = hook as (
			ctx: StudioPluginContext,
			payload?: PuckData,
		) => void | Promise<void>;

		try {
			return Promise.resolve(run(ctx, payload));
		} catch (error) {
			return Promise.reject(error);
		}
	}

	/**
	 * Parallel-emit path for `onDataChange` shared between the direct
	 * (`debounceMs === 0`) and debounced codepaths. Factored out so
	 * the debounce timer can run the same fan-out without duplicating
	 * the `Promise.allSettled` + per-reject log logic.
	 */
	async function runDataChange(
		ctx: StudioPluginContext,
		payload: PuckData | undefined,
	): Promise<void> {
		const settled = await Promise.allSettled(
			registrations.map((registration) =>
				invokeHook("onDataChange", registration, ctx, payload),
			),
		);
		if (disposed) {
			return;
		}
		for (const [index, result] of settled.entries()) {
			if (result.status === "rejected") {
				const registration = registrations[index];
				if (!registration) {
					continue;
				}
				ctx.log(
					"error",
					`Plugin "${registration.meta.id}" threw during onDataChange`,
					{ error: result.reason },
				);
			}
		}
		fireSubscribers("onDataChange", ctx, payload);
	}

	/**
	 * Fire every subscriber for an event, swallowing any handler
	 * errors. Subscribers are observers, not control-flow gates —
	 * a throwing handler must never crash the editor.
	 */
	function fireSubscribers(
		event: LifecycleEventName,
		ctx: StudioPluginContext,
		payload: PuckData | undefined,
	): void {
		for (const handler of subscribers[event]) {
			try {
				handler(ctx, payload);
			} catch (error) {
				ctx.log("error", `Lifecycle subscriber for "${event}" threw`, {
					error,
				});
			}
		}
	}

	// Debounce state for `onDataChange`. `pending.timer` is the
	// scheduled callback; `pending.ctx` and `pending.payload` hold the
	// most recent emit so the deferred fire sees the latest values.
	// Every other event bypasses this entirely.
	const debounceMs = options.onDataChangeDebounceMs ?? 0;
	let pendingDataChange: {
		timer: ReturnType<typeof setTimeout>;
		ctx: StudioPluginContext;
		payload: PuckData | undefined;
	} | null = null;

	async function emit(
		event: LifecycleEventName,
		ctx: StudioPluginContext,
		payload?: PuckData,
	): Promise<void> {
		if (disposed) {
			return;
		}

		if (event === "onDataChange" && debounceMs > 0) {
			// Coalesce rapid emits. The returned promise resolves
			// immediately — upstream callers are fire-and-forget and
			// do not await the hook settlement in the first place.
			if (pendingDataChange !== null) {
				clearTimeout(pendingDataChange.timer);
			}
			const timer = setTimeout(() => {
				if (disposed) {
					return;
				}
				const snapshot = pendingDataChange;
				pendingDataChange = null;
				if (snapshot === null) {
					return;
				}
				void runDataChange(snapshot.ctx, snapshot.payload);
			}, debounceMs);
			pendingDataChange = { timer, ctx, payload };
			return;
		}

		if (event === "onBeforePublish") {
			// Sequential — the first rejection aborts the rest so a
			// validation plugin can veto publish.
			for (const registration of registrations) {
				try {
					await invokeHook(event, registration, ctx, payload);
				} catch (error) {
					if (error instanceof StudioPluginError) {
						throw error;
					}
					// Wrap anything that is not already a StudioPluginError
					// so the host always sees a typed runtime error. Fold
					// the cause's message into the wrapper message so UIs
					// that only render `err.message` (DevTools panels,
					// Sentry, most error boundaries) still expose the root
					// reason to the user.
					throw new StudioPluginError(
						registration.meta.id,
						`Plugin "${registration.meta.id}" threw during onBeforePublish: ${extractErrorMessage(error)}`,
						{ cause: error },
					);
				}
			}
			fireSubscribers(event, ctx, payload);
			return;
		}

		if (event === "onDataChange") {
			// Direct path when debouncing is disabled — preserves the
			// pre-debounce `await emit(...)` semantics tests rely on.
			await runDataChange(ctx, payload);
			return;
		}

		// Every other event: run in parallel and log-then-swallow any
		// rejections.
		const settled = await Promise.allSettled(
			registrations.map((registration) =>
				invokeHook(event, registration, ctx, payload),
			),
		);
		if (disposed) {
			return;
		}

		for (const [index, result] of settled.entries()) {
			if (result.status === "rejected") {
				const registration = registrations[index];
				if (!registration) {
					continue;
				}
				ctx.log(
					"error",
					`Plugin "${registration.meta.id}" threw during ${event}`,
					{ error: result.reason },
				);
			}
		}

		fireSubscribers(event, ctx, payload);
	}

	function dispose(): void {
		disposed = true;
		if (pendingDataChange !== null) {
			clearTimeout(pendingDataChange.timer);
			pendingDataChange = null;
		}
		for (const event of Object.keys(subscribers) as LifecycleEventName[]) {
			subscribers[event].clear();
		}
	}

	function subscribe(
		event: LifecycleEventName,
		handler: LifecycleSubscriber,
	): () => void {
		subscribers[event].add(handler);
		return () => {
			subscribers[event].delete(handler);
		};
	}

	return { emit, subscribe, dispose };
}
