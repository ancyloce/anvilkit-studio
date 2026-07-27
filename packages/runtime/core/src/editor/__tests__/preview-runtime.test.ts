/**
 * Preview-mode lifecycle — the §16 disposal guarantee
 * (PLAN-0020 CORE-P3-002; ED-MOTION-002).
 *
 * These are leak tests. Each one asserts on `liveResourceCount` or a
 * released-flag probe rather than on "dispose() did not throw", so a
 * session that forgets a resource fails loudly instead of passing.
 */

import { describe, expect, it, vi } from "vitest";
import {
	createPreviewSession,
	interactionsEnabled,
} from "../interactions/preview-runtime.js";

describe("interactionsEnabled", () => {
	it("runs interactions only in preview mode (§16)", () => {
		expect(interactionsEnabled("design")).toBe(false);
		expect(interactionsEnabled("preview")).toBe(true);
	});
});

describe("createPreviewSession — disposal", () => {
	it("releases every registered resource on exit", () => {
		const session = createPreviewSession("preview");
		const timer = vi.fn();
		const observer = vi.fn();
		const animation = vi.fn();
		session.register(timer);
		session.register(observer);
		session.register(animation);
		expect(session.liveResourceCount).toBe(3);

		session.dispose();

		expect(timer).toHaveBeenCalledOnce();
		expect(observer).toHaveBeenCalledOnce();
		expect(animation).toHaveBeenCalledOnce();
		expect(session.liveResourceCount).toBe(0);
		expect(session.disposed).toBe(true);
	});

	it("is idempotent — a second dispose releases nothing twice", () => {
		const session = createPreviewSession("preview");
		const dispose = vi.fn();
		session.register(dispose);
		session.dispose();
		session.dispose();
		expect(dispose).toHaveBeenCalledOnce();
	});

	it("keeps disposing after a disposer throws", () => {
		// A half-disposed preview is exactly the state that leaks
		// observers, so one bad disposer must not strand the others.
		const session = createPreviewSession("preview");
		const after = vi.fn();
		session.register(() => {
			throw new Error("observer teardown failed");
		});
		session.register(after);

		expect(() => session.dispose()).not.toThrow();
		expect(after).toHaveBeenCalledOnce();
		expect(session.liveResourceCount).toBe(0);
	});

	it("lets a caller release one resource early without leaking it", () => {
		const session = createPreviewSession("preview");
		const dispose = vi.fn();
		const release = session.register(dispose);

		release();
		expect(dispose).toHaveBeenCalledOnce();
		expect(session.liveResourceCount).toBe(0);

		// Double release is safe, and disposal does not call it again.
		release();
		session.dispose();
		expect(dispose).toHaveBeenCalledOnce();
	});

	it("survives a disposer that unregisters a sibling mid-teardown", () => {
		// Iterating the live set directly would skip the sibling.
		const session = createPreviewSession("preview");
		const sibling = vi.fn();
		let releaseSibling: () => void = () => {
			// Replaced below; the first disposer captures this binding.
		};
		session.register(() => releaseSibling());
		releaseSibling = session.register(sibling);

		session.dispose();
		expect(sibling).toHaveBeenCalledOnce();
		expect(session.liveResourceCount).toBe(0);
	});

	it("immediately releases a resource registered after disposal", () => {
		// Nothing would ever call this disposer otherwise.
		const session = createPreviewSession("preview");
		session.dispose();
		const late = vi.fn();
		session.register(late);
		expect(late).toHaveBeenCalledOnce();
		expect(session.liveResourceCount).toBe(0);
	});
});

describe("createPreviewSession — temporary variant state", () => {
	it("holds overrides while previewing and drops them on exit", () => {
		const session = createPreviewSession("preview");
		session.setVariantOverride({ nodeId: "n1", selection: { size: "lg" } });
		expect(session.variantOverrides.get("n1")).toEqual({ size: "lg" });

		session.dispose();

		// §16: exiting preview disposes temporary variant state, so the
		// document's own resolution takes over again.
		expect(session.variantOverrides.size).toBe(0);
	});

	it("ignores overrides set after disposal", () => {
		const session = createPreviewSession("preview");
		session.dispose();
		session.setVariantOverride({ nodeId: "n1", selection: { size: "lg" } });
		expect(session.variantOverrides.size).toBe(0);
	});
});

describe("createPreviewSession — design mode", () => {
	it("is a valid session that simply never runs interactions", () => {
		const session = createPreviewSession("design");
		expect(interactionsEnabled(session.mode)).toBe(false);
		expect(session.disposed).toBe(false);
		expect(session.liveResourceCount).toBe(0);
	});
});
