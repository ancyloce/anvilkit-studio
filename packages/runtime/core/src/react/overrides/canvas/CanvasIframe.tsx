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
 * same pinned box, so it can never see the real (possibly much
 * taller) portal-mounted content. `scrollHeight` is the one
 * measurement that looks PAST a box's own declared size at its true
 * rendered extent (regardless of `overflow: hidden` vs `visible`), so
 * every re-measure below reads `frameRoot.scrollHeight` explicitly
 * rather than trusting the observer entry.
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
import { useCanvasRootHeight } from "@/state/slices/editor-ui-selectors";

export interface CanvasIframeOverrideProps {
	readonly children: ReactNode;
	readonly document?: Document;
}

/** Target inline overrides, as `[property, value]` pairs (all `!important`). */
const SCROLL_RESET_DECLS: readonly (readonly [string, string])[] = [
	["overflow", "hidden"],
	["max-width", "none"],
];

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
	const [, setCanvasRootHeight] = useCanvasRootHeight();

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
	// can size the canvas frame to match — see the file doc for why
	// this reads `scrollHeight` explicitly (never an observer entry's
	// own contentRect/contentBoxSize, which stays pinned to Puck's
	// `min-height: 100vh` sentinel box regardless of real content).
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
		const report = (): void => setCanvasRootHeight(frameRoot.scrollHeight);
		report();

		const view = iframeDoc.defaultView;
		const Ro =
			view?.ResizeObserver ??
			(typeof ResizeObserver !== "undefined" ? ResizeObserver : undefined);
		const resizeObserver = Ro !== undefined ? new Ro(report) : undefined;
		resizeObserver?.observe(iframeDoc.body);

		const Mo =
			view?.MutationObserver ??
			(typeof MutationObserver !== "undefined" ? MutationObserver : undefined);
		const mutationObserver = Mo !== undefined ? new Mo(report) : undefined;
		mutationObserver?.observe(frameRoot, {
			childList: true,
			subtree: true,
			attributes: true,
			characterData: true,
		});

		return () => {
			resizeObserver?.disconnect();
			mutationObserver?.disconnect();
		};
	}, [iframeDoc, setCanvasRootHeight]);

	return (
		<>
			<CanvasDropMount document={iframeDoc} />
			{children}
		</>
	);
}
