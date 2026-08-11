/**
 * @file The collaboration authoring gate, enforced at the write
 * (PLAN-0028 `p3-009`; CORE-P1A-013; DD-0019 §7.4; CORE-P0-020
 * freeze §3–§4). Pure, React-free.
 *
 * ### Why this module exists
 *
 * The gate used to be enforced in exactly one place: the deleted
 * `createEditorCommandPort`, which consulted `getWriterGateError`
 * before `execute` and `commitNative`. The canonical write path —
 * `useAppearanceCommit` → `commitAppearanceUpdate` and its siblings —
 * never consulted it, so once the port went away the gate would have
 * become a diagnostic with no teeth and a collaborating author would
 * have gained unguarded writes.
 *
 * Every commit helper therefore takes the gate as an optional
 * dependency and refuses before touching the document. Optional, not
 * required, for two reasons: the pure helpers are used headlessly by
 * tests and by hosts that compose their own chrome, and a document
 * edited outside a collab session has nothing to gate. Absent reads as
 * "writers open", which is the pre-collab behaviour.
 *
 * ### Refusal, never silence
 *
 * A gated write returns `status: "rejected"` carrying the gate's own
 * `EDITOR_COLLAB_ENCODING_UNSUPPORTED` error, so the caller can show
 * the reason. It never returns `"noop"`: "nothing happened" and "the
 * transport cannot merge this" are different facts and an author who
 * cannot tell them apart will keep retrying.
 */

import type { EditorError } from "@anvilkit/contracts/editor";

/**
 * The gate dependency, mixed into every `*CommitDeps` interface.
 *
 * Supplied by the React layer from `StudioEditorBridge.getWriterGateError`.
 */
export interface WriterGateDep {
	/**
	 * The blocking collab error, or `null` when authoring writers may
	 * run. Omitted entirely by headless callers — absent means open.
	 */
	readonly getWriterGateError?: () => EditorError | null;
}

/** The blocking gate error, or `null` when the write may proceed. */
export function writerGateError(deps: WriterGateDep): EditorError | null {
	return deps.getWriterGateError?.() ?? null;
}
