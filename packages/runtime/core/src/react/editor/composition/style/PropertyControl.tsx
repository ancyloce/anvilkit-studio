"use client";

/**
 * @file `StylePropertyControl` — one granted §6.1 property, bound and
 * rendered (PLAN-0028 `p4-001`).
 *
 * **One component per property, deliberately.** The number of granted
 * properties varies with the selection and the target, so binding them
 * in a loop inside the section would call `useStyleField` a different
 * number of times per render — a rules-of-hooks violation. Each
 * property therefore mounts its own component and calls the hook
 * exactly once. The cost is bounded: `useDocumentModel` memoizes the
 * projection per `(data, config)`, so twenty controls share one
 * `walkTree`.
 *
 * **The table below is total.** `CONTROL_FOR` is a
 * `Record<AuthorableStyleProperty, …>`, so a property added to the §6.1
 * vocabulary fails to compile until it has a control — the panel cannot
 * silently stop offering something the compiler accepts. The reverse
 * direction is guaranteed by the caller: only properties present in a
 * target's `properties` allowlist are ever rendered, and that is the
 * same allowlist `updateAppearanceInData` validates against, so a
 * control whose commit would be rejected cannot exist.
 *
 * **Labels come from the shipped catalog**, written as full literals so
 * the `studio.editor.*` parity gate can verify every one of them.
 * `rowGap`, `columnGap`, `inset`, `blendMode` and `cursor` had no
 * catalog entry when this file was written and fell back to their CSS
 * property name; `p4-008` added those five keys across en/zh/ja/ko, so
 * every property rendered here is now a translated label. Enum *option*
 * values are still shown verbatim — those are technical identifiers.
 */

import type {
	AuthorableStyleProperty,
	BorderSpec,
	CssBoxEdges,
	CssColor,
	CssCorners,
	CssLength,
	FilterSpec,
	GridTrackList,
	Paint,
	ShadowSpec,
	TokenOrLiteral,
} from "@anvilkit/contracts/editor";
import type { ReactNode } from "react";
import { useMsg } from "@/state/editor-i18n-context";
import { BoxEdgesControl } from "./controls/BoxEdgesControl.js";
import { ColorControl } from "./controls/ColorControl.js";
import { AxisGapControl, GapControl } from "./controls/gap.js";
import { mapField, type StyleFieldHandle } from "./controls/handle.js";
import { LengthControl } from "./controls/LengthControl.js";
import { SliderControl, TextControl } from "./controls/misc.js";
import { NumberControl } from "./controls/NumberControl.js";
import { SegmentedControl } from "./controls/SegmentedControl.js";
import { SelectControl } from "./controls/SelectControl.js";
import { GridTracksControl } from "./controls/tracks.js";
import {
	BorderControl,
	CornersControl,
	FilterControl,
	PaintControl,
	ShadowsControl,
} from "./controls/visual.js";
import { type StyleFieldAddress, useStyleField } from "./use-style-field.js";

/* ------------------------------------------------------------------ *
 * Enum vocabularies (CSS keywords — rendered as written)
 * ------------------------------------------------------------------ */

const DISPLAY = ["block", "flex", "grid", "none"] as const;
const POSITION = ["static", "relative", "absolute", "sticky"] as const;
const OVERFLOW = ["visible", "hidden", "auto", "scroll"] as const;
const JUSTIFY = [
	"start",
	"center",
	"end",
	"space-between",
	"space-around",
	"space-evenly",
	"stretch",
] as const;
const TEXT_ALIGN = ["left", "center", "right", "justify"] as const;
const TEXT_DECORATION = ["none", "underline", "line-through"] as const;
const TEXT_TRANSFORM = [
	"none",
	"uppercase",
	"lowercase",
	"capitalize",
] as const;
const TEXT_WRAP = ["wrap", "nowrap", "balance", "pretty"] as const;
const FONT_WEIGHT = [
	"100",
	"200",
	"300",
	"400",
	"500",
	"600",
	"700",
	"800",
	"900",
] as const;
const BLEND_MODE = [
	"normal",
	"multiply",
	"screen",
	"overlay",
	"darken",
	"lighten",
	"color-dodge",
	"color-burn",
	"hard-light",
	"soft-light",
	"difference",
	"exclusion",
	"hue",
	"saturation",
	"color",
	"luminosity",
] as const;
const CURSOR = [
	"auto",
	"default",
	"pointer",
	"text",
	"move",
	"grab",
	"grabbing",
	"not-allowed",
] as const;

