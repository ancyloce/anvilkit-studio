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
 *
 * ### This is a workaround, and the real fix is upstream
 *
 * The defect is in `@puckeditor/core@0.23.0`: its `monitorHotkeys`
 * document listener calls `e.getModifierState("AltGraph")` with no
 * feature check, so any synthetic `keydown`/`keyup` that is a plain
 * `Event` crashes the editor. Nothing in this package can narrow the
 * guard further — Puck listens on `document`, so every bubbling key
 * event is in scope, and the shim has to be installed before Puck's
 * handler reads the property.
 *
 * Delete this hook once Puck guards that call; it exists only to keep a
 * browser extension from taking the editor down (review 0036 L-9).
 */
export function useKeyEventGuard(): void {
	useEffect(() => {
		const patch = (event: Event): void => {
			const candidate = event as Event & Partial<KeyboardEvent>;
			if (typeof candidate.getModifierState === "function") {
				return;
			}
			// Defined rather than assigned so the shim is non-enumerable:
			// this is someone else's event object, and it should not gain a
			// visible own property that `{...event}`, a serializer, or a
			// devtools inspector would report as part of the event
			// (review 0036 L-9). `configurable` so a later handler can undo
			// it if it ever wants to.
			Object.defineProperty(candidate, "getModifierState", {
				value: () => false,
				enumerable: false,
				configurable: true,
				writable: true,
			});
		};
		document.addEventListener("keydown", patch, true);
		document.addEventListener("keyup", patch, true);
		return () => {
			document.removeEventListener("keydown", patch, true);
			document.removeEventListener("keyup", patch, true);
		};
	}, []);
}
