"use client";

/**
 * @file Text round-trip for a token's stored literal, so the
 * design-system panel can edit the value types authors actually use.
 *
 * ### Why this exists
 *
 * The panel used to render every literal with `String(value)` and, for
 * anything object-shaped, gave up: `length`, `radius` and `color`
 * literals are `CssLength` / `CssColor` objects, `String()` turns them
 * into `[object Object]`, and writing that back would replace the
 * object with the string. The stopgap was to show them read-only —
 * which meant the two most common token types could not be edited at
 * all. A token created from a field's value (the picker's usual path)
 * always lands in exactly that shape, so in practice the panel could
 * only edit tokens nobody had.
 *
 * Display reuses the engine's own serializers
 * (`serializeCssLength` / `serializeCssColor`) so the panel shows the
 * same text the stylesheet emits. Parsing is the inverse, and is
 * deliberately strict: an unparsable draft is REJECTED (the caller
 * keeps it local and surfaces a message) rather than coerced, because
 * a silent coercion is what corrupted the stored shape before.
 *
 * `shadow` and any other structured literal stay read-only — those are
 * multi-field records, not a value a single text input should own.
 */

import type {
	CssColor,
	CssLength,
	CssUnit,
	TokenType,
} from "@anvilkit/contracts/editor";
import {
	serializeCssColor,
	serializeCssLength,
} from "../../../editor/index.js";

const UNITS: readonly CssUnit[] = [
	"px",
	"rem",
	"em",
	"%",
	"vw",
	"vh",
	"dvw",
	"dvh",
	"fr",
];

const LENGTH_KEYWORDS = [
	"auto",
	"min-content",
	"max-content",
	"fit-content",
] as const;

/** Token types whose literal is a `CssLength`. */
const LENGTH_TYPES: ReadonlySet<TokenType> = new Set(["length", "radius"]);

/** How a stored literal is shown, and whether it can be edited as text. */
export interface TokenLiteralText {
	readonly text: string;
	readonly editable: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

/** Render a token literal for its input. */
export function formatTokenLiteral(
	type: TokenType,
	value: unknown,
): TokenLiteralText {
	if (value === undefined || value === null) {
		return { text: "", editable: true };
	}
	if (!isRecord(value)) {
		return { text: String(value), editable: true };
	}
	if (LENGTH_TYPES.has(type)) {
		const text = serializeCssLength(value as CssLength);
		// `null` = a token reference or a math expression: real values,
		// but not ones a plain text field should rewrite.
		return text === null
			? { text: JSON.stringify(value), editable: false }
			: { text, editable: true };
	}
	if (type === "color") {
		return { text: serializeCssColor(value as CssColor), editable: true };
	}
	// Structured literals (shadow, and anything added later) stay
	// visible but read-only rather than silently corruptible.
	return { text: JSON.stringify(value), editable: false };
}

/** A parsed literal, or `null` when the text is not valid for `type`. */
export function parseTokenLiteral(
	type: TokenType,
	text: string,
): { readonly value: unknown } | null {
	const trimmed = text.trim();

	if (type === "number") {
		const next = Number(trimmed);
		return trimmed.length > 0 && Number.isFinite(next) ? { value: next } : null;
	}

	if (LENGTH_TYPES.has(type)) {
		const keyword = LENGTH_KEYWORDS.find((entry) => entry === trimmed);
		if (keyword !== undefined) {
			return { value: { kind: "keyword", keyword } satisfies CssLength };
		}
		const match = /^(-?\d*\.?\d+)([a-z%]+)$/i.exec(trimmed);
		const unit = match?.[2] as CssUnit | undefined;
		if (match === null || unit === undefined || !UNITS.includes(unit)) {
			return null;
		}
		const amount = Number(match[1]);
		return Number.isFinite(amount)
			? { value: { kind: "unit", value: amount, unit } satisfies CssLength }
			: null;
	}

	if (type === "color") {
		if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(trimmed)) {
			return { value: { kind: "hex", value: trimmed } satisfies CssColor };
		}
		const rgba =
			/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?\)$/i.exec(
				trimmed,
			);
		if (rgba !== null) {
			const [r, g, b] = [rgba[1], rgba[2], rgba[3]].map(Number) as [
				number,
				number,
				number,
			];
			const a = rgba[4] === undefined ? 1 : Number(rgba[4]);
			return [r, g, b].every((channel) => channel >= 0 && channel <= 255) &&
				a >= 0 &&
				a <= 1
				? { value: { kind: "rgba", r, g, b, a } satisfies CssColor }
				: null;
		}
		// A bare CSS keyword (`transparent`, `currentColor`, a named
		// colour) is a legitimate `CssColor`.
		return /^[a-z]+$/i.test(trimmed)
			? { value: { kind: "keyword", keyword: trimmed } as CssColor }
			: null;
	}

	// `fontFamily` / `fontWeight` and friends store plain strings.
	return { value: trimmed };
}
