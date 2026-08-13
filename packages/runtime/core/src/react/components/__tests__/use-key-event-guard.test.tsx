/**
 * @file Regression test for {@link useKeyEventGuard}.
 *
 * Reproduces the `TypeError: e.getModifierState is not a function` crash:
 * Puck's `monitorHotkeys` attaches a bubble-phase document `keydown`
 * listener that calls `e.getModifierState("AltGraph")` unguarded. Browser
 * extensions (password managers, autofill) dispatch plain `Event`s of type
 * `keydown` that lack `getModifierState`. The guard installs a capture-phase
 * listener that shims the method on before Puck reads it.
 */

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useKeyEventGuard } from "../use-key-event-guard";

function Harness(): null {
	useKeyEventGuard();
	return null;
}

function FrameHarness({ doc }: { doc: Document | null }): null {
	useKeyEventGuard(doc);
	return null;
}

/** A plain `Event` of type `keydown` — what an extension dispatches. */
function malformedKeydown(init?: EventInit): Event {
	const event = new Event("keydown", init);
	// Guards every assertion below from passing on a well-formed event.
	expect(typeof (event as Partial<KeyboardEvent>).getModifierState).toBe(
		"undefined",
	);
	return event;
}

afterEach(cleanup);

describe("useKeyEventGuard", () => {
	it("shims getModifierState onto a malformed keydown so a Puck-style listener does not throw", () => {
		render(<Harness />);

		// Mimic Puck's monitorHotkeys: bubble-phase document listener that
		// reads getModifierState with no guard. `seen` records the result so
		// we can prove it ran to completion (without the capture guard it
		// throws before pushing).
		const seen: boolean[] = [];
		const puckLike = (event: Event): void => {
			seen.push((event as KeyboardEvent).getModifierState("AltGraph"));
		};
		document.addEventListener("keydown", puckLike);

		const child = document.createElement("input");
		document.body.appendChild(child);

		// Password-manager-style synthetic event: a plain Event, no
		// getModifierState — exactly what reproduces the crash.
		const evt = new Event("keydown", { bubbles: true });
		expect(typeof (evt as Partial<KeyboardEvent>).getModifierState).toBe(
			"undefined",
		);

		child.dispatchEvent(evt);

		// Capture-phase guard ran first and shimmed the method onto the event.
		expect(typeof (evt as KeyboardEvent).getModifierState).toBe("function");
		expect((evt as KeyboardEvent).getModifierState("AltGraph")).toBe(false);
		// The Puck-style bubble listener ran to completion.
		expect(seen).toEqual([false]);

		document.removeEventListener("keydown", puckLike);
		child.remove();
	});

	it("leaves real KeyboardEvents untouched", () => {
		render(<Harness />);
		const evt = new KeyboardEvent("keydown", { bubbles: true });
		const original = (evt as KeyboardEvent).getModifierState;
		document.body.dispatchEvent(evt);
		// Prototype method is left in place, not replaced with the shim.
		expect((evt as KeyboardEvent).getModifierState).toBe(original);
	});

	it("removes its listeners on unmount", () => {
		const { unmount } = render(<Harness />);
		unmount();

		// After unmount, the guard no longer mutates events.
		const child = document.createElement("input");
		document.body.appendChild(child);
		const evt = new Event("keydown", { bubbles: true });
		child.dispatchEvent(evt);
		expect(typeof (evt as Partial<KeyboardEvent>).getModifierState).toBe(
			"undefined",
		);
		child.remove();
	});

	it("shims the property non-enumerably, so a spread of the event does not see it", () => {
		// This is someone else's event object; the workaround should not be
		// visible to a serializer, a spread, or a devtools inspector.
		render(<Harness />);
		const child = document.createElement("input");
		document.body.appendChild(child);
		const evt = malformedKeydown({ bubbles: true });
		child.dispatchEvent(evt);
		expect(typeof (evt as KeyboardEvent).getModifierState).toBe("function");
		expect(Object.keys(evt)).not.toContain("getModifierState");
		expect(
			Object.prototype.propertyIsEnumerable.call(evt, "getModifierState"),
		).toBe(false);
		child.remove();
	});

	it("leaves a non-bubbling event alone — Puck's listener can never receive it", () => {
		// Puck listens BUBBLE-phase on the document
		// (`doc.addEventListener("keydown", onKeyDown)`, no capture flag),
		// so an event that does not bubble to it is out of scope and must
		// not be touched (review 0036 L-9).
		render(<Harness />);
		const child = document.createElement("input");
		document.body.appendChild(child);
		const evt = malformedKeydown({ bubbles: false });
		child.dispatchEvent(evt);
		expect(typeof (evt as Partial<KeyboardEvent>).getModifierState).toBe(
			"undefined",
		);
		child.remove();
	});

	it("still shims a non-bubbling event dispatched AT the document", () => {
		// Narrowing must not open a hole: listeners on the target node run
		// regardless of phase, so Puck's handler does see this one.
		render(<Harness />);
		const seen: boolean[] = [];
		const puckLike = (event: Event): void => {
			seen.push((event as KeyboardEvent).getModifierState("AltGraph"));
		};
		document.addEventListener("keydown", puckLike);
		document.dispatchEvent(malformedKeydown({ bubbles: false }));
		expect(seen).toEqual([false]);
		document.removeEventListener("keydown", puckLike);
	});
});

