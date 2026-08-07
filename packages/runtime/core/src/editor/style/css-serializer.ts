/**
 * @file Allowlisted typed-CSS serializer (PLAN-0020 CORE-P0-018;
 * DD-0019 §9.3; DD-DEC-007).
 *
 * The only path from typed values to CSS text. Emits values built
 * from the closed §9.3 grammar — number+unit, safe keywords,
 * AST-built `calc`/`min`/`max`/`clamp` — and never emits
 * `!important`. Unresolved token references serialize to `null`
 * (callers skip the property and surface a diagnostic): tokens are
 * resolved by `resolveTargetAppearance` *before* serialization.
 */

import type {
	BorderEdge,
	CssColor,
	CssLength,
	CssMathExpression,
	FilterSpec,
	GridTrackList,
	Paint,
	ShadowSpec,
	TokenOrLiteral,
} from "@anvilkit/contracts/editor";

/** Serialize a math expression; `op` roots wrap in `calc()`. */
export function serializeCssMath(expression: CssMathExpression): string | null {
	const inner = serializeMathInner(expression);
	if (inner === null) {
		return null;
	}
	return expression.kind === "op" ? `calc(${inner})` : inner;
}

function serializeMathInner(expression: CssMathExpression): string | null {
	switch (expression.kind) {
		case "unit":
			return `${expression.value}${expression.unit}`;
		case "number":
			return String(expression.value);
		case "token":
			return null;
		case "op": {
			const left = serializeMathInner(expression.left);
			const right = serializeMathInner(expression.right);
			if (left === null || right === null) {
				return null;
			}
			const wrap = (part: CssMathExpression, text: string) =>
				part.kind === "op" ? `(${text})` : text;
			return `${wrap(expression.left, left)} ${expression.operator} ${wrap(
				expression.right,
				right,
			)}`;
		}
		case "fn": {
			const args = expression.args.map(serializeMathInner);
			if (args.some((argument) => argument === null)) {
				return null;
			}
			return `${expression.fn}(${args.join(", ")})`;
		}
	}
}

/** Serialize a typed length. Token refs return `null` (unresolved). */
export function serializeCssLength(value: CssLength): string | null {
	switch (value.kind) {
		case "unit":
			return `${value.value}${value.unit}`;
		case "keyword":
			return value.keyword;
		case "token":
			return null;
		case "math":
			return serializeCssMath(value.expression);
	}
}

/** Serialize a typed color. */
export function serializeCssColor(value: CssColor): string {
	switch (value.kind) {
		case "hex":
			return value.value;
		case "rgba":
			return `rgba(${value.r}, ${value.g}, ${value.b}, ${value.a})`;
		case "hsla":
			return `hsla(${value.h}, ${value.s * 100}%, ${value.l * 100}%, ${value.a})`;
		case "keyword":
			return value.keyword;
	}
}

/** Unwrap a resolved `TokenOrLiteral`; token refs return `null`. */
export function serializeTokenOrLiteral<T>(
	value: TokenOrLiteral<T>,
	serialize: (literal: T) => string | null,
): string | null {
	return value.kind === "literal" ? serialize(value.value) : null;
}

function escapeUrl(src: string): string {
	return src
		.replace(/\\/g, "\\\\")
		.replace(/"/g, '\\"')
		.replace(/[\n\r]/g, "");
}

/** Serialize a paint into `background` shorthand text. */
export function serializePaint(paint: Paint): string | null {
	switch (paint.kind) {
		case "none":
			return "none";
		case "solid":
			return serializeTokenOrLiteral(paint.color, serializeCssColor);
		case "linear-gradient": {
			const stops = paint.stops.map((stop) => {
				const color = serializeTokenOrLiteral(stop.color, serializeCssColor);
				return color === null
					? null
					: `${color} ${Math.round(stop.offset * 10000) / 100}%`;
			});
			if (stops.some((stop) => stop === null)) {
				return null;
			}
			return `linear-gradient(${paint.angle}deg, ${stops.join(", ")})`;
		}
		case "image": {
			const parts = [`url("${escapeUrl(paint.src)}")`];
			return parts.join(" ");
		}
	}
}

/** Serialize one shadow layer for `box-shadow`. */
export function serializeShadow(shadow: ShadowSpec): string | null {
	const offsetX = serializeCssLength(shadow.offsetX);
	const offsetY = serializeCssLength(shadow.offsetY);
	const blur = serializeCssLength(shadow.blur);
	const spread =
		shadow.spread === undefined ? "" : serializeCssLength(shadow.spread);
	const color = serializeTokenOrLiteral(shadow.color, serializeCssColor);
	if (offsetX === null || offsetY === null || blur === null || color === null) {
		return null;
	}
	if (shadow.spread !== undefined && spread === null) {
		return null;
	}
	const inset = shadow.kind === "inner" ? "inset " : "";
	const spreadPart = spread === "" ? "" : ` ${spread}`;
	return `${inset}${offsetX} ${offsetY} ${blur}${spreadPart} ${color}`;
}

/** Serialize a filter spec into `filter` function list text. */
export function serializeFilter(filter: FilterSpec): string | null {
	const parts: string[] = [];
	if (filter.blur !== undefined) {
		const blur = serializeCssLength(filter.blur);
		if (blur === null) {
			return null;
		}
		parts.push(`blur(${blur})`);
	}
	if (filter.brightness !== undefined) {
		parts.push(`brightness(${filter.brightness})`);
	}
	if (filter.contrast !== undefined) {
		parts.push(`contrast(${filter.contrast})`);
	}
	if (filter.saturate !== undefined) {
		parts.push(`saturate(${filter.saturate})`);
	}
	if (filter.grayscale !== undefined) {
		parts.push(`grayscale(${filter.grayscale})`);
	}
	return parts.length === 0 ? null : parts.join(" ");
}

/** Serialize a grid track list for `grid-template-*`. */
export function serializeGridTracks(tracks: GridTrackList): string | null {
	const parts = tracks.map((track) => {
		switch (track.kind) {
			case "fixed":
				return serializeCssLength(track.length);
			case "fr":
				return `${track.value}fr`;
			case "auto":
				return "auto";
		}
	});
	if (parts.some((part) => part === null) || parts.length === 0) {
		return null;
	}
	return parts.join(" ");
}

/** Serialize one border edge into `border-<edge>` shorthand text. */
export function serializeBorderEdge(edge: BorderEdge): string | null {
	const parts: string[] = [];
	if (edge.width !== undefined) {
		const width = serializeCssLength(edge.width);
		if (width === null) {
			return null;
		}
		parts.push(width);
	}
	if (edge.style !== undefined) {
		parts.push(edge.style);
	}
	if (edge.color !== undefined) {
		const color = serializeTokenOrLiteral(edge.color, serializeCssColor);
		if (color === null) {
			return null;
		}
		parts.push(color);
	}
	return parts.length === 0 ? null : parts.join(" ");
}
