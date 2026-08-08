/**
 * @file Inline-edit controller types (PLAN-0020 CORE-P1B-009B).
 *
 * Interface-only module so the bridge can type its `inline` slot
 * without importing the controller implementation (which itself
 * imports the bridge — the types here break that cycle, following the
 * `studio-controller-types.ts` precedent).
 */

import type {
	InlineTextTarget,
	TiptapDocument,
} from "@anvilkit/contracts/editor";

/** The active session descriptor (public projection). */
export interface InlineEditSession {
	readonly nodeId: string;
	readonly target: InlineTextTarget;
}

/** The §22.3 public controller surface. */
export interface InlineEditController {
	getSession(): InlineEditSession | null;
	subscribe(listener: () => void): () => void;
	/** Commit the current draft (if changed) and exit. */
	commit(): void;
	/** Discard the draft, restore the pre-edit surface, and exit. */
	cancel(): void;
}

/** Controller plus internal seams the canvas surfaces wire up. */
export interface InternalInlineEditController extends InlineEditController {
	/**
	 * Try to start a session from a double-clicked element. Returns
	 * true when a declared target matched (callers then skip
	 * drill-in). Rich (`tiptap`) targets set the session and leave
	 * surface mounting to the rich overlay; plain targets bind the
	 * in-place contenteditable surface immediately.
	 */
	readonly tryEnterFromEvent: (target: Element) => boolean;
	/**
	 * Rich-surface commit path (sanitized document from Tiptap).
	 *
	 * Typed as the declaration's own value union rather than `unknown`
	 * (`p4-007`): `updateInlineTextInData` rejects a `tiptap` value
	 * committed to a `plain` target and vice versa *before* dispatch, and
	 * a caller holding an `unknown` cannot see that constraint at all.
	 */
	readonly commitValue: (value: string | TiptapDocument) => void;
	/** Foreign commit / document replacement interrupt. */
	readonly handleExternalInterrupt: () => void;
}
