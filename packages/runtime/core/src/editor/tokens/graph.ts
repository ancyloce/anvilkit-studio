/**
 * @file Alias-graph checks for token writes (PLAN-0020 CORE-P2-001;
 * ED-TOKEN-002; DD-0019 §15.1, §24.5; invariant 8).
 *
 * §15.1: resolution "resolves aliases of a compatible type, and fails
 * on a repeated token ID or depth eight". These run at command
 * validation against the *prospective* token map, so a cycle or a
 * cross-type alias is rejected before it can be committed — invariant
 * 8 ("token aliases are acyclic") is enforced on the write path, not
 * only diagnosed on the read path.
 */

import type {
	DesignToken,
	EditorError,
	TokenMode,
} from "@anvilkit/contracts/editor";
import { makeEditorError } from "../diagnostics.js";
import { resolveToken } from "../resolve/token.js";

/**
 * Check every mode of one token against the alias graph it would
 * belong to. Returns blocking errors for cycles and incompatible
 * alias types; an empty array means the write is safe.
 *
 * Missing alias targets are **not** errors here: a token may
 * legitimately point at one written later in the same batch, and
 * unresolvable references already surface as read-path diagnostics.
 */
export function checkTokenAliasGraph(
	tokenId: string,
	tokens: Readonly<Record<string, DesignToken>>,
	modes: Readonly<Record<string, TokenMode>>,
): readonly EditorError[] {
	const token = tokens[tokenId];
	if (token === undefined) {
		return [];
	}
	const errors: EditorError[] = [];
	for (const modeId of Object.keys(token.values)) {
		const resolution = resolveToken(tokenId, modeId, tokens, modes);
		if (resolution.status === "cycle") {
			errors.push(
				makeEditorError(
					"EDITOR_TOKEN_CYCLE",
					`token "${tokenId}" would introduce an alias cycle in mode "${modeId}"`,
					{
						details: { kind: "token", tokenId, modeId, path: resolution.path },
					},
				),
			);
			// One cycle report per token is enough; every mode on a
			// cyclic chain would repeat the same path.
			break;
		}
		if (resolution.status === "type-mismatch") {
			errors.push(
				makeEditorError(
					"EDITOR_INVALID_CSS_VALUE",
					`token "${resolution.tokenId}" aliases "${resolution.aliasTokenId}" of incompatible type "${resolution.actual}" (expected "${resolution.expected}")`,
					{
						details: {
							kind: "token",
							reason: "token-type-mismatch",
							tokenId: resolution.tokenId,
							aliasTokenId: resolution.aliasTokenId,
							modeId,
							expected: resolution.expected,
							actual: resolution.actual,
						},
					},
				),
			);
		}
	}
	return errors;
}
