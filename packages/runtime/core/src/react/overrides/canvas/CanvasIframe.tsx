/**
 * @file `CanvasIframe` — Puck `iframe` override.
 *
 * Wraps Puck's iframe slot, injects the `--ak-studio-*` CSS-var
 * snapshot (`IFRAME_THEME_CSS`) into the iframe's `<head>`, and
 * forcibly resets host page-level scroll/sizing rules that Puck's
 * `CopyHostStyles` mirrors into the iframe (e.g. Next scaffold
 * `html, body { overflow-x: hidden }`, which the CSS spec promotes
 * to a second scroll container stacked on the iframe's root one).
 *
 * The CSS-var injection is idempotent. The scroll/sizing reset is
 * applied as inline styles on `<html>` and `<body>` so it beats any
 * stylesheet rule (including `!important`) regardless of cascade
 * order — `CopyHostStyles` may mirror styles after our `<style>` tag
 * lands, so a stylesheet-only override is racy.
 */

import { type ReactNode, useEffect } from "react";

import { CanvasDropMount } from "@/canvas-drop";
import {
	IFRAME_THEME_CSS,
	IFRAME_THEME_STYLE_ID,
} from "@/overrides/theme/iframe-theme";

export interface CanvasIframeOverrideProps {
	readonly children: ReactNode;
	readonly document?: Document;
}

/** Target inline overrides, as `[property, value]` pairs (all `!important`). */
const SCROLL_RESET_DECLS: readonly (readonly [string, string])[] = [
	["overflow", "visible"],
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

	return (
		<>
			<CanvasDropMount document={iframeDoc} />
			{children}
		</>
	);
}
