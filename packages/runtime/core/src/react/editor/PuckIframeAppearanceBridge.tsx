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
 * - it receives ONLY `css`, an optional CSP `nonce`, and `children`;
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

import type { ReactNode } from "react";

export interface PuckIframeAppearanceBridgeProps {
	/** Compiled document CSS (`compileDocumentAppearance(...).css`). */
	readonly css: string;
	/** CSP nonce propagated onto the style element (§7.4). */
	readonly nonce?: string;
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
	children,
}: PuckIframeAppearanceBridgeProps): ReactNode {
	return (
		<>
			<style
				nonce={nonce}
				data-anvilkit-appearance=""
				// biome-ignore lint/security/noDangerouslySetInnerHtml: the CSS comes exclusively from the pure compiler, whose serializer escapes selectors and admits property names only from the schema (§7.4) — never from user-supplied strings.
				dangerouslySetInnerHTML={{ __html: css }}
			/>
			{children}
		</>
	);
}
