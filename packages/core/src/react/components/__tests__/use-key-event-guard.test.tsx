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
});
