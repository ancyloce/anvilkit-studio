/**
 * @file `CanvasIframe` — Puck `iframe` override.
 *
 * Wraps Puck's iframe slot, injects the `--ak-studio-*` CSS-var
 * snapshot (`IFRAME_THEME_CSS`) into the iframe's `<head>`, and
 * forcibly resets host page-level scroll/sizing rules that Puck's
 * `CopyHostStyles` mirrors into the iframe (e.g. Next scaffold
 * `html, body { overflow-x: hidden }`, which — if left mismatched
 * against the OTHER axis — the CSS spec promotes into a second,
 * independently-scrolling container stacked on the iframe's root
 * one). Forcing BOTH `overflow-x`/`overflow-y` (the `overflow`
 * shorthand) to the SAME value on both `<html>` and `<body>` sidesteps
 * that promotion rule entirely (it only triggers when the two axes'
 * *computed* values differ), regardless of which value is chosen.
 *
 * The value chosen is `hidden`, not `visible`: the canvas frame's own
 * box is kept in sync with the iframe's real content height (see
 * "Content-height reporting" below), so the iframe should never need
 * to scroll — all panning happens on the OUTER workspace's
 * `overflow-auto`. `overflow: visible` on a document's ROOT element is
 * spec-mandated to behave like `auto` for viewport-scrolling purposes
 * (a root element can't truly opt out of the browser's scroll
 * mechanism), so it would still show the iframe's own native
 * scrollbar the instant real content outgrows our synced height by
 * even a sub-pixel rounding amount. `hidden` has no such carve-out —
 * it guarantees no iframe-native scrollbar ever renders, and any
 * fleeting overflow between a content change and the next
 * `scrollHeight` re-measure is invisibly clipped instead of flashing
 * a scrollbar.
 *
 * The CSS-var injection is idempotent. The scroll/sizing reset is
 * applied as inline styles on `<html>` and `<body>` so it beats any
 * stylesheet rule (including `!important`) regardless of cascade
 * order — `CopyHostStyles` may mirror styles after our `<style>` tag
 * lands, so a stylesheet-only override is racy.
 *
 * ### Content-height reporting
 *
 * An `<iframe>` is a replaced element: its box never auto-grows to
 * match its own document's content the way a normal block element
 * would, and Puck's own `_PuckPreview-frame_ { height: 100% }` can
 * only resolve against an ANCESTOR with a definite `height` (a
 * `min-height` alone never establishes a percentage basis — a CSS
 * rule, not a bug). So without an explicit pixel height fed back from
 * inside the iframe, the canvas frame's chain collapses to the
 * browser's UA default (150px), clipping real content behind an
 * iframe-internal scrollbar no matter how tall the surrounding chrome
 * is.
 *
 * `#frame-root` (Puck's own mount sentinel) is styled `height: 1px;
 * min-height: 100vh` in Puck's bundled CSS — a deliberate "shrink the
 * box, let content overflow it" trick. That means its OWN layout box
 * (and every ancestor's, up through `<body>`/`<html>`, since CSS
 * auto-height propagation follows a child's declared box, not its
 * overflow) stays pinned at `100vh` — which is circular here, since
 * the iframe's height is exactly what we're trying to compute from
 * it. A `ResizeObserver`'s `contentBoxSize`/`contentRect` reports that
 * same pinned box, and so does `scrollHeight` (which never returns less
 * than the element's own padding box): both bottom out at the iframe
 * viewport height, i.e. at the value the PREVIOUS report produced.
 * Feeding that back is a self-driving loop — each pass loses the canvas
 * frame's border width, re-fires the observers, and never settles until
 * React aborts with "Maximum update depth exceeded". `measureContentHeight`
 * therefore unions `#frame-root`'s CHILDREN instead: real page content,
 * whose extent depends on nothing this file writes.
 * `StudioViewportPreview` applies the result as the canvas frame's
 * explicit `height` (`useCanvasRootHeight`), which is what finally
 * lets Puck's percentage chain resolve down to the iframe.
 */

import { type ReactNode, useEffect } from "react";

import { CanvasDropMount } from "@/canvas-drop";
import {
	IFRAME_THEME_CSS,
	IFRAME_THEME_STYLE_ID,
} from "@/overrides/theme/iframe-theme";
import { useMsg } from "@/state/editor-i18n-context";
import { useCanvasRootHeight } from "@/state/slices/editor-ui-selectors";
import { useKeyEventGuard } from "../../components/use-key-event-guard.js";
import { useCanvasDocumentSync } from "../../editor/canvas/use-canvas-document-sync.js";
import { CompiledAppearanceMount } from "../../editor/composition/CompiledAppearanceMount.js";

export interface CanvasIframeOverrideProps {
	readonly children: ReactNode;
	readonly document?: Document;
}

/** Target inline overrides, as `[property, value]` pairs (all `!important`). */
const SCROLL_RESET_DECLS: readonly (readonly [string, string])[] = [
	["overflow", "hidden"],
	["max-width", "none"],
];

