import { useEffect } from "react";

/**
 * Guards against `TypeError: e.getModifierState is not a function` thrown
 * from Puck's `monitorHotkeys` document keydown/keyup listener.
 *
 * Puck (`@puckeditor/core`) attaches a native bubble-phase `keydown`/`keyup`
 * listener to `document` whose handler calls `e.getModifierState("AltGraph")`
 * with no guard. Browser extensions (password managers, autofill, grammar
 * checkers, IME helpers) routinely dispatch synthetic `keydown` events that
 * are plain `Event`s — these lack `getModifierState`. When one bubbles to
 * `document`, Puck's handler throws and crashes the editor with a runtime
 * `TypeError`.
 *
 * This installs a CAPTURE-phase listener on `document`. For an event whose
 * target is any descendant of `document` (the focused input an extension
 * injects into), the capture phase runs before Puck's bubble-phase handler,
 * so we can shim a no-op `getModifierState` onto the offending event before
 * Puck reads it. Real `KeyboardEvent`s expose `getModifierState` on their
 * prototype, so the `typeof` check leaves them untouched. A shimmed event
 * also has no usable `code`, so Puck's hotkey lookup no-ops on it.
 */
export function useKeyEventGuard(): void {
	useEffect(() => {
		const patch = (event: Event): void => {
			const candidate = event as Event & Partial<KeyboardEvent>;
			if (typeof candidate.getModifierState !== "function") {
				(
					candidate as { getModifierState: KeyboardEvent["getModifierState"] }
				).getModifierState = () => false;
			}
		};
		document.addEventListener("keydown", patch, true);
		document.addEventListener("keyup", patch, true);
		return () => {
			document.removeEventListener("keydown", patch, true);
			document.removeEventListener("keyup", patch, true);
		};
	}, []);
}