/** Segmented option → catalog key. Full literals: the parity gate reads them. */
const DIRECTION_LABELS: Readonly<Record<string, string>> = {
	row: "studio.editor.inspector.layout.direction.row",
	column: "studio.editor.inspector.layout.direction.column",
};
const WRAP_LABELS: Readonly<Record<string, string>> = {
	nowrap: "studio.editor.inspector.layout.wrap.nowrap",
	wrap: "studio.editor.inspector.layout.wrap.wrap",
};
const ALIGN_LABELS: Readonly<Record<string, string>> = {
	start: "studio.editor.inspector.layout.align.start",
	center: "studio.editor.inspector.layout.align.center",
	end: "studio.editor.inspector.layout.align.end",
	stretch: "studio.editor.inspector.layout.align.stretch",
	baseline: "studio.editor.inspector.layout.align.baseline",
};

/* ------------------------------------------------------------------ *
 * Per-property control selection
 * ------------------------------------------------------------------ */

/** How one property is edited, and what it is called. */
interface ControlSpec {
	/** Catalog key; absent means the CSS name below is the label. */
	readonly labelKey?: string;
	/** CSS property name — the label of last resort. */
	readonly css: string;
	readonly control:
		| "length"
		| "sizeLength"
		| "gap"
		| "axisGap"
		| "boxEdges"
		| "tracks"
		| "number"
		| "opacity"
		| "paint"
		| "border"
		| "corners"
		| "shadows"
		| "filter"
		| "color"
		| "tokenLength"
		| "tokenText"
		| "fontWeight"
		| "lineHeight"
		| "select"
		| "segmented";
	/** Option list for `select` / `segmented`. */
	readonly options?: readonly string[];
	/** Option → catalog key, for `segmented`. */
	readonly optionLabels?: Readonly<Record<string, string>>;
	/** Catalog key for a constraint note rendered under the control. */
	readonly helpKey?: string;
}

