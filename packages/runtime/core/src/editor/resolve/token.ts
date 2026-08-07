/**
 * @file Token resolution with mode fallback, compatible-type aliases,
 * and cycle/depth guards (PLAN-0020 CORE-P0-010 + CORE-P2-001;
 * DD-0019 §15.1, §24.5; invariant 8).
 *
 * §15.1, verbatim: resolution "reads the active mode, follows mode
 * fallback, resolves aliases of a compatible type, and fails on a
 * repeated token ID or depth eight". Alias chains are bounded by the
 * frozen §7.3 alias depth (8); a revisited `token:mode` key or an
 * exhausted budget resolves to a cycle result — resolution never
 * throws and never recurses unboundedly on hostile documents.
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
			/**
			 * The mode the winning literal was read from. Differs from the
			 * requested mode when mode fallback applied (§15.1).
			 */
			readonly modeId: string;
	  }
	| { readonly status: "cycle"; readonly path: readonly string[] }
	| { readonly status: "missing-token"; readonly tokenId: string }
	| {
			readonly status: "missing-value";
			readonly tokenId: string;
			readonly modeId: string;
	  }
	| {
			/** An alias pointing at a token of a different {@link TokenType}. */
			readonly status: "type-mismatch";
			readonly tokenId: string;
			readonly aliasTokenId: string;
			readonly expected: TokenType;
			readonly actual: TokenType;
	  };

/**
 * Token types whose literal value **is** a `CssLength` object
 * (`{kind:"unit"|"keyword"|"math"}`), so a resolved reference replaces
 * the `{kind:"token"}` node in place. Every other type sits in a
 * `TokenOrLiteral<T>` slot, whose resolved form is the
 * `{kind:"literal", value}` wrapper.
 */
const LENGTH_VALUED_TOKEN_TYPES: ReadonlySet<TokenType> = new Set([
	"length",
	"radius",
]);

/**
 * The substituted node form of a resolved token value — the single
 * rule shared by preview substitution (`resolveTargetAppearance`) and
 * deletion materialization (`applyTokenDeletion`).
 *
 * Getting this wrong is silent: `CssLength` has no `"literal"`
 * member, so a wrongly-wrapped length falls through
 * `serializeCssLength`'s switch as `undefined` and the property is
 * dropped without a diagnostic. The token's declared `type` is the
 * discriminator — shape alone cannot decide it, because `CssColor`
 * and `CssLength` both have a `{kind:"keyword"}` member.
 */
export function materializeTokenLiteral(
	type: TokenType,
	value: unknown,
): unknown {
	return LENGTH_VALUED_TOKEN_TYPES.has(type)
		? value
		: { kind: "literal", value };
}

/** Options for {@link resolveToken}. */
export interface ResolveTokenOptions {
	/**
	 * Mode consulted when a token carries no value for the requested
	 * mode (§15.1 mode fallback). Typically
	 * `StudioEditorConfig.defaultTokenMode`. Omitted = no fallback: a
	 * token without a value in the requested mode is `missing-value`.
	 */
	readonly defaultModeId?: string;
	/** Recursion guard; callers leave this unset. */
	readonly visited?: ReadonlySet<string>;
}

/**
 * Resolve a token to its literal value for a mode (DD-0019 §24.5).
 * Pure and total: every failure mode is a typed result.
 */
export function resolveToken(
	tokenId: string,
	modeId: string,
	tokens: Readonly<Record<string, DesignToken>>,
	modes: Readonly<Record<string, TokenMode>>,
	options: ResolveTokenOptions = {},
): TokenResolution {
	const visited = options.visited ?? new Set<string>();
	const key = `${tokenId}:${modeId}`;
	if (visited.has(key) || visited.size >= EDITOR_COUNT_LIMITS.tokenAliasDepth) {
		return { status: "cycle", path: [...visited, key] };
	}
	const token = tokens[tokenId];
	if (token === undefined) {
		return { status: "missing-token", tokenId };
	}

	// Active mode first, then the configured fallback mode (§15.1).
	let sourceModeId = modeId;
	let value = token.values[modeId];
	if (
		value === undefined &&
		options.defaultModeId !== undefined &&
		options.defaultModeId !== modeId
	) {
		sourceModeId = options.defaultModeId;
		value = token.values[options.defaultModeId];
	}
	if (value === undefined) {
		return { status: "missing-value", tokenId, modeId };
	}
	if (value.kind === "literal") {
		return {
			status: "resolved",
			value: value.value,
			type: token.type,
			tokenId,
			modeId: sourceModeId,
		};
	}

	// Aliases resolve only to a token of a compatible type (§15.1).
	// Checked before recursion so the mismatch names both endpoints
	// rather than surfacing as a resolved value of the wrong type.
	const target = tokens[value.tokenId];
	if (target !== undefined && target.type !== token.type) {
		return {
			status: "type-mismatch",
			tokenId,
			aliasTokenId: value.tokenId,
			expected: token.type,
			actual: target.type,
		};
	}
	return resolveToken(value.tokenId, modeId, tokens, modes, {
		defaultModeId: options.defaultModeId,
		visited: new Set([...visited, key]),
	});
}
