/**
 * @file Token resolution with cycle and depth guards
 * (PLAN-0020 CORE-P0-010; DD-0019 §24.5; invariant 8).
 *
 * Alias chains are bounded by the frozen §7.3 alias depth (8); a
 * revisited `token:mode` key or an exhausted budget resolves to a
 * cycle result — resolution never throws and never recurses
 * unboundedly on hostile documents.
 */

import type {
	DesignToken,
	TokenMode,
	TokenType,
} from "@anvilkit/contracts/editor";
import { EDITOR_COUNT_LIMITS } from "@anvilkit/contracts/editor";

/** The outcome of resolving one token in one mode. */
export type TokenResolution =
	| {
			readonly status: "resolved";
			readonly value: unknown;
			readonly type: TokenType;
			/** The literal-bearing token at the end of the alias chain. */
			readonly tokenId: string;
	  }
	| { readonly status: "cycle"; readonly path: readonly string[] }
	| { readonly status: "missing-token"; readonly tokenId: string }
	| {
			readonly status: "missing-value";
			readonly tokenId: string;
			readonly modeId: string;
	  };

/**
 * Resolve a token to its literal value for a mode (DD-0019 §24.5).
 * Pure and total: every failure mode is a typed result.
 */
export function resolveToken(
	tokenId: string,
	modeId: string,
	tokens: Readonly<Record<string, DesignToken>>,
	modes: Readonly<Record<string, TokenMode>>,
	visited: ReadonlySet<string> = new Set(),
): TokenResolution {
	const key = `${tokenId}:${modeId}`;
	if (visited.has(key) || visited.size >= EDITOR_COUNT_LIMITS.tokenAliasDepth) {
		return { status: "cycle", path: [...visited, key] };
	}
	const token = tokens[tokenId];
	if (token === undefined) {
		return { status: "missing-token", tokenId };
	}
	const value = token.values[modeId];
	if (value === undefined) {
		return { status: "missing-value", tokenId, modeId };
	}
	if (value.kind === "literal") {
		return {
			status: "resolved",
			value: value.value,
			type: token.type,
			tokenId,
		};
	}
	return resolveToken(
		value.tokenId,
		modeId,
		tokens,
		modes,
		new Set([...visited, key]),
	);
}
