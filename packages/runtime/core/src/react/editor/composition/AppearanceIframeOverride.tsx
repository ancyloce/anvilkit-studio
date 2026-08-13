"use client";

/**
 * @file `AppearanceIframeOverride` — the ready-made canvas style feed
 * for composition hosts (P2-06): live compile
 * (`useCompiledAppearance`) piped into the encapsulated
 * `PuckIframeAppearanceBridge`.
 *
 * Two wirings, ONE component, one compiler, one style element:
 *
 * - **Iframe canvas** (the editor's production mode): pass it as the
 *   iframe override —
 *   `overrides={{ iframe: ({ children }) => (<AppearanceIframeOverride nonce={n}>{children}</AppearanceIframeOverride>) }}`
 *   — the style element then lands inside the frame document.
 *   Verified against the 0.23.0 source: the override renders ONLY in
 *   the enabled-iframe `AutoFrame` branch (`autoFrameContext`
 *   consumer), so this wiring is inert when `iframe.enabled` is
 *   false, and AutoFrame never reaches ready under jsdom — its
 *   runtime invocation is covered by the true-browser (Playwright)
 *   pass, while the component contract is locked in jsdom via the
 *   composition wiring below.
 * - **Host-document canvas** (`iframe: { enabled: false }`, also every
 *   jsdom test): mount it directly around the preview —
 *   `<AppearanceIframeOverride><Puck.Preview /></AppearanceIframeOverride>`
 *   — the same style element lands in the host document, where the
 *   canvas actually renders in that mode.
 *
 * Either way the §8.4 rule holds: exactly one injection path per
 * canvas document, one adapter to retest on a Puck upgrade.
 *
 * ### It also marks the canvas document root
 *
 * Production wraps its output in `<div data-ak-document
 * data-ak-token-mode>`; the editor canvas used to emit nothing
 * comparable, so the two consumers disagreed about where a document
 * starts and which token mode it was compiled for (review 0036 L-6).
 * This component owns the ONE compile, so it is the only place that
 * knows the RESOLVED mode, and it marks whichever root its wiring
 * actually has: the frame's `<body>` when Puck hands it one
 * (`frameDocument`), otherwise the bridge's wrapper around the canvas
 * content. Both spell the mark through the shared
 * `documentRootAttributes`, so the vocabulary cannot drift.
 */

import { type ReactNode, useEffect } from "react";
import { markDocumentRoot } from "../../../style-compiler/document-root.js";
import { PuckIframeAppearanceBridge } from "../PuckIframeAppearanceBridge.js";
import {
	type UseCompiledAppearanceOptions,
	useCompiledAppearance,
} from "./use-compiled-appearance.js";

export interface AppearanceIframeOverrideProps
	extends UseCompiledAppearanceOptions {
	/** CSP nonce propagated onto the style element (§7.4). */
	readonly nonce?: string;
	/**
	 * The canvas frame's `Document`, in the iframe wiring — Puck hands
	 * it to the `iframe` override as `document`.
	 *
	 * Given it, this marks the frame's `<body>` as the document root
	 * with the same attribute pair `AnvilKitRender` puts on the page
	 * root, so the editor and production agree on where a document
	 * begins and which token mode it was compiled for
	 * (review 0036 L-6). Puck fills that body itself, so there is no
	 * element of ours to carry the mark and nothing is wrapped.
	 */
	readonly frameDocument?: Document;
	readonly children?: ReactNode;
}

/** Compile the live document and bridge it into the canvas frame. */
export function AppearanceIframeOverride({
	nonce,
	tokenMode,
	frameDocument,
	children,
}: AppearanceIframeOverrideProps): ReactNode {
	const compiled = useCompiledAppearance({ tokenMode });
	// The RESOLVED mode, not the requested one: `undefined` here means
	// "the design system's default", which only the compiler can name.
	const compiledTokenMode = compiled.tokenMode;

	useEffect(() => {
		const root = frameDocument?.body ?? undefined;
		if (root === undefined) {
			return;
		}
		return markDocumentRoot(root, { tokenMode: compiledTokenMode });
	}, [frameDocument, compiledTokenMode]);

	// Exactly one document root per canvas. The frame body wins when
	// this is the iframe wiring; otherwise the bridge marks the wrapper
	// it puts around the canvas content — and marks nothing at all when
	// there is no content here to contain (the pure style-feed mount).
	const wrapperTokenMode =
		frameDocument === undefined && children !== undefined
			? compiledTokenMode
			: undefined;

	return (
		<PuckIframeAppearanceBridge
			css={compiled.css}
			nonce={nonce}
			tokenMode={wrapperTokenMode}
		>
			{children}
		</PuckIframeAppearanceBridge>
	);
}