/** Snapshot one inline declaration (value AND priority); returns its restorer. */
function captureDecl(style: CSSStyleDeclaration, property: string): () => void {
	const value = style.getPropertyValue(property);
	const priority = style.getPropertyPriority(property);
	return () => {
		if (value === "") style.removeProperty(property);
		else style.setProperty(property, value, priority);
	};
}

/**
 * Real content extent of Puck's `#frame-root`, measured with its own
 * viewport-derived pinning transiently removed.
 *
 * A plain `frameRoot.scrollHeight` read cannot answer this. Puck styles
 * `#frame-root` `height: 1px; min-height: 100vh`, and `scrollHeight` never
 * reports less than the element's own padding box — so it returns
 * `max(realContent, iframeViewportHeight)`, and the iframe's viewport
 * height is whatever the host applied FROM THE PREVIOUS REPORT. That makes
 * the measurement a function of its own output: every report resizes the
 * iframe, every resize re-fires the observers below, and a page shorter
 * than the viewport walks the value down by the canvas frame's border
 * width on each pass instead of settling — an unbounded update chain that
 * ends in React's "Maximum update depth exceeded".
 *
 * Reading the children's boxes instead does not help: Puck's root
 * `DropZone` resolves its own height against `#frame-root`, so it is
 * pinned to the same viewport-derived value while the real content
 * overflows it. Collapsing `#frame-root` for the duration of the read is
 * what actually breaks the cycle — every box that resolved against the
 * pinned height collapses with it, leaving `scrollHeight` reporting pure
 * scrollable overflow (the root zone is `overflow: visible`, so nothing in
 * between clips it away). Both writes are reverted in the same synchronous
 * block, before style/layout can be committed to a paint, so nothing
 * observes the collapsed state.
 */
function measureContentHeight(frameRoot: HTMLElement): number {
	const { style } = frameRoot;
	const restore = [
		captureDecl(style, "height"),
		captureDecl(style, "min-height"),
	];
	style.setProperty("height", "0px", "important");
	style.setProperty("min-height", "0px", "important");
	const extent = frameRoot.scrollHeight;
	for (const restoreDecl of restore) restoreDecl();
	return extent;
}

function applyScrollReset(doc: Document): void {
	const html = doc.documentElement;
	const body = doc.body;
	if (html === null || body === null) return;
	for (const el of [html, body]) {
		for (const [property, value] of SCROLL_RESET_DECLS) {
			// Diff-before-write (review finding P-1): only touch the `style`
			// attribute when a declaration is actually wrong, so the
			// MutationObserver watching `style` does not re-fire on our own
			// no-op resets during `CopyHostStyles` churn.
			if (
				el.style.getPropertyValue(property) !== value ||
				el.style.getPropertyPriority(property) !== "important"
			) {
				el.style.setProperty(property, value, "important");
			}
		}
	}
}

