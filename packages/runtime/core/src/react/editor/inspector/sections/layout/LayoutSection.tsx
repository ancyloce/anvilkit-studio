"use client";

/**
 * @file `LayoutSection` — the §11.5 P0 layout controls (PLAN-0020
 * CORE-P1A-006; ED-LAYOUT-001/002).
 *
 * Display block/flex/grid/none; flex direction/wrap/align/justify/gap
 * (shown for `display:flex`); grid rows/columns/gap with fixed/fr/auto
 * tracks (shown for `display:grid`; track counts edit as repeated
 * `fr` tracks — the full track editor is a later §11.5 row);
 * width/height/min/max; four-edge margin/padding; position; overflow;
 * zIndex. Every write is a `node.layout.set` patch through the port
 * at the active layer.
 *
 * Presentation: the small, comparable-at-a-glance enums (flex
 * direction, wrap, cross-axis alignment) render as segmented
 * icon/label rows rather than dropdowns; the longer ones
 * (display, justification, position, overflow) stay selects, where a
 * seven-item list is genuinely easier to scan closed than open. No
 * property, option or command changed — this is the control shape
 * only.
 */

import type {
	CssAlignment,
	CssBoxEdges,
	CssJustification,
	CssLength,
	GridTrackList,
	LayoutSpec,
} from "@anvilkit/contracts/editor";
import {
	AlignCenterVertical,
	AlignEndVertical,
	AlignStartVertical,
	Baseline,
	MoveHorizontal,
	MoveVertical,
	StretchVertical,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMsg } from "@/state/editor-i18n-context";
import { BoxEdgesControl } from "../../controls/BoxEdgesControl.js";
import { LengthControl } from "../../controls/LengthControl.js";
import { NumberControl } from "../../controls/NumberControl.js";
import {
	SegmentedControl,
	type SegmentedOption,
} from "../../controls/SegmentedControl.js";
import { SelectControl } from "../../controls/SelectControl.js";
import type { InspectorSectionProps } from "../../sections-registry.js";
import {
	type InspectorFieldHandle,
	useInspectorField,
} from "../../use-inspector.js";

const DISPLAY_OPTIONS = ["block", "flex", "grid", "none"] as const;
const DIRECTION_OPTIONS = ["row", "column"] as const;
const WRAP_OPTIONS = ["nowrap", "wrap"] as const;
const ALIGN_OPTIONS: readonly CssAlignment[] = [
	"start",
	"center",
	"end",
	"stretch",
	"baseline",
];

/** Icons for the segmented rows, keyed by option (same order). */
const DIRECTION_ICONS: Record<(typeof DIRECTION_OPTIONS)[number], ReactNode> = {
	row: <MoveHorizontal aria-hidden="true" />,
	column: <MoveVertical aria-hidden="true" />,
};

const ALIGN_ICONS: Record<CssAlignment, ReactNode> = {
	start: <AlignStartVertical aria-hidden="true" />,
	center: <AlignCenterVertical aria-hidden="true" />,
	end: <AlignEndVertical aria-hidden="true" />,
	stretch: <StretchVertical aria-hidden="true" />,
	baseline: <Baseline aria-hidden="true" />,
};
const JUSTIFY_OPTIONS: readonly CssJustification[] = [
	"start",
	"center",
	"end",
	"space-between",
	"space-around",
	"space-evenly",
	"stretch",
];
const POSITION_OPTIONS = ["static", "relative", "absolute", "sticky"] as const;
const OVERFLOW_OPTIONS = ["visible", "hidden", "auto", "scroll"] as const;

/**
 * Grid track-count editor: edits `columns`/`rows` as N repeated `fr`
 * tracks (the P0 fixed/fr/auto model's common case; existing
 * fixed/auto tracks are preserved until the count changes).
 */
function TrackCountControl({
	label,
	field,
}: {
	readonly label: string;
	readonly field: InspectorFieldHandle<GridTrackList>;
}): ReactNode {
	const numberField: InspectorFieldHandle<number> = {
		state:
			field.state.kind === "value"
				? {
						kind: "value",
						value: field.state.value.length,
						resolved: {
							value: field.state.value.length,
							source: field.state.resolved.source,
							inherited: field.state.resolved.inherited,
						},
						writtenAtLayer: field.state.writtenAtLayer,
					}
				: field.state.kind === "unset"
					? {
							kind: "unset",
							resolved: {
								value: undefined,
								source: field.state.resolved.source,
								inherited: field.state.resolved.inherited,
							},
						}
					: field.state,
		commit: (count) =>
			field.commit(
				Array.from({ length: Math.max(1, Math.round(count)) }, () => ({
					kind: "fr" as const,
					value: 1,
				})),
			),
		reset: field.reset,
		layer: field.layer,
	};
	return <NumberControl label={label} field={numberField} min={1} max={24} />;
}

