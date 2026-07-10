/**
 * @file Unit tests for `createEventBus` — the in-process plugin event
 * bus (architecture §8.5; report 0002 finding P1).
 *
 * Acceptance criteria covered:
 * - `emit` delivers the payload to every subscriber of that event.
 * - Delivery is synchronous and in registration order.
 * - Events are isolated by name; non-subscribers are never called.
 * - `on` returns an unsubscribe handle that stops further delivery,
 *   is idempotent, and does not remove a later re-subscription.
 * - A throwing handler is isolated: siblings still run, and the failure
 *   is logged via the injected sink with the raw `{ error, event }`.
 * - No replay: a handler subscribed after an `emit` never sees it.
 * - Mutating the subscriber set mid-dispatch does not change who
 *   receives the current event.
 * - `close()` drops every subscription AND seals the bus (later `emit`
 *   no-ops, later `on` is rejected).
 */

import { describe, expect, it, vi } from "vitest";
import { createEventBus } from "@/runtime/event-bus";

describe("createEventBus — delivery", () => {
	it("delivers the payload to a subscriber", () => {
		const bus = createEventBus();
		const handler = vi.fn();
		bus.on("evt", handler);

		bus.emit("evt", { hello: "world" });

		expect(handler).toHaveBeenCalledTimes(1);
		expect(handler).toHaveBeenCalledWith({ hello: "world" });
	});

	it("defaults the payload to undefined", () => {
		const bus = createEventBus();
		const handler = vi.fn();
		bus.on("evt", handler);

		bus.emit("evt");

		expect(handler).toHaveBeenCalledWith(undefined);
	});

	it("delivers to multiple subscribers in registration order", () => {
		const bus = createEventBus();
		const order: string[] = [];
		bus.on("evt", () => order.push("a"));
		bus.on("evt", () => order.push("b"));
		bus.on("evt", () => order.push("c"));

		bus.emit("evt");

		expect(order).toEqual(["a", "b", "c"]);
	});

	it("delivers synchronously (handler ran before emit returns)", () => {
		const bus = createEventBus();
		let seen = false;
		bus.on("evt", () => {
			seen = true;
		});

		bus.emit("evt");

		expect(seen).toBe(true);
	});

	it("isolates events by name", () => {
		const bus = createEventBus();
		const a = vi.fn();
		const b = vi.fn();
		bus.on("a", a);
		bus.on("b", b);

		bus.emit("a", 1);

		expect(a).toHaveBeenCalledWith(1);
		expect(b).not.toHaveBeenCalled();
	});

	it("no-ops when there are no subscribers", () => {
		const bus = createEventBus();
		expect(() => bus.emit("nobody", 1)).not.toThrow();
	});

	it("delivers once per subscription (no identity dedup)", () => {
		const bus = createEventBus();
		const handler = vi.fn();
		bus.on("evt", handler);
		bus.on("evt", handler);

		bus.emit("evt");

		// Two independent subscriptions of the same function ⇒ two calls,
		// matching Node's EventEmitter semantics.
		expect(handler).toHaveBeenCalledTimes(2);
	});
});

describe("createEventBus — unsubscribe", () => {
	it("stops delivery after unsubscribe", () => {
		const bus = createEventBus();
		const handler = vi.fn();
		const off = bus.on("evt", handler);

		bus.emit("evt");
		off();
		bus.emit("evt");

		expect(handler).toHaveBeenCalledTimes(1);
	});

	it("is idempotent — calling unsubscribe twice is a no-op", () => {
		const bus = createEventBus();
		const handler = vi.fn();
		const off = bus.on("evt", handler);

		off();
		off();
		bus.emit("evt");

		expect(handler).not.toHaveBeenCalled();
	});

	it("a stale unsubscribe does not remove a later re-subscription", () => {
		const bus = createEventBus();
		const handler = vi.fn();
		const off1 = bus.on("evt", handler);
		off1();
		// Re-subscribe the same handler, then fire the *first* handle again.
		bus.on("evt", handler);
		off1();

		bus.emit("evt");

		expect(handler).toHaveBeenCalledTimes(1);
	});
});

