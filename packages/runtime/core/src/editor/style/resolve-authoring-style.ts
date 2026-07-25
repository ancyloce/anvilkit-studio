/**
 * @file `resolveAuthoringStyle` — the single style-materialization
 * implementation shared by preview and export (PLAN-0020
 * CORE-P0-018; DD-0019 §11.4, §23.1; DD-DEC-007).
 *
 * Layering (v1.1 clarification): this lives in `@anvilkit/core/editor`
 * — `@anvilkit/ir` is a foundation package and cannot import core, so
 * the export pipeline (extensions/apps layer) calls this same
 * function and hands `ir/editor` a pre-resolved model. Preview and
 * export therefore share every step through the resolved page model.
 *
 * Never emits `!important` — overriding a component's own styles
 * produces a component-author diagnostic instead (§11.4).
 */

import type {
	EditorError,
	LayoutSpec,
	TypographySpec,
	VisualStyleSpec,
} from "@anvilkit/contracts/editor";
import { makeEditorError } from "../diagnostics.js";
import {
	serializeBorderEdge,
	serializeCssColor,
	serializeCssLength,
	serializeFilter,
	serializeGridTracks,
	serializePaint,
	serializeShadow,
	serializeTokenOrLiteral,
} from "./css-serializer.js";

/** The DOM application payload (DD-0019 §11.4, verbatim shape). */
export interface ResolvedAuthoringStyle {
	readonly classNames: readonly string[];
	readonly inlineStyle: Readonly<Record<string, string | number>>;
	readonly dataAttributes: Readonly<Record<string, string>>;
	readonly diagnostics: readonly EditorError[];
}

/** The resolved (post-token) node families to materialize. */
export interface ResolvedNodeStyleInput {
	readonly nodeId: string;
	readonly layout?: Partial<LayoutSpec>;
	readonly style?: Partial<VisualStyleSpec>;
	readonly typography?: Partial<TypographySpec>;
	readonly hidden?: boolean;
}

type StyleSink = {
	style: Record<string, string | number>;
	diagnostics: EditorError[];
	nodeId: string;
};

function put(
	sink: StyleSink,
	property: string,
	value: string | number | null | undefined,
): void {
	if (value === null) {
		sink.diagnostics.push(
			makeEditorError(
				"EDITOR_INVALID_CSS_VALUE",
				`property "${property}" contains an unresolved token reference`,
				{
					severity: "warning",
					nodeIds: [sink.nodeId],
					details: { property, reason: "unresolved-token" },
				},
			),
		);
		return;
	}
	if (value !== undefined) {
		sink.style[property] = value;
	}
}

function putLength(
	sink: StyleSink,
	property: string,
	value: Parameters<typeof serializeCssLength>[0] | undefined,
): void {
	if (value !== undefined) {
		put(sink, property, serializeCssLength(value));
	}
}

function applyLayout(sink: StyleSink, layout: Partial<LayoutSpec>): void {
	put(sink, "display", layout.display);
	if (layout.direction !== undefined) {
		put(sink, "flex-direction", layout.direction);
	}
	if (layout.wrap !== undefined) {
		put(sink, "flex-wrap", layout.wrap);
	}
	put(sink, "align-items", layout.alignItems);
	put(sink, "justify-content", layout.justifyContent);
	putLength(sink, "gap", layout.gap);
	putLength(sink, "row-gap", layout.rowGap);
	putLength(sink, "column-gap", layout.columnGap);
	if (layout.columns !== undefined) {
		put(sink, "grid-template-columns", serializeGridTracks(layout.columns));
	}
	if (layout.rows !== undefined) {
		put(sink, "grid-template-rows", serializeGridTracks(layout.rows));
	}
	for (const [group, property] of [
		["padding", "padding"],
		["margin", "margin"],
		["inset", "inset"],
	] as const) {
		const edges = layout[group];
		if (edges === undefined) {
			continue;
		}
		const prefix = property === "inset" ? "" : `${property}-`;
		putLength(sink, property === "inset" ? "top" : `${prefix}top`, edges.top);
		putLength(
			sink,
			property === "inset" ? "right" : `${prefix}right`,
			edges.right,
		);
		putLength(
			sink,
			property === "inset" ? "bottom" : `${prefix}bottom`,
			edges.bottom,
		);
		putLength(
			sink,
			property === "inset" ? "left" : `${prefix}left`,
			edges.left,
		);
	}
	putLength(sink, "width", layout.width);
	putLength(sink, "height", layout.height);
	putLength(sink, "min-width", layout.minWidth);
	putLength(sink, "max-width", layout.maxWidth);
	putLength(sink, "min-height", layout.minHeight);
	putLength(sink, "max-height", layout.maxHeight);
	put(sink, "position", layout.position);
	put(sink, "overflow", layout.overflow);
	if (layout.zIndex !== undefined) {
		put(sink, "z-index", layout.zIndex);
	}
}