export function CanvasIframe({
	children,
	document: iframeDoc,
}: CanvasIframeOverrideProps): ReactNode {
	const msg = useMsg();
	const [, setCanvasRootHeight] = useCanvasRootHeight();

	// Editor canvas registry feed (CORE-P1B-001): a no-op unless the
	// editor feature is enabled.
	useCanvasDocumentSync(iframeDoc);

	// Puck monitors hotkeys on the FRAME document as well as the host
	// one, with the same unguarded `getModifierState` call — so the
	// canvas needs the same shim `<Studio>` installs upstairs, or an
	// extension injecting into the canvas crashes the editor
	// (review 0036 L-9).
	useKeyEventGuard(iframeDoc ?? null);

	// Puck renders the canvas `<iframe>` itself and gives it no `title`,
	// which axe reports as a serious `frame-title` violation: a screen
	// reader announces the whole page canvas as an unnamed frame
	// (PLAN-0020 CORE-P4-003). We cannot change Puck's markup, but this
	// override already owns the iframe's document — reaching one level
	// out to its own frame element is the same access, and it is the
	// only place in the app that can name it.
	useEffect(() => {
		const frame = iframeDoc?.defaultView?.frameElement;
		if (frame === null || frame === undefined) return;
		const title = msg("studio.editor.canvas.frameTitle");
		if (frame.getAttribute("title") !== title) {
			frame.setAttribute("title", title);
		}
	}, [iframeDoc, msg]);

	useEffect(() => {
		if (iframeDoc === undefined) return;
		if (iframeDoc.getElementById(IFRAME_THEME_STYLE_ID) === null) {
			const style = iframeDoc.createElement("style");
			style.id = IFRAME_THEME_STYLE_ID;
			style.textContent = IFRAME_THEME_CSS;
			iframeDoc.head.appendChild(style);
		}
		applyScrollReset(iframeDoc);
		// Prefer the iframe's own view; some embedded/test environments
		// don't expose a global `MutationObserver`. The one-time reset
		// above still applies; we just can't track later style mutations.
		const Mo =
			iframeDoc.defaultView?.MutationObserver ??
			(typeof MutationObserver !== "undefined" ? MutationObserver : undefined);
		if (Mo === undefined) return;
		const observer = new Mo(() => applyScrollReset(iframeDoc));
		observer.observe(iframeDoc.documentElement, {
			attributes: true,
			attributeFilter: ["style"],
		});
		observer.observe(iframeDoc.body, {
			attributes: true,
			attributeFilter: ["style"],
		});
		return () => observer.disconnect();
	}, [iframeDoc]);

	// Report `#frame-root`'s real rendered height so the host document
	// can size the canvas frame to match — see `measureContentHeight`
	// for why neither an observer entry's own contentRect/contentBoxSize
	// nor `scrollHeight` can supply it (both floor at Puck's
	// `min-height: 100vh` sentinel box, which is the iframe height this
	// very effect produces).
	// `ResizeObserver` and `MutationObserver` are both wired as
	// re-measure TRIGGERS, not measurement sources: a `ResizeObserver`
	// on the iframe body catches width-driven reflow (e.g. a panel
	// resize changing text wrapping), and a `MutationObserver` on
	// `#frame-root`'s subtree catches every Puck edit (component
	// add/remove/edit) — between the two, any real content-height
	// change gets a fresh `scrollHeight` read.
	useEffect(() => {
		if (iframeDoc === undefined) return;
		const frameRoot = iframeDoc.getElementById("frame-root");
		if (frameRoot === null) return;
		const view = iframeDoc.defaultView;

		let lastHeight = -1;
		let lastViewportHeight = -1;
		let mutationObserver: MutationObserver | undefined;

		const report = (): void => {
			const height = measureContentHeight(frameRoot);
			// `measureContentHeight` writes (and reverts) two inline
			// declarations on `#frame-root`, which the observer below watches.
			// Drop those self-inflicted records synchronously, before the
			// callback microtask can see them, or every measurement schedules
			// the next one.
			mutationObserver?.takeRecords();
			if (height === lastHeight) return;
			const viewportHeight = view?.innerHeight ?? 0;
			// Feedback breaker. Content that sizes ITSELF against the iframe
			// viewport (`100vh`/`100dvh`) re-creates the circularity that
			// `measureContentHeight` removes for ordinary content, and no
			// measurement strategy can undo it: growing the frame grows the
			// viewport, which grows the content, which grows the frame. The tell
			// is that the content moved by EXACTLY as much as the viewport did —
			// i.e. the delta carries no information about the content itself.
			// Swallow that one measurement rather than feeding it back: the next
			// genuine trigger still gets through (`lastHeight` is deliberately
			// left untouched), so such a page renders slightly off instead of
			// locking the editor into an unbounded update loop.
			if (
				lastHeight !== -1 &&
				viewportHeight !== lastViewportHeight &&
				height - lastHeight === viewportHeight - lastViewportHeight
			) {
				lastViewportHeight = viewportHeight;
				return;
			}
			lastHeight = height;
			lastViewportHeight = viewportHeight;
			setCanvasRootHeight(height);
		};

		// Measure once synchronously so the first paint already has a real
		// height, then coalesce every observer-driven re-measure onto an
		// animation frame — a Puck edit or a drag fires both observers many
		// times per frame, and each measurement forces a synchronous layout.
		report();
		const raf =
			view?.requestAnimationFrame?.bind(view) ??
			(typeof requestAnimationFrame !== "undefined"
				? requestAnimationFrame
				: undefined);
		const caf =
			view?.cancelAnimationFrame?.bind(view) ??
			(typeof cancelAnimationFrame !== "undefined"
				? cancelAnimationFrame
				: undefined);
		let pendingFrame = 0;
		const schedule =
			raf === undefined
				? report
				: (): void => {
						if (pendingFrame !== 0) return;
						pendingFrame = raf(() => {
							pendingFrame = 0;
							report();
						});
					};

		const Ro =
			view?.ResizeObserver ??
			(typeof ResizeObserver !== "undefined" ? ResizeObserver : undefined);
		const resizeObserver = Ro !== undefined ? new Ro(schedule) : undefined;
		resizeObserver?.observe(iframeDoc.body);

		const Mo =
			view?.MutationObserver ??
			(typeof MutationObserver !== "undefined" ? MutationObserver : undefined);
		mutationObserver = Mo !== undefined ? new Mo(schedule) : undefined;
		mutationObserver?.observe(frameRoot, {
			childList: true,
			subtree: true,
			attributes: true,
			characterData: true,
		});

		return () => {
			if (pendingFrame !== 0) caf?.(pendingFrame);
			resizeObserver?.disconnect();
			mutationObserver?.disconnect();
		};
	}, [iframeDoc, setCanvasRootHeight]);

	return (
		<>
			<CanvasDropMount document={iframeDoc} />
			{/* The ONE stylesheet channel (PLAN-0025 P4-07; `p3-009`): the
			    SAME compiled CSS the preview, production rendering and the
			    exporters consume. The legacy `AuthoringStylesheetMount`
			    beside it served sidecar documents and was deleted with the
			    sidecar — it was the second CSS emitter, and contract rule 3
			    permits exactly one. */}
			<CompiledAppearanceMount document={iframeDoc} />
			{children}
		</>
	);
}