const CONTROL_FOR: Readonly<Record<AuthorableStyleProperty, ControlSpec>> = {
	// layout
	display: {
		labelKey: "studio.editor.inspector.layout.display",
		css: "display",
		control: "select",
		options: DISPLAY,
	},
	position: {
		labelKey: "studio.editor.inspector.layout.position",
		css: "position",
		control: "select",
		options: POSITION,
	},
	overflow: {
		labelKey: "studio.editor.inspector.layout.overflow",
		css: "overflow",
		control: "select",
		options: OVERFLOW,
	},
	direction: {
		labelKey: "studio.editor.inspector.layout.direction",
		css: "flex-direction",
		control: "segmented",
		options: ["row", "column"],
		optionLabels: DIRECTION_LABELS,
	},
	wrap: {
		labelKey: "studio.editor.inspector.layout.wrap",
		css: "flex-wrap",
		control: "segmented",
		options: ["nowrap", "wrap"],
		optionLabels: WRAP_LABELS,
	},
	alignItems: {
		labelKey: "studio.editor.inspector.layout.alignItems",
		css: "align-items",
		control: "segmented",
		options: ["start", "center", "end", "stretch", "baseline"],
		optionLabels: ALIGN_LABELS,
	},
	justifyContent: {
		labelKey: "studio.editor.inspector.layout.justifyContent",
		css: "justify-content",
		control: "select",
		options: JUSTIFY,
	},
	width: {
		labelKey: "studio.editor.inspector.layout.width",
		css: "width",
		control: "sizeLength",
	},
	height: {
		labelKey: "studio.editor.inspector.layout.height",
		css: "height",
		control: "sizeLength",
	},
	minWidth: {
		labelKey: "studio.editor.inspector.layout.minWidth",
		css: "min-width",
		control: "length",
	},
	maxWidth: {
		labelKey: "studio.editor.inspector.layout.maxWidth",
		css: "max-width",
		control: "length",
	},
	minHeight: {
		labelKey: "studio.editor.inspector.layout.minHeight",
		css: "min-height",
		control: "length",
	},
	maxHeight: {
		labelKey: "studio.editor.inspector.layout.maxHeight",
		css: "max-height",
		control: "length",
	},
	gap: {
		labelKey: "studio.editor.inspector.layout.gap",
		css: "gap",
		control: "gap",
	},
	rowGap: {
		css: "row-gap",
		control: "axisGap",
		labelKey: "studio.editor.inspector.layout.rowGap",
	},
	columnGap: {
		css: "column-gap",
		control: "axisGap",
		labelKey: "studio.editor.inspector.layout.columnGap",
	},
	margin: {
		labelKey: "studio.editor.inspector.layout.margin",
		css: "margin",
		control: "boxEdges",
	},
	padding: {
		labelKey: "studio.editor.inspector.layout.padding",
		css: "padding",
		control: "boxEdges",
	},
	inset: {
		css: "inset",
		control: "boxEdges",
		labelKey: "studio.editor.inspector.layout.inset",
	},
	columns: {
		labelKey: "studio.editor.inspector.layout.columns",
		css: "grid-template-columns",
		control: "tracks",
	},
	rows: {
		labelKey: "studio.editor.inspector.layout.rows",
		css: "grid-template-rows",
		control: "tracks",
	},
	zIndex: {
		labelKey: "studio.editor.inspector.layout.zIndex",
		css: "z-index",
		control: "number",
		// ADR 0007 decision 5 granted `zIndex` against PLAN-0026's
		// recommendation, on the condition that its non-locality is
		// stated where it is edited: the number orders siblings inside
		// the nearest positioned ancestor and means nothing outside it.
		helpKey: "studio.editor.inspector.layout.zIndex.help",
	},

	// visual
	background: {
		labelKey: "studio.editor.inspector.style.fill",
		css: "background",
		control: "paint",
	},
	border: {
		labelKey: "studio.editor.inspector.style.border",
		css: "border",
		control: "border",
	},
	borderRadius: {
		labelKey: "studio.editor.inspector.style.radius",
		css: "border-radius",
		control: "corners",
	},
	boxShadow: {
		labelKey: "studio.editor.inspector.style.shadows",
		css: "box-shadow",
		control: "shadows",
	},
	opacity: {
		labelKey: "studio.editor.inspector.style.opacity",
		css: "opacity",
		control: "opacity",
	},
	filter: {
		labelKey: "studio.editor.inspector.style.filter",
		css: "filter",
		control: "filter",
	},
	blendMode: {
		css: "mix-blend-mode",
		control: "select",
		options: BLEND_MODE,
		labelKey: "studio.editor.inspector.style.blendMode",
	},
	cursor: {
		css: "cursor",
		control: "select",
		options: CURSOR,
		labelKey: "studio.editor.inspector.style.cursor",
	},

	// typography
	color: {
		labelKey: "studio.editor.inspector.typography.color",
		css: "color",
		control: "color",
	},
	fontFamily: {
		labelKey: "studio.editor.inspector.typography.fontFamily",
		css: "font-family",
		control: "tokenText",
	},
	fontSize: {
		labelKey: "studio.editor.inspector.typography.fontSize",
		css: "font-size",
		control: "tokenLength",
	},
	fontWeight: {
		labelKey: "studio.editor.inspector.typography.fontWeight",
		css: "font-weight",
		control: "fontWeight",
		options: FONT_WEIGHT,
	},
	lineHeight: {
		labelKey: "studio.editor.inspector.typography.lineHeight",
		css: "line-height",
		control: "lineHeight",
	},
	letterSpacing: {
		labelKey: "studio.editor.inspector.typography.letterSpacing",
		css: "letter-spacing",
		control: "tokenLength",
	},
	textAlign: {
		labelKey: "studio.editor.inspector.typography.textAlign",
		css: "text-align",
		control: "select",
		options: TEXT_ALIGN,
	},
	textDecoration: {
		labelKey: "studio.editor.inspector.typography.textDecoration",
		css: "text-decoration",
		control: "select",
		options: TEXT_DECORATION,
	},
	textTransform: {
		labelKey: "studio.editor.inspector.typography.textTransform",
		css: "text-transform",
		control: "select",
		options: TEXT_TRANSFORM,
	},
	textWrap: {
		labelKey: "studio.editor.inspector.typography.textWrap",
		css: "text-wrap",
		control: "select",
		options: TEXT_WRAP,
	},
};

/**
 * Reinterpret the untyped stored value as the shape the chosen control
 * edits. The store is genuinely untyped at this boundary —
 * `AppearancePatch.value` is `unknown` and `readNodeField<T>` asserts
 * its own generic — so the assertion is stated once, here, rather than
 * scattered through the branches. Every control guards its own value
 * shape (`value?.kind === …`), so a mismatched carrier renders empty
 * instead of crashing.
 */
function typed<T>(field: StyleFieldHandle<unknown>): StyleFieldHandle<T> {
	return field as StyleFieldHandle<T>;
}

/** Unwrap `TokenOrLiteral<T>`; a token reference reads as `mixed`. */
function literal<T>(field: StyleFieldHandle<unknown>): StyleFieldHandle<T> {
	return mapField<TokenOrLiteral<T>, T>(
		typed<TokenOrLiteral<T>>(field),
		(value) => (value?.kind === "literal" ? value.value : undefined),
		(value) => ({ kind: "literal", value }),
	);
}