/** The layout section body. */
export function LayoutSection({ context }: InspectorSectionProps): ReactNode {
	const msg = useMsg();
	const display = useInspectorField<LayoutSpec["display"] & string>(
		context,
		"layout",
		"display",
	);
	const direction = useInspectorField<(typeof DIRECTION_OPTIONS)[number]>(
		context,
		"layout",
		"direction",
	);
	const wrap = useInspectorField<(typeof WRAP_OPTIONS)[number]>(
		context,
		"layout",
		"wrap",
	);
	const alignItems = useInspectorField<CssAlignment>(
		context,
		"layout",
		"alignItems",
	);
	const justifyContent = useInspectorField<CssJustification>(
		context,
		"layout",
		"justifyContent",
	);
	const gap = useInspectorField<CssLength>(context, "layout", "gap");
	const columns = useInspectorField<GridTrackList>(
		context,
		"layout",
		"columns",
	);
	const rows = useInspectorField<GridTrackList>(context, "layout", "rows");
	const width = useInspectorField<CssLength>(context, "layout", "width");
	const height = useInspectorField<CssLength>(context, "layout", "height");
	const minWidth = useInspectorField<CssLength>(context, "layout", "minWidth");
	const maxWidth = useInspectorField<CssLength>(context, "layout", "maxWidth");
	const minHeight = useInspectorField<CssLength>(
		context,
		"layout",
		"minHeight",
	);
	const maxHeight = useInspectorField<CssLength>(
		context,
		"layout",
		"maxHeight",
	);
	const margin = useInspectorField<CssBoxEdges>(context, "layout", "margin");
	const padding = useInspectorField<CssBoxEdges>(context, "layout", "padding");
	const position = useInspectorField<(typeof POSITION_OPTIONS)[number]>(
		context,
		"layout",
		"position",
	);
	const overflow = useInspectorField<(typeof OVERFLOW_OPTIONS)[number]>(
		context,
		"layout",
		"overflow",
	);
	const zIndex = useInspectorField<number>(context, "layout", "zIndex");

	const displayValue =
		display.state.kind === "value" ? display.state.value : undefined;

	const directionOptions: readonly SegmentedOption<
		(typeof DIRECTION_OPTIONS)[number]
	>[] = DIRECTION_OPTIONS.map((option) => ({
		value: option,
		label: msg(`studio.editor.inspector.layout.direction.${option}`),
		icon: DIRECTION_ICONS[option],
	}));
	const wrapOptions: readonly SegmentedOption<(typeof WRAP_OPTIONS)[number]>[] =
		WRAP_OPTIONS.map((option) => ({
			value: option,
			label: msg(`studio.editor.inspector.layout.wrap.${option}`),
		}));
	const alignOptions: readonly SegmentedOption<CssAlignment>[] =
		ALIGN_OPTIONS.map((option) => ({
			value: option,
			label: msg(`studio.editor.inspector.layout.align.${option}`),
			icon: ALIGN_ICONS[option],
		}));

	return (
		<div className="flex flex-col gap-2.5" data-testid="ak-layout-section">
			<SelectControl
				label={msg("studio.editor.inspector.layout.display")}
				field={display}
				options={DISPLAY_OPTIONS}
				testId="ak-layout-display"
			/>
			{displayValue === "flex" ? (
				<>
					<SegmentedControl
						label={msg("studio.editor.inspector.layout.direction")}
						field={direction}
						options={directionOptions}
						testId="ak-layout-direction"
					/>
					<SelectControl
						label={msg("studio.editor.inspector.layout.justifyContent")}
						field={justifyContent}
						options={JUSTIFY_OPTIONS}
					/>
					<SegmentedControl
						label={msg("studio.editor.inspector.layout.alignItems")}
						field={alignItems}
						options={alignOptions}
						testId="ak-layout-align"
					/>
					<SegmentedControl
						label={msg("studio.editor.inspector.layout.wrap")}
						field={wrap}
						options={wrapOptions}
						testId="ak-layout-wrap"
					/>
					<LengthControl
						label={msg("studio.editor.inspector.layout.gap")}
						field={gap}
						testId="ak-layout-gap"
					/>
				</>
			) : null}
			{displayValue === "grid" ? (
				<>
					<div className="grid grid-cols-2 gap-2">
						<TrackCountControl
							label={msg("studio.editor.inspector.layout.columns")}
							field={columns}
						/>
						<TrackCountControl
							label={msg("studio.editor.inspector.layout.rows")}
							field={rows}
						/>
					</div>
					<LengthControl
						label={msg("studio.editor.inspector.layout.gap")}
						field={gap}
					/>
					<SelectControl
						label={msg("studio.editor.inspector.layout.justifyContent")}
						field={justifyContent}
						options={JUSTIFY_OPTIONS}
					/>
					<SegmentedControl
						label={msg("studio.editor.inspector.layout.alignItems")}
						field={alignItems}
						options={alignOptions}
					/>
				</>
			) : null}
			{/*
			 * One property per row (label gutter + control) rather than the
			 * old two-up grid: at inspector width a 50% column left each
			 * length control with ~60px for its number input plus a unit
			 * select, and every label truncated.
			 */}
			<LengthControl
				label={msg("studio.editor.inspector.layout.width")}
				field={width}
				allowKeywords
				testId="ak-layout-width"
			/>
			<LengthControl
				label={msg("studio.editor.inspector.layout.height")}
				field={height}
				allowKeywords
			/>
			<LengthControl
				label={msg("studio.editor.inspector.layout.minWidth")}
				field={minWidth}
			/>
			<LengthControl
				label={msg("studio.editor.inspector.layout.maxWidth")}
				field={maxWidth}
			/>
			<LengthControl
				label={msg("studio.editor.inspector.layout.minHeight")}
				field={minHeight}
			/>
			<LengthControl
				label={msg("studio.editor.inspector.layout.maxHeight")}
				field={maxHeight}
			/>
			<BoxEdgesControl
				label={msg("studio.editor.inspector.layout.margin")}
				field={margin}
				testId="ak-layout-margin"
			/>
			<BoxEdgesControl
				label={msg("studio.editor.inspector.layout.padding")}
				field={padding}
				testId="ak-layout-padding"
			/>
			<SelectControl
				label={msg("studio.editor.inspector.layout.position")}
				field={position}
				options={POSITION_OPTIONS}
			/>
			<SelectControl
				label={msg("studio.editor.inspector.layout.overflow")}
				field={overflow}
				options={OVERFLOW_OPTIONS}
			/>
			<NumberControl
				label={msg("studio.editor.inspector.layout.zIndex")}
				field={zIndex}
				testId="ak-layout-zindex"
			/>
		</div>
	);
}
