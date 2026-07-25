/**
 * @file Design tokens and token modes (DD-0019 §9.4, §15).
 */

import type { JsonValue } from "./values.js";

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

/**
 * A value from another token system that the picker offers for
 * **import-as-copy** (ADR 0005 Part 2 §3).
 *
 * Deliberately static host-supplied data, not a live adapter:
 * importing creates an ordinary document token whose value is the
 * copied literal plus a {@link DesignTokenSource} provenance record.
 * Resolution never consults this list again, so a document renders and
 * exports identically under any host — the property that ruled out
 * live cross-system aliases in v1. Active re-sync and drift detection
 * need the token-source adapter deferred to a future design.
 */
export interface ImportableTokenValue {
	readonly system: DesignTokenSource["system"];
	/** Stable reference recorded as `DesignTokenSource.ref`. */
	readonly ref: string;
	/** Human-readable name shown in the picker. */
	readonly label: string;
	readonly type: TokenType;
	/** The resolved literal copied into the created document token. */
	readonly value: JsonValue;
}

/**
 * What happens to every reference to a token being deleted
 * (ED-TOKEN-003; DD-0019 §15.1 "show impact and replacement options
 * before deletion").
 *
 * `"materialize"` rewrites each reference to the token's resolved
 * literal so the document keeps its current appearance — the default
 * the deletion UI pre-selects, mirroring the same rule for style
 * definitions (§15.1). `"replace"` repoints every reference at
 * another token, which must be of the same {@link TokenType}.
 */
export type TokenDeletionDisposition =
	| { readonly kind: "materialize" }
	| { readonly kind: "replace"; readonly tokenId: string };
