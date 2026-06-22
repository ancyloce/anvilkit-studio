/**
 * @file `createEventBus` — the in-process plugin-to-plugin event bus that
 * backs {@link StudioPluginContext.emit} / {@link StudioPluginContext.on}
 * (architecture §8.5; report 0002 finding P1).
 *
 * One bus is created per `<Studio>` compile pass and shared by every
 * plugin's context, so an event a plugin `emit`s reaches the handlers
 * other plugins (or the same plugin) registered with `on`. The bus is
 * **synchronous** and delivers to handlers in **registration order**.
 *
 * Design notes (the §8.5 contract this module satisfies):
 *
 * - **No replay / no buffering.** An `emit` reaches only the handlers
 *   subscribed at the moment it fires — a handler registered *after* an
 *   event was emitted never sees that past event.
 * - **One delivery per subscription.** Each `on` call is an independent
 *   subscription with its own unsubscribe handle, mirroring Node's
 *   `EventEmitter`: subscribing the same function twice delivers to it
 *   twice, and one unsubscribe never cancels another subscription —
 *   even when two call sites pass the same handler reference.
 * - **Stable dispatch.** Each `emit` iterates a snapshot of the
 *   subscription list taken before the first handler runs, so a handler
 *   that subscribes or unsubscribes mid-dispatch does not change who
 *   receives the *current* event (a new subscription waits for the next
 *   `emit`; an already-snapshotted one still runs).
 * - **Failure isolation.** A throwing handler is caught and reported,
 *   then the remaining handlers still run. Reporting routes through the
 *   injected {@link EventBusLog} sink (raw `{ error, event }` so the
 *   logger keeps the Error's `name`/`message`/`stack`); without a sink
 *   it falls back to `console.error` — never a silent swallow. The
 *   report itself is guarded so a throwing sink cannot abort dispatch.
 *
 * React-free and environment-agnostic on purpose — it lives in
 * `src/runtime/` and is consumed by the React shell, never the reverse.
 * Kept internal (not exported from the `@anvilkit/core/runtime` barrel):
 * the only public surface is `ctx.emit` / `ctx.on`.
 */

import type { StudioLogLevel } from "@/types/log";

/**
 * A subscriber callback. The payload is `unknown` by contract — event
 * names are free-form and Core does not enforce a schema, so handlers
 * validate the payload themselves (architecture §8.5).
 */
export type EventBusHandler = (payload: unknown) => void;

/**
 * Handle returned by {@link EventBus.on}. Calling it removes the one
 * subscription it came from. Idempotent and scoped to that subscription:
 * calling it twice is a no-op, and it never removes any other
 * subscription — including a later one made with the same handler.
 */
export type EventBusUnsubscribe = () => void;

/**
 * Log sink the bus routes handler failures through. Mirrors the
 * `StudioLogger` shape so the React shell can forward straight to
 * `writeStudioLog`; left optional so React-free callers (and tests) can
 * omit it — failures then fall back to `console.error`.
 */
export type EventBusLog = (
	level: StudioLogLevel,
	message: string,
	meta?: Readonly<Record<string, unknown>>,
) => void;

/** The in-process event bus. See the file header for delivery semantics. */
export interface EventBus {
	/**
	 * Deliver `payload` to every handler subscribed to `event`, in
	 * registration order. A throwing handler is isolated (reported, then
	 * skipped). No-op when there are no subscribers.
	 */
	emit(event: string, payload?: unknown): void;
	/**
	 * Subscribe `handler` to `event`. Returns an unsubscribe handle.
	 * Each call is an independent subscription — subscribing the same
	 * handler twice delivers to it twice.
	 */
	on(event: string, handler: EventBusHandler): EventBusUnsubscribe;
	/** Drop every subscription (used on `<Studio>` teardown / recompile). */
	clear(): void;
}

/** Options for {@link createEventBus}. */
export interface CreateEventBusOptions {
	/**
	 * Sink for handler-failure logs. When omitted, a throwing handler is
	 * still isolated from its siblings and reported via `console.error`
	 * (never silently swallowed). The React shell always provides one so
	 * failures reach the host logger.
	 */
	readonly log?: EventBusLog;
}

/** One live subscription. `removed` makes unsubscribe idempotent. */
interface Subscription {
	readonly handler: EventBusHandler;
	removed: boolean;
}

/**
 * Create an {@link EventBus}. Each `<Studio>` instance owns exactly one,
 * which gives per-instance isolation for free: two editors on a page
 * never cross-deliver because they hold different bus objects.
 */
export function createEventBus(options: CreateEventBusOptions = {}): EventBus {
	const { log } = options;
	// event name → subscriptions in registration order. An array (not a
	// Set) gives each `on` an independent entry, so a duplicate handler
	// reference does not collapse into one shared, mutually-cancelling
	// subscription.
	const handlers = new Map<string, Subscription[]>();

	// Report a handler failure without ever letting the reporting itself
	// abort dispatch — a throwing log sink must not skip later handlers.
	function reportHandlerError(event: string, error: unknown): void {
		const message = `event handler for "${event}" threw`;
		if (log !== undefined) {
			try {
				log("error", message, { error, event });
			} catch {
				// A logger that throws cannot break the bus; fall through.
			}
			return;
		}
		console.error(`[studio] ${message}`, error);
	}

	return {
		emit(event, payload) {
			const subs = handlers.get(event);
			if (subs === undefined || subs.length === 0) {
				return;
			}
			// Snapshot before dispatch so a handler that (un)subscribes
			// mid-emit does not alter who receives the current event.
			for (const sub of subs.slice()) {
				try {
					sub.handler(payload);
				} catch (error) {
					reportHandlerError(event, error);
				}
			}
		},

		on(event, handler) {
			let subs = handlers.get(event);
			if (subs === undefined) {
				subs = [];
				handlers.set(event, subs);
			}
			const sub: Subscription = { handler, removed: false };
			subs.push(sub);

			return () => {
				if (sub.removed) {
					return;
				}
				sub.removed = true;
				const current = handlers.get(event);
				if (current === undefined) {
					return;
				}
				const index = current.indexOf(sub);
				if (index !== -1) {
					current.splice(index, 1);
				}
				if (current.length === 0) {
					handlers.delete(event);
				}
			};
		},

		clear() {
			handlers.clear();
		},
	};
}