describe("createEventBus — failure isolation", () => {
	it("isolates a throwing handler and still runs siblings", () => {
		const bus = createEventBus();
		const boom = new Error("handler boom");
		const after = vi.fn();
		bus.on("evt", () => {
			throw boom;
		});
		bus.on("evt", after);

		expect(() => bus.emit("evt")).not.toThrow();
		expect(after).toHaveBeenCalledTimes(1);
	});

	it("logs handler failures with the raw error and event name", () => {
		const log = vi.fn();
		const bus = createEventBus({ log });
		const boom = new Error("handler boom");
		bus.on("evt", () => {
			throw boom;
		});

		bus.emit("evt");

		expect(log).toHaveBeenCalledTimes(1);
		expect(log).toHaveBeenCalledWith("error", expect.stringContaining("evt"), {
			error: boom,
			event: "evt",
		});
	});

	it("falls back to console.error (never silent) when no log sink is provided", () => {
		const bus = createEventBus();
		const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
		bus.on("evt", () => {
			throw new Error("boom");
		});

		expect(() => bus.emit("evt")).not.toThrow();
		expect(spy).toHaveBeenCalledTimes(1);
		spy.mockRestore();
	});

	it("a throwing log sink cannot abort dispatch of later handlers", () => {
		const log = vi.fn(() => {
			throw new Error("sink boom");
		});
		const bus = createEventBus({ log });
		const after = vi.fn();
		bus.on("evt", () => {
			throw new Error("handler boom");
		});
		bus.on("evt", after);

		expect(() => bus.emit("evt")).not.toThrow();
		expect(after).toHaveBeenCalledTimes(1);
	});
});

describe("createEventBus — no replay & mid-dispatch mutation", () => {
	it("does not replay a past event to a late subscriber", () => {
		const bus = createEventBus();
		bus.emit("evt", 1);
		const late = vi.fn();
		bus.on("evt", late);

		expect(late).not.toHaveBeenCalled();
	});

	it("a handler subscribed during dispatch does not receive the current event", () => {
		const bus = createEventBus();
		const added = vi.fn();
		bus.on("evt", () => {
			bus.on("evt", added);
		});

		bus.emit("evt");

		expect(added).not.toHaveBeenCalled();

		bus.emit("evt");
		expect(added).toHaveBeenCalledTimes(1);
	});

	it("a handler that unsubscribes a sibling mid-dispatch still delivers to the already-snapshotted sibling", () => {
		const bus = createEventBus();
		const sibling = vi.fn();
		let off = (): void => undefined;
		bus.on("evt", () => off());
		off = bus.on("evt", sibling);

		bus.emit("evt");

		// Snapshot was taken before dispatch, so `sibling` still runs this
		// time; it is gone on the next emit.
		expect(sibling).toHaveBeenCalledTimes(1);
		bus.emit("evt");
		expect(sibling).toHaveBeenCalledTimes(1);
	});
});

describe("createEventBus — close", () => {
	it("drops every subscription", () => {
		const bus = createEventBus();
		const a = vi.fn();
		const b = vi.fn();
		bus.on("a", a);
		bus.on("b", b);

		bus.close();
		bus.emit("a");
		bus.emit("b");

		expect(a).not.toHaveBeenCalled();
		expect(b).not.toHaveBeenCalled();
	});

	it("seals the bus: emit is a no-op and on is rejected after close", () => {
		const bus = createEventBus();
		bus.close();

		const handler = vi.fn();
		// A late subscriber (e.g. a hanging async register that resumes
		// after teardown) must NOT be able to resurrect delivery.
		const off = bus.on("evt", handler);
		bus.emit("evt", 1);

		expect(handler).not.toHaveBeenCalled();
		// The rejected subscription still returns a callable no-op unsubscribe.
		expect(() => off()).not.toThrow();
	});

	it("is idempotent", () => {
		const bus = createEventBus();
		bus.on("evt", vi.fn());
		expect(() => {
			bus.close();
			bus.close();
		}).not.toThrow();
	});
});
