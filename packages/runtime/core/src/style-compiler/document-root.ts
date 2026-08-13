/**
 * @file The document-root marking contract — ONE vocabulary, shared by
 * every consumer of the compiled appearance (review 0036 L-6).
 *
 * `AnvilKitRender` wrapped its output in
 * `<div data-ak-document data-ak-token-mode>` and the editor canvas
 * emitted nothing comparable, so "editor, preview, production and
 * export use the same pure rendering/style pipeline" (Puck contract §1
 * condition 3) held for the stylesheet but not for the root it lands
 * on. Nothing enforced the asymmetry either way, so the first
 * document-scoped rule would have applied in production and silently
 * not in the editor.
 *
 * This module owns the attribute names and the value, so the marking
 * cannot drift between consumers the way it did when each spelled its
 * own. It does NOT decide the carrier: that legitimately differs, and
 * pretending otherwise is what would introduce a second pipeline.
 *
 * - **Production** (`AnvilKitRender`) owns the page root and is
 *   deliberately hook-free (RSC-safe), so it spreads
 *   {@link documentRootAttributes} onto its own wrapper element.
 * - **Editor, host-document canvas** (`AppearanceIframeOverride`
 *   wrapping `Puck.Preview`) owns the canvas subtree, so the bridge
 *   emits the same pair on a wrapper of its own.
 * - **Editor, iframe canvas** (`CanvasIframe`) owns a whole
 *   `Document` whose body Puck fills — there is no element of ours
 *   containing the canvas, so {@link markDocumentRoot} writes the pair
 *   onto the frame's `<body>` instead of inventing a wrapper.
 *
 * The marking is an IDENTIFICATION hook, never a styling hook: the
 * editor's carriers generate no box of their own (`display: contents`
 * in the host-document wiring, the frame body in the iframe wiring),
 * while production's is a real block box. `selector-scope-parity.test.ts`
 * is what keeps that difference unobservable — it asserts compiled CSS
 * never mentions either attribute. Relax that test and this divergence
 * becomes visible again.
 *
 * React-free and DOM-type-only, so it stays importable from the
 * headless render path and the editor alike.
 */

/** Marks the element that contains one rendered document. */
export const DOCUMENT_ROOT_ATTRIBUTE = "data-ak-document";

/** Carries the token mode that document's stylesheet was compiled for. */
export const TOKEN_MODE_ATTRIBUTE = "data-ak-token-mode";

/** The attribute pair every consumer puts on its document root. */
export interface DocumentRootAttributes {
	readonly [DOCUMENT_ROOT_ATTRIBUTE]: "";
	readonly [TOKEN_MODE_ATTRIBUTE]: string;
}

/**
 * The document-root attributes for a compilation.
 *
 * Takes the compiled result rather than the caller's `tokenMode`
 * input: only the compiler can resolve `undefined` to the design
 * system's `defaultTokenMode`, and guessing `?? "default"` misreported
 * the mode for any design system that declared another one
 * (review 0036 L-5).
 */
export function documentRootAttributes(compiled: {
	readonly tokenMode: string;
}): DocumentRootAttributes {
	return {
		[DOCUMENT_ROOT_ATTRIBUTE]: "",
		[TOKEN_MODE_ATTRIBUTE]: compiled.tokenMode,
	};
}

/**
 * Mark an existing element as the document root, returning a restorer.
 *
 * For the consumer that owns a `Document` rather than an element — the
 * iframe canvas, where Puck fills the frame body and no element of ours
 * wraps it. The restorer puts back exactly what was there (including
 * "nothing"), so a canvas that unmounts leaves no stale mode behind for
 * parity tooling to read.
 */
export function markDocumentRoot(
	element: Element,
	compiled: { readonly tokenMode: string },
): () => void {
	const attributes = Object.entries(documentRootAttributes(compiled));
	const previous = attributes.map(
		([name]) => [name, element.getAttribute(name)] as const,
	);
	for (const [name, value] of attributes) {
		element.setAttribute(name, value);
	}
	return () => {
		for (const [name, value] of previous) {
			if (value === null) {
				element.removeAttribute(name);
			} else {
				element.setAttribute(name, value);
			}
		}
	};
}