/** Props for {@link StylePropertyControl}. */
export interface StylePropertyControlProps {
	readonly address: StyleFieldAddress;
	readonly property: AuthorableStyleProperty;
}

/** One granted property, read and committed at the target address. */
export function StylePropertyControl({
	address,
	property,
}: StylePropertyControlProps): ReactNode {
	const msg = useMsg();
	const spec = CONTROL_FOR[property];
	const field = useStyleField<unknown>(address, {
		field: "property",
		property,
	});
	const label = spec.labelKey === undefined ? spec.css : msg(spec.labelKey);
	const testId = `ak-style-prop-${property}`;

	switch (spec.control) {
		case "length":
		case "sizeLength":
			return (
				<LengthControl
					label={label}
					field={typed<CssLength>(field)}
					allowKeywords={spec.control === "sizeLength"}
					testId={testId}
				/>
			);
		case "gap":
			// Binds `rowGap`/`columnGap` itself and offers them behind the
			// link toggle, so the three carriers read as one affordance.
			return (
				<GapControl
					label={label}
					field={typed<CssLength>(field)}
					address={address}
					testId={testId}
				/>
			);
		case "axisGap":
			// Silent whenever `gap` is granted here — `GapControl` already
			// renders this axis, and offering it twice would be two
			// controls over one carrier.
			return (
				<AxisGapControl
					label={label}
					field={typed<CssLength>(field)}
					address={address}
					testId={testId}
				/>
			);
		case "tokenLength":
			return (
				<LengthControl
					label={label}
					field={literal<CssLength>(field)}
					testId={testId}
				/>
			);
		case "boxEdges":
			return (
				<BoxEdgesControl
					label={label}
					field={typed<CssBoxEdges>(field)}
					testId={testId}
				/>
			);
		case "tracks":
			return (
				<GridTracksControl
					label={label}
					field={typed<GridTrackList>(field)}
					testId={testId}
				/>
			);
		case "number":
			return (
				<NumberControl
					label={label}
					field={typed<number>(field)}
					help={spec.helpKey === undefined ? undefined : msg(spec.helpKey)}
					testId={testId}
				/>
			);
		case "opacity":
			return (
				<SliderControl
					label={label}
					field={typed<number>(field)}
					min={0}
					max={1}
					step={0.01}
					testId={testId}
				/>
			);
		case "paint":
			return (
				<PaintControl
					label={label}
					field={typed<Paint>(field)}
					testId={testId}
				/>
			);
		case "border":
			return (
				<BorderControl
					label={label}
					field={typed<BorderSpec>(field)}
					testId={testId}
				/>
			);
		case "corners":
			return (
				<CornersControl
					label={label}
					field={typed<CssCorners>(field)}
					testId={testId}
				/>
			);
		case "shadows":
			return (
				<ShadowsControl
					label={label}
					field={typed<readonly ShadowSpec[]>(field)}
					testId={testId}
				/>
			);
		case "filter":
			return (
				<FilterControl
					label={label}
					field={typed<FilterSpec>(field)}
					testId={testId}
				/>
			);
		case "color":
			return (
				<ColorControl
					label={label}
					field={typed<TokenOrLiteral<CssColor>>(field)}
					testId={testId}
				/>
			);
		case "tokenText":
			return (
				<TextControl
					label={label}
					field={literal<string>(field)}
					testId={testId}
				/>
			);
		case "fontWeight":
			return (
				<SelectControl
					label={label}
					field={mapField<number, string>(
						literal<number>(field),
						(value) => String(value),
						(value) => Number(value),
					)}
					options={spec.options ?? FONT_WEIGHT}
					testId={testId}
				/>
			);
		case "lineHeight":
			// The spec allows a number OR a length; the numeric editor
			// declines the length form rather than rounding it away.
			return (
				<NumberControl
					label={label}
					field={mapField<number | CssLength, number>(
						literal<number | CssLength>(field),
						(value) => (typeof value === "number" ? value : undefined),
						(value) => value,
					)}
					min={0}
					step={0.1}
					testId={testId}
				/>
			);
		case "segmented":
			return (
				<SegmentedControl
					label={label}
					field={typed<string>(field)}
					options={(spec.options ?? []).map((option) => ({
						value: option,
						label:
							spec.optionLabels?.[option] === undefined
								? option
								: msg(spec.optionLabels[option]),
					}))}
					testId={testId}
				/>
			);
		case "select":
			return (
				<SelectControl
					label={label}
					field={typed<string>(field)}
					options={spec.options ?? []}
					testId={testId}
				/>
			);
	}
}