describe("useKeyEventGuard — the canvas frame document (0036 L-9)", () => {
	function makeFrame(): {
		frameDoc: Document;
		frameView: Window & typeof globalThis;
		remove: () => void;
	} {
		const frame = document.createElement("iframe");
		document.body.appendChild(frame);
		const frameDoc = frame.contentDocument;
		const frameView = frameDoc?.defaultView;
		if (frameDoc === null || frameView === null || frameView === undefined) {
			throw new Error("no frame document");
		}
		return { frameDoc, frameView, remove: () => frame.remove() };
	}

	it("guards a frame document Puck also monitors, which the host guard cannot reach", () => {
		// Puck calls `monitorHotkeys(frameDoc)` for the canvas iframe as
		// well as `monitorHotkeys(document)` for the host. A capture
		// listener on the host document never sees an event dispatched
		// inside the frame, so the frame needs its own guard.
		const { frameDoc, frameView, remove } = makeFrame();
		render(
			<>
				<Harness />
				<FrameHarness doc={frameDoc} />
			</>,
		);

		const seen: boolean[] = [];
		const puckLike = (event: Event): void => {
			seen.push((event as KeyboardEvent).getModifierState("AltGraph"));
		};
		frameDoc.addEventListener("keydown", puckLike);

		const child = frameDoc.createElement("input");
		frameDoc.body.appendChild(child);
		// The frame's own `Event` constructor — a host-realm event would
		// not exercise the frame's listeners the way a real one does.
		const evt = new frameView.Event("keydown", { bubbles: true });
		expect(typeof (evt as Partial<KeyboardEvent>).getModifierState).toBe(
			"undefined",
		);
		child.dispatchEvent(evt);

		// Puck's frame listener ran to completion instead of throwing.
		expect(seen).toEqual([false]);
		frameDoc.removeEventListener("keydown", puckLike);
		remove();
	});

	it("installs nothing when the frame document does not exist yet", () => {
		// `null` is "not ready", not "guard the ambient document" — the
		// canvas mounts before Puck hands over a frame.
		render(<FrameHarness doc={null} />);
		const child = document.createElement("input");
		document.body.appendChild(child);
		const evt = malformedKeydown({ bubbles: true });
		child.dispatchEvent(evt);
		expect(typeof (evt as Partial<KeyboardEvent>).getModifierState).toBe(
			"undefined",
		);
		child.remove();
	});
});
