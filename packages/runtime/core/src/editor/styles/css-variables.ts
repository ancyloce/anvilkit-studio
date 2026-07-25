/**
 * @file Stable CSS custom-property names for exporters
 * (PLAN-0020 CORE-P2-003; DD-0019 §15.1).
 *
 * §15.1, verbatim: "Variable names use a path slug plus stable
 * ID/hash so human-readable renames do not break generated CSS
 * integrations."
 *
 * The slug is cosmetic — it makes generated CSS readable. The hash is
 * load-bearing: it is derived from the immutable id, so renaming a
 * token or style definition changes the slug but not the suffix, and
 * a consumer that keyed off the full variable name still has a stable
 * component to match on.
 */

import type {
	DesignToken,
	StyleDefinitionV1,
} from "@anvilkit/contracts/editor";

/** Namespace prefixes, kept distinct so the two spaces cannot collide. */
const TOKEN_PREFIX = "--ak-tok";
const STYLE_PREFIX = "--ak-sd";

/** Characters legal in a CSS custom-property ident, conservatively. */
function slugify(parts: readonly string[]): string {
	const joined = parts
		.join("-")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return joined === "" ? "x" : joined;
}

/**
 * A short, stable, non-cryptographic hash of an id (FNV-1a, base36).
 *
 * Not a security primitive — it only has to be deterministic and
 * collision-resistant enough to disambiguate ids that slugify to the
 * same string, so `crypto.subtle` (async, and unavailable in the
 * React-free engine's sync call sites) would be the wrong tool.
 */
export function stableIdHash(id: string): string {
	let hash = 0x811c9dc5;
	for (let index = 0; index < id.length; index += 1) {
		hash ^= id.charCodeAt(index);
		// FNV prime 16777619, via shifts to stay in 32-bit range.
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash.toString(36).padStart(7, "0").slice(-7);
}

/**
 * The CSS custom-property name for a document token. Uses the token's
 * `path` (its authored grouping) plus the id hash.
 */
export function tokenCssVariableName(token: DesignToken): string {
	return `${TOKEN_PREFIX}-${slugify(token.path.length > 0 ? token.path : [token.name])}-${stableIdHash(token.id)}`;
}

/**
 * The CSS custom-property name for a reusable style definition.
 * Style definitions carry no `path`, so the readable part comes from
 * the name — which is exactly why the id hash is appended.
 */
export function styleDefinitionCssVariableName(
	definition: StyleDefinitionV1,
): string {
	return `${STYLE_PREFIX}-${slugify([definition.name])}-${stableIdHash(definition.id)}`;
}
