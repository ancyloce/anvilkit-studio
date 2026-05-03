/**
 * @file `CanvasIframe` — Puck `iframe` override.
 *
 * Wraps Puck's iframe slot and injects the `--ak-studio-*` CSS-var
 * snapshot (`IFRAME_THEME_CSS`) into the iframe's `<head>` so canvas
 * content theme-syncs with the surrounding chrome.
 *
 * The iframe `Document` is supplied by Puck. The injection is
 * idempotent: if the `<style>` tag already exists (e.g. when
 * `useThemeSync` injected it on mount), this override does not
 * duplicate it.
 */

import { type ReactNode, useEffect } from "react";

import {
	IFRAME_THEME_CSS,
	IFRAME_THEME_STYLE_ID,
} from "../theme/iframe-theme.js";

export interface CanvasIframeOverrideProps {
	readonly children: ReactNode;
	readonly document?: Document;
}

export function CanvasIframe({
	children,
	document: iframeDoc,
}: CanvasIframeOverrideProps): ReactNode {
	useEffect(() => {
		if (iframeDoc === undefined) return;
		if (iframeDoc.getElementById(IFRAME_THEME_STYLE_ID) !== null) return;
		const style = iframeDoc.createElement("style");
		style.id = IFRAME_THEME_STYLE_ID;
		style.textContent = IFRAME_THEME_CSS;
		iframeDoc.head.appendChild(style);
	}, [iframeDoc]);

	return <>{children}</>;
}
