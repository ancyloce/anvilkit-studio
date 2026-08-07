/**
 * @file Token deletion planning and rewriting (PLAN-0020
 * CORE-P2-001; ED-TOKEN-003; DD-0019 §15.1).
 *
 * `planTokenDeletion` produces the impact preview the UI shows before
 * asking for confirmation; `applyTokenDeletion` performs the rewrite
 * the reducer commits. Both run the same {@link mapAuthoringTokens}
 * walk over the same state, so the approved impact and the committed
 * change cannot diverge.
 */

import type {
	EditorError,
	TokenDeletionDisposition,
} from "@anvilkit/contracts/editor";
import type {
	AuthoringStateV1,
} from "../legacy/index.js";
import { makeEditorError } from "../diagnostics.js";
import { materializeTokenLiteral, resolveToken } from "../resolve/token.js";
import { aliasDependents, collectTokenUsage } from "./usage.js";
import { mapAuthoringTokens, type TokenUsageSite } from "./walk.js";

/** The impact preview shown before a token is deleted (ED-TOKEN-003). */
export interface TokenDeletionPlan {
	readonly tokenId: string;
	/** Every reference that the deletion rewrites. */
	readonly sites: readonly TokenUsageSite[];
	/** Tokens whose alias values point at the deleted token. */
	readonly aliasDependents: readonly string[];
	readonly disposition: TokenDeletionDisposition;
	/**
	 * Blocking problems (`severity: "error"`) plus advisory notes. A
	 * plan with any error must not be dispatched; the same checks run
	 * in command validation, so a rejected plan cannot slip through.
	 */
	readonly errors: readonly EditorError[];
}

/** Inputs shared by planning and rewriting. */
export interface TokenDeletionContext {
	/** Mode whose resolved literal is written back when materializing. */
	readonly tokenMode: string;
	/** Fallback mode for tokens without a value in `tokenMode` (§15.1). */
	readonly defaultTokenMode?: string;
}

/**
 * Compute the impact preview for deleting `tokenId` (ED-TOKEN-003:
 * "show impact and replacement options before deletion").
 */
export function planTokenDeletion(
	state: AuthoringStateV1,
	tokenId: string,
	disposition: TokenDeletionDisposition,
	context: TokenDeletionContext,
): TokenDeletionPlan {
	const errors: EditorError[] = [];
	const token = state.tokens[tokenId];
	const index = collectTokenUsage(state);
	const sites = index.get(tokenId) ?? [];

	if (token === undefined) {
		errors.push(
			makeEditorError(
				"EDITOR_NODE_NOT_FOUND",
				`token "${tokenId}" is not in this document`,
				{ details: { kind: "token", tokenId } },
			),
		);
	}

	if (disposition.kind === "replace") {
		const replacement = state.tokens[disposition.tokenId];
		if (disposition.tokenId === tokenId) {
			errors.push(
				makeEditorError(
					"EDITOR_COMMAND_CONFLICT",
					"a token cannot be replaced by itself",
					{ details: { kind: "token", tokenId, reason: "self-replacement" } },
				),
			);
		} else if (replacement === undefined) {
			errors.push(
				makeEditorError(
					"EDITOR_NODE_NOT_FOUND",
					`replacement token "${disposition.tokenId}" is not in this document`,
					{ details: { kind: "token", tokenId: disposition.tokenId } },
				),
			);
		} else if (token !== undefined && replacement.type !== token.type) {
			// §15.1: aliases and replacements resolve only across a
			// compatible type — a color reference cannot become a length.
			errors.push(
				makeEditorError(
					"EDITOR_INVALID_CSS_VALUE",
					`replacement token "${disposition.tokenId}" has type "${replacement.type}", expected "${token.type}"`,
					{
						details: {
							kind: "token",
							reason: "token-type-mismatch",
							tokenId,
							replacementTokenId: disposition.tokenId,
							expected: token.type,
							actual: replacement.type,
						},
					},
				),
			);
		}
	}

	if (disposition.kind === "materialize" && token !== undefined) {
		// Surface unresolvable values now: materializing them would
		// silently drop the reference instead of preserving appearance.
		const resolution = resolveToken(
			tokenId,
			context.tokenMode,
			state.tokens,
			state.tokenModes,
			{ defaultModeId: context.defaultTokenMode },
		);
		if (resolution.status !== "resolved" && sites.length > 0) {
			errors.push(
				makeEditorError(
					"EDITOR_INVALID_CSS_VALUE",
					`token "${tokenId}" cannot be resolved in mode "${context.tokenMode}", so its ${sites.length} reference(s) cannot be materialized`,
					{
						severity: "warning",
						details: {
							kind: "token",
							reason: "unresolvable-materialization",
							tokenId,
							status: resolution.status,
						},
					},
				),
			);
		}
	}

	return {
		tokenId,
		sites,
		aliasDependents: aliasDependents(index, tokenId),
		disposition,
		errors,
	};
}

/**
 * Rewrite every reference to `tokenId` per `disposition` and remove
 * the token. Pure; returns `state` by identity when the token is
 * absent and nothing needs rewriting.
 *
 * Unresolvable materialization leaves the reference untouched rather
 * than dropping it — the renderer's §25 fallback and the diagnostic
 * from `planTokenDeletion` are strictly better than silent loss.
 */
export function applyTokenDeletion(
	state: AuthoringStateV1,
	tokenId: string,
	disposition: TokenDeletionDisposition,
	context: TokenDeletionContext,
): AuthoringStateV1 {
	const token = state.tokens[tokenId];
	if (token === undefined) {
		return state;
	}

	// Resolve once against the pre-deletion state: the literal written
	// back is what the document rendered before the delete.
	const resolution =
		disposition.kind === "materialize"
			? resolveToken(
					tokenId,
					context.tokenMode,
					state.tokens,
					state.tokenModes,
					{ defaultModeId: context.defaultTokenMode },
				)
			: undefined;

	const rewritten = mapAuthoringTokens(state, (referencedId, site) => {
		if (referencedId !== tokenId) {
			return undefined;
		}
		if (disposition.kind === "replace") {
			return site.kind === "tokenAlias"
				? { kind: "alias", tokenId: disposition.tokenId }
				: { kind: "token", tokenId: disposition.tokenId };
		}
		if (resolution === undefined || resolution.status !== "resolved") {
			return undefined;
		}
		return site.kind === "tokenAlias"
			? { kind: "literal", value: resolution.value }
			: materializeTokenLiteral(resolution.type, resolution.value);
	});

	const nextTokens = { ...rewritten.tokens };
	delete nextTokens[tokenId];
	return { ...rewritten, tokens: nextTokens };
}