function applyVisualStyle(
	sink: StyleSink,
	style: Partial<VisualStyleSpec>,
): void {
	if (style.background !== undefined) {
		put(sink, "background", serializePaint(style.background));
	}
	if (style.border !== undefined) {
		for (const edge of ["top", "right", "bottom", "left"] as const) {
			const spec = style.border[edge];
			if (spec !== undefined) {
				put(sink, `border-${edge}`, serializeBorderEdge(spec));
			}
		}
	}
	if (style.radius !== undefined) {
		const corners = [
			["border-top-left-radius", style.radius.topLeft],
			["border-top-right-radius", style.radius.topRight],
			["border-bottom-right-radius", style.radius.bottomRight],
			["border-bottom-left-radius", style.radius.bottomLeft],
		] as const;
		for (const [property, value] of corners) {
			putLength(sink, property, value);
		}
	}
	if (style.opacity !== undefined) {
		put(sink, "opacity", style.opacity);
	}
	if (style.shadows !== undefined && style.shadows.length > 0) {
		const shadows = style.shadows.map(serializeShadow);
		put(
			sink,
			"box-shadow",
			shadows.some((shadow) => shadow === null) ? null : shadows.join(", "),
		);
	}
	if (style.filter !== undefined) {
		put(sink, "filter", serializeFilter(style.filter));
	}
	put(sink, "mix-blend-mode", style.blendMode);
	put(sink, "cursor", style.cursor);
}

function applyTypography(
	sink: StyleSink,
	typography: Partial<TypographySpec>,
): void {
	if (typography.fontFamily !== undefined) {
		put(
			sink,
			"font-family",
			serializeTokenOrLiteral(typography.fontFamily, (family) =>
				/[\s]/.test(family) ? `"${family}"` : family,
			),
		);
	}
	if (typography.fontSize !== undefined) {
		put(
			sink,
			"font-size",
			serializeTokenOrLiteral(typography.fontSize, serializeCssLength),
		);
	}
	if (typography.fontWeight !== undefined) {
		put(
			sink,
			"font-weight",
			serializeTokenOrLiteral(typography.fontWeight, (weight) =>
				String(weight),
			),
		);
	}
	if (typography.lineHeight !== undefined) {
		put(
			sink,
			"line-height",
			serializeTokenOrLiteral(typography.lineHeight, (height) =>
				typeof height === "number"
					? String(height)
					: serializeCssLength(height),
			),
		);
	}
	if (typography.letterSpacing !== undefined) {
		put(
			sink,
			"letter-spacing",
			serializeTokenOrLiteral(typography.letterSpacing, serializeCssLength),
		);
	}
	if (typography.color !== undefined) {
		put(
			sink,
			"color",
			serializeTokenOrLiteral(typography.color, serializeCssColor),
		);
	}
	put(sink, "text-align", typography.textAlign);
	put(sink, "text-decoration", typography.textDecoration);
	put(sink, "text-transform", typography.textTransform);
	put(sink, "text-wrap", typography.textWrap);
}

/**
 * Materialize resolved node authoring into DOM application form
 * (DD-0019 §11.4). Deterministic: identical input produces an
 * identical `ResolvedAuthoringStyle`; property emission order is
 * fixed by construction. Output never contains `!important`.
 */
export function resolveAuthoringStyle(
	input: ResolvedNodeStyleInput,
): ResolvedAuthoringStyle {
	const sink: StyleSink = { style: {}, diagnostics: [], nodeId: input.nodeId };
	if (input.layout !== undefined) {
		applyLayout(sink, input.layout);
	}
	if (input.style !== undefined) {
		applyVisualStyle(sink, input.style);
	}
	if (input.typography !== undefined) {
		applyTypography(sink, input.typography);
	}
	if (input.hidden === true) {
		// `hidden` is editor metadata compiled to display:none; it never
		// rewrites `layout.display` in the document (DD-0019 §18).
		sink.style.display = "none";
	}
	return {
		classNames: [],
		inlineStyle: sink.style,
		dataAttributes: { "data-ak-node": input.nodeId },
		diagnostics: sink.diagnostics,
	};
}
