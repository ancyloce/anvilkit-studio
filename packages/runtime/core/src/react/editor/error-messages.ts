/**
 * @file `EditorError` → `studio.editor.error.*` message keys
 * (PLAN-0020 CORE-P1A-018 / EP-23; REVIEW-0019 §2 P2).
 *
 * ### Why a lookup and not a field on `EditorError`
 *
 * `EditorError.message` is minted by the React-free engine
 * (`@anvilkit/core/editor`), which has no catalog, no locale and no
 * business acquiring either — so every message it produces is an
 * English developer string. Rendering one in a shipped surface breaks
 * the EP-23 acceptance criterion ("zero unlocalized strings in shipped
 * editor surfaces") in three of the four supported locales.
 *
 * The fix does **not** need a contract change. `EditorErrorCode` is a
 * frozen, closed 14-member union (contract freeze CORE-P0-001 §8: "sub-
 * cases are distinguished via `details`, never via new codes"), so the
 * code alone is a stable, exhaustive translation key — and
 * {@link EDITOR_ERROR_MESSAGE_KEYS} being a total `Record` makes the
 * compiler enforce that. Adding an optional `messageKey` to the frozen
 * envelope instead would have required every mint site in the engine to
 * carry catalog knowledge for no extra fidelity.
 *
 * Specificity is not lost: `message` stays available as the
 * developer-facing detail (and as `useMsg`'s fallback if a catalog is
 * incomplete), and `details` carries the machine-readable specifics —
 * the localized text is the sentence an *author* can act on, the raw
 * message is the one an engineer can debug.
 */

import type { EditorErrorCode } from "@anvilkit/contracts/editor";

/**
 * Every frozen error code's catalog key. Total by type, so a future
 * code addition (a contracts change, which requires API review) fails
 * `tsc` here rather than silently rendering an English literal.
 */
export const EDITOR_ERROR_MESSAGE_KEYS: Readonly<
	Record<EditorErrorCode, string>
> = {
	EDITOR_CONTRACT_UNSUPPORTED_VERSION:
		"studio.editor.error.contractUnsupportedVersion",
	EDITOR_NODE_NOT_FOUND: "studio.editor.error.nodeNotFound",
	EDITOR_NODE_LOCKED: "studio.editor.error.nodeLocked",
	EDITOR_CAPABILITY_UNSUPPORTED: "studio.editor.error.capabilityUnsupported",
	EDITOR_INVALID_CSS_VALUE: "studio.editor.error.invalidCssValue",
	EDITOR_TOKEN_CYCLE: "studio.editor.error.tokenCycle",
	EDITOR_COMPONENT_CYCLE: "studio.editor.error.componentCycle",
	EDITOR_BREAKPOINT_INVALID: "studio.editor.error.breakpointInvalid",
	EDITOR_EXPORTER_UNSUPPORTED: "studio.editor.error.exporterUnsupported",
	EDITOR_COMMAND_CONFLICT: "studio.editor.error.commandConflict",
	EDITOR_DEFINITION_REFERENCED: "studio.editor.error.definitionReferenced",
	EDITOR_DEFINITION_UNAVAILABLE: "studio.editor.error.definitionUnavailable",
	EDITOR_COLLAB_ENCODING_UNSUPPORTED:
		"studio.editor.error.collabEncodingUnsupported",
	EDITOR_LIMIT_EXCEEDED: "studio.editor.error.limitExceeded",
};

/**
 * The catalog key for an editor error code.
 *
 * Hosts render `EditorError`s themselves (Core ships no diagnostics UI
 * of its own — see `EditorDiagnosticPort`), so this is exported for
 * them, not only for Core's own dialogs.
 *
 * @example
 * ```tsx
 * const msg = useMsg();
 * // Localized author-facing text; the engine's English message is the
 * // developer-facing fallback if the catalog lacks the key.
 * <p>{msg(editorErrorMessageKey(error.code), error.message)}</p>
 * ```
 */
export function editorErrorMessageKey(code: EditorErrorCode): string {
	return EDITOR_ERROR_MESSAGE_KEYS[code];
}
