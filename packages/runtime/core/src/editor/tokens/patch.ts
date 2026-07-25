/**
 * @file `token.update` patch application (PLAN-0020 CORE-P2-001).
 *
 * Shared by validation (which needs the *prospective* token to check
 * the alias graph before commit) and reduction (which writes it), so
 * the graph that was validated is exactly the graph that lands.
 */

import type { DesignToken, EditorPatch } from "@anvilkit/contracts/editor";
import { applyEditorPatch } from "../patch.js";

/**
 * Apply a token patch. `id` is immutable (it is not part of the patch
 * type) and is always carried through, so the result is a complete
 * token even when the patch empties every other field.
 */
export function applyTokenPatch(
	token: DesignToken,
	patch: EditorPatch<Omit<DesignToken, "id">>,
): DesignToken {
	const next = applyEditorPatch<DesignToken>(
		token,
		patch as EditorPatch<DesignToken>,
	);
	if (next === undefined) {
		return token;
	}
	return next.id === token.id ? next : { ...next, id: token.id };
}
