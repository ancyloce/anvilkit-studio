"use client";

/**
 * @file `PuckIframeAppearanceBridge` — the sole iframe override
 * adapter (PLAN-0025 §8.4, P2-06).
 *
 * The ONLY Overrides boundary the target architecture keeps: Puck's
 * documentation identifies the iframe override as a styling injection
 * point, and everything else moved to composition (P2-01). The §8.4
 * encapsulation contract, enforced by this component's tiny surface:
 *
 * - it receives ONLY the compiled stylesheet's `css`, the token mode
 *   that stylesheet was compiled for, an optional CSP `nonce`, and
 *   `children`;
 * - it does not parse selection, modify component props, or wrap
 *   individual components;
 * - its behavior is locked by contract tests against
 *   `@puckeditor/core@0.23.0` — a Puck upgrade retests or replaces
 *   THIS adapter and nothing else.
 *
 * The style element carries `data-anvilkit-appearance` so parity
 * tooling (and the §8.4 "no two injection paths" rule) can assert
 * exactly one instance exists.
 */

import type { CSSProperties, ReactNode } from "react";
import { documentRootAttributes } from "../../style-compiler/document-root.js";

/**
 * The document-root marking must not change canvas layout, so the
 * carrier generates no box: its children lay out against the canvas
 * frame exactly as they did before it existed. Safe precisely because
 * compiled CSS may never target the marking (`selector-scope-parity`),
 * so nothing can style a box that is not there.
 *
 * An inline style rather than a utility class: this element renders
 * inside the canvas document, which does not inherit the host's
 * stylesheets (Tailwind included), so a class would resolve to nothing
 * in the wiring that matters most.
 */
const DOCUMENT_ROOT_STYLE: CSSProperties = { display: "contents" };

export interface PuckIframeAppearanceBridgeProps {
	/** Compiled document CSS (`compileDocumentAppearance(...).css`). */
	readonly css: string;
	/** CSP nonce propagated onto the style element (§7.4). */
	readonly nonce?: string;
	/**
	 * The RESOLVED token mode of the compilation that produced `css`
	 * (`compileDocumentAppearance(...).tokenMode`) — never the caller's
	 * possibly-`undefined` request.
	 *
	 * Pass it when this bridge WRAPS the canvas content, i.e. the
	 * host-document wiring: the bridge then marks its wrapper as the
	 * document root, the same pair `AnvilKitRender` puts on the page
	 * root (review 0036 L-6).
	 *
	 * Omit it when the bridge is a pure style feed with no children —
	 * the iframe wiring, where the canvas content is Puck's own frame
	 * body and a wrapper here would mark an element containing nothing.
	 * `AppearanceIframeOverride` marks the frame document itself there.
	 */
	readonly tokenMode?: string;
	readonly children?: ReactNode;
}

/**
 * Render the compiled appearance stylesheet ahead of the canvas
 * content. Rendered inside Puck's iframe override, the style element
 * lands in the iframe document itself — canvas styles never depend on
 * host-document cascade (iframes do not inherit parent CSS).
 */
export function PuckIframeAppearanceBridge({
	css,
	nonce,
	tokenMode,
	children,
}: PuckIframeAppearanceBridgeProps): ReactNode {
	const sheet = (
		<style
			nonce={nonce}
			data-anvilkit-appearance=""
			// biome-ignore lint/security/noDangerouslySetInnerHtml: the CSS comes exclusively from the pure compiler, whose serializer escapes selectors and admits property names only from the schema (§7.4) — never from user-supplied strings.
			dangerouslySetInnerHTML={{ __html: css }}
		/>
	);
	if (tokenMode === undefined) {
		return (
			<>
				{sheet}
				{children}
			</>
		);
	}
	return (
		<div {...documentRootAttributes({ tokenMode })} style={DOCUMENT_ROOT_STYLE}>
			{sheet}
			{children}
		</div>
	);
}
