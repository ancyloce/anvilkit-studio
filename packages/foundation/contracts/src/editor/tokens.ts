/**
 * @file Design tokens and token modes (DD-0019 §9.4, §15).
 */

/** Token mode identifier (e.g. a `"light"` / `"dark"` mode pair). */
export type TokenModeId = string;

/**
 * One token mode. Modes are document-scoped; every token carries a
 * value per mode it participates in. The default mode is selected by
 * `StudioEditorConfig.defaultTokenMode`.
 */
export interface TokenMode {
	readonly id: TokenModeId;
	readonly name: string;
}

/** The typed token categories supported in v1 (DD-0019 §9.4). */
export type TokenType =
	| "color"
	| "length"
	| "number"
	| "fontFamily"
	| "fontWeight"
	| "shadow"
	| "radius";

/**
 * A token value for one mode: a literal, or an alias to another
 * document token. Aliases must be acyclic (invariant 8, §7.2); cycle
 * detection lives in the core resolver (§24.5), shape validation in
 * `@anvilkit/schema/editor`.
 */
export type TokenValue<T> =
	| { readonly kind: "literal"; readonly value: T }
	| { readonly kind: "alias"; readonly tokenId: string };

/**
 * Import-as-copy provenance (ADR 0005; DD-0019 §9.4). Records that a
 * token was created by importing a value from another token system.
 * Metadata only: resolution ignores it, values remain ordinary
 * literals or document-token aliases, and generated output never
 * varies on it. It never creates a live cross-system alias.
 */
export interface DesignTokenSource {
	readonly system: "theme" | "brand";
	readonly ref: string;
}

/** A document-local design token (DD-0019 §9.4). */
export interface DesignToken<T = unknown> {
	readonly id: string;
	readonly path: readonly string[];
	readonly name: string;
	readonly type: TokenType;
	readonly values: Readonly<Record<TokenModeId, TokenValue<T>>>;
	readonly description?: string;
	readonly source?: DesignTokenSource;
}
