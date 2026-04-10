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
 */
export function createLifecycleManager(
	registrations: readonly StudioPluginRegistration[],
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

	async function emit(
		event: LifecycleEventName,
		ctx: StudioPluginContext,
		payload?: PuckData,
	): Promise<void> {
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
					// so the host always sees a typed runtime error.
					throw new StudioPluginError(
						registration.meta.id,
						`Plugin "${registration.meta.id}" threw during onBeforePublish`,
						{ cause: error },
					);
				}
			}
			fireSubscribers(event, ctx, payload);
			return;
		}

		// Every other event: run in parallel and log-then-swallow any
		// rejections.
		const settled = await Promise.allSettled(
			registrations.map((registration) =>
				invokeHook(event, registration, ctx, payload),
			),
		);

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

	function subscribe(
		event: LifecycleEventName,
		handler: LifecycleSubscriber,
	): () => void {
		subscribers[event].add(handler);
		return () => {
			subscribers[event].delete(handler);
		};
	}

	return { emit, subscribe };
}
