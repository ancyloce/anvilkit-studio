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
 * This installs a CAPTURE-phase listener on the guarded `document`. For an
 * event whose target is any descendant of it (the focused input an extension
 * injects into), the capture phase runs before Puck's bubble-phase handler,
 * so we can shim a no-op `getModifierState` onto the offending event before
 * Puck reads it. Real `KeyboardEvent`s expose `getModifierState` on their
 * prototype, so the `typeof` check leaves them untouched. A shimmed event
 * also has no usable `code`, so Puck's hotkey lookup no-ops on it.
 *
 * ### Puck monitors TWO documents, so this guards both
 *
 * `useMonitorHotkeys` calls `monitorHotkeys(document)` for the host, and
 * `Puck` separately calls `monitorHotkeys(frameDoc)` for the canvas iframe
 * once it is ready (`chunk-55V3NZVF.mjs:13152-13160`). Guarding only the
 * host left the frame exposed to exactly the same crash — an extension
 * injecting into the canvas is if anything MORE likely, since that is where
 * the editable content is. Pass the frame's `Document` (Puck hands it to
 * the `iframe` override) to guard it; `CanvasIframe` does.
 *
 * ### This is a workaround, and the real fix is upstream
 *
 * The defect is in `@puckeditor/core@0.23.0`: its `monitorHotkeys`
 * document listener calls `e.getModifierState("AltGraph")` with no
 * feature check (`chunk-K2LNXU54.mjs:726-728`, `:754`), so any
 * synthetic `keydown`/`keyup` that is a plain `Event` crashes the
 * editor. The shim has to be installed before Puck's handler reads the
 * property, and every event that can REACH that handler is in scope —
 * which is every key event that bubbles to the guarded document, plus
 * any dispatched at the document itself. Events outside that set are
 * skipped, so this touches as few foreign objects as the upstream
 * defect allows.
 *
 * Delete this hook once Puck guards that call; it exists only to keep a
 * browser extension from taking the editor down (review 0036 L-9).
 */
export function useKeyEventGuard(target?: Document | null): void {
	useEffect(() => {
		// `null` is "the document I would guard does not exist yet" — the
		// canvas frame before Puck mounts it. Distinct from omitting the
		// argument, which means the ambient document; collapsing the two
		// would silently install a second host guard from the canvas.
		const doc =
			target === null
				? undefined
				: (target ?? (typeof document === "undefined" ? undefined : document));
		if (doc === undefined) {
			return;
		}
		const patch = (event: Event): void => {
			// Puck's listener is BUBBLE-phase on the document
			// (`doc.addEventListener("keydown", onKeyDown)` — no capture
			// flag), so an event that neither bubbles nor targets the
			// document itself can never reach it. Leaving those alone keeps
			// this from touching foreign event objects it does not have to
			// (review 0036 L-9).
			if (!event.bubbles && event.target !== doc) {
				return;
			}
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
		doc.addEventListener("keydown", patch, true);
		doc.addEventListener("keyup", patch, true);
		return () => {
			doc.removeEventListener("keydown", patch, true);
			doc.removeEventListener("keyup", patch, true);
		};
	}, [target]);
}
