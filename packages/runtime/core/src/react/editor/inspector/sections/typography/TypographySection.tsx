"use client";

/**
 * @file `TypographySection` — the §11.5 P0 typography controls
 * (PLAN-0020 CORE-P1A-007; ED-TYPE-001).
 *
 * Family / size / weight / line-height / letter-spacing / color /
 * alignment / decoration / transform / wrap. Scalar values wrap as
 * `TokenOrLiteral` literals (token picker deferred to Phase 2 —
 * token-backed values render the badge and detach via reset). All
 * writes are `node.typography.set` patches through the port.
 */

import type {
	CssColor,
	CssLength,
	TokenOrLiteral,
	TypographySpec,
} from "@anvilkit/contracts/editor";
import { type ReactNode, useEffect, useState } from "react";
import { Input } from "@/primitives/input";
import { useMsg } from "@/state/editor-i18n-context";
import { ColorControl } from "../../controls/ColorControl.js";
import { LengthControl } from "../../controls/LengthControl.js";
import { NumberControl } from "../../controls/NumberControl.js";
import { SelectControl } from "../../controls/SelectControl.js";
import { InspectorFieldShell } from "../../InspectorFieldShell.js";
import type { InspectorSectionProps } from "../../sections-registry.js";
import {
	type InspectorFieldHandle,
	useInspectorField,
} from "../../use-inspector.js";

const WEIGHT_OPTIONS = [
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
const ALIGN_OPTIONS = ["left", "center", "right", "justify"] as const;
const DECORATION_OPTIONS = ["none", "underline", "line-through"] as const;
const TRANSFORM_OPTIONS = [
	"none",
	"uppercase",
	"lowercase",
	"capitalize",
] as const;
const WRAP_OPTIONS = ["wrap", "nowrap", "balance", "pretty"] as const;

/**
 * Adapt a `TokenOrLiteral<T>`-typed field to a plain-`T` handle so the
 * shared controls edit the literal inside; token-backed values pass
 * through as `unset`-with-badge (handled by the caller's control).
 */
function literalField<T>(
	field: InspectorFieldHandle<TokenOrLiteral<T>>,
): InspectorFieldHandle<T> {
	return {
		state:
			field.state.kind === "value"
				? field.state.value.kind === "literal"
					? {
							kind: "value",
							value: field.state.value.value,
							resolved: {
								value: field.state.value.value,
								source: field.state.resolved.source,
								inherited: field.state.resolved.inherited,
							},
							writtenAtLayer: field.state.writtenAtLayer,
						}
					: { kind: "mixed" }
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
		commit: (value: T) => field.commit({ kind: "literal", value }),
		reset: field.reset,
		layer: field.layer,
	};
}

/** Free-text control for the font-family literal. */
function FontFamilyControl({
	field,
}: {
	readonly field: InspectorFieldHandle<TokenOrLiteral<string>>;
}): ReactNode {
	const msg = useMsg();
	const value = field.state.kind === "value" ? field.state.value : undefined;
	const durable = value?.kind === "literal" ? value.value : "";
	const [draft, setDraft] = useState<string | null>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: draft resets when the durable value changes externally.
	useEffect(() => setDraft(null), [durable]);
	return (
		<InspectorFieldShell
			label={msg("studio.editor.inspector.typography.fontFamily")}
			state={field.state}
			onReset={() => void field.reset()}
		>
			<Input
				type="text"
				value={draft ?? durable}
				placeholder="Inter, sans-serif"
				aria-label={msg("studio.editor.inspector.typography.fontFamily")}
				className="h-7 text-xs"
				onChange={(event) => setDraft(event.target.value)}
				onBlur={() => {
					if (draft === null) {
						return;
					}
					const trimmed = draft.trim();
					setDraft(null);
					if (trimmed === "") {
						void field.reset();
					} else {
						void field.commit({ kind: "literal", value: trimmed });
					}
				}}
				data-testid="ak-typography-family"
			/>
		</InspectorFieldShell>
	);
}

/** The typography section body. */
export function TypographySection({
	context,
}: InspectorSectionProps): ReactNode {
	const msg = useMsg();
	const fontFamily = useInspectorField<TokenOrLiteral<string>>(
		context,
		"typography",
		"fontFamily",
	);
	const fontSize = useInspectorField<TokenOrLiteral<CssLength>>(
		context,
		"typography",
		"fontSize",
	);
	const fontWeight = useInspectorField<TokenOrLiteral<number>>(
		context,
		"typography",
		"fontWeight",
	);
	const lineHeight = useInspectorField<TokenOrLiteral<number | CssLength>>(
		context,
		"typography",
		"lineHeight",
	);
	const letterSpacing = useInspectorField<TokenOrLiteral<CssLength>>(
		context,
		"typography",
		"letterSpacing",
	);
	const color = useInspectorField<TokenOrLiteral<CssColor>>(
		context,
		"typography",
		"color",
	);
	const textAlign = useInspectorField<TypographySpec["textAlign"] & string>(
		context,
		"typography",
		"textAlign",
	);
	const textDecoration = useInspectorField<
		TypographySpec["textDecoration"] & string
	>(context, "typography", "textDecoration");
	const textTransform = useInspectorField<
		TypographySpec["textTransform"] & string
	>(context, "typography", "textTransform");
	const textWrap = useInspectorField<TypographySpec["textWrap"] & string>(
		context,
		"typography",
		"textWrap",
	);

	const weightField = literalField(fontWeight);
	const weightAsString: InspectorFieldHandle<string> = {
		state:
			weightField.state.kind === "value"
				? {
						kind: "value",
						value: String(weightField.state.value),
						resolved: {
							value: String(weightField.state.value),
							source: weightField.state.resolved.source,
							inherited: weightField.state.resolved.inherited,
						},
						writtenAtLayer: weightField.state.writtenAtLayer,
					}
				: weightField.state.kind === "unset"
					? {
							kind: "unset",
							resolved: {
								value: undefined,
								source: weightField.state.resolved.source,
								inherited: weightField.state.resolved.inherited,
							},
						}
					: weightField.state,
		commit: (value) => weightField.commit(Number(value)),
		reset: weightField.reset,
		layer: weightField.layer,
	};

	const lineHeightNumber: InspectorFieldHandle<number> = {
		state:
			lineHeight.state.kind === "value" &&
			lineHeight.state.value.kind === "literal" &&
			typeof lineHeight.state.value.value === "number"
				? {
						kind: "value",
						value: lineHeight.state.value.value,
						resolved: {
							value: lineHeight.state.value.value,
							source: lineHeight.state.resolved.source,
							inherited: lineHeight.state.resolved.inherited,
						},
						writtenAtLayer: lineHeight.state.writtenAtLayer,
					}
				: lineHeight.state.kind === "unset"
					? {
							kind: "unset",
							resolved: {
								value: undefined,
								source: lineHeight.state.resolved.source,
								inherited: lineHeight.state.resolved.inherited,
							},
						}
					: lineHeight.state.kind === "value"
						? { kind: "mixed" }
						: lineHeight.state,
		commit: (value) => lineHeight.commit({ kind: "literal", value }),
		reset: lineHeight.reset,
		layer: lineHeight.layer,
	};

	return (
		<div className="flex flex-col gap-2.5" data-testid="ak-typography-section">
			{/*
			 * One property per row: the shared field shell now renders a label
			 * gutter plus control, so a two-up grid left every control at a
			 * quarter of the panel width.
			 */}
			<FontFamilyControl field={fontFamily} />
			<LengthControl
				label={msg("studio.editor.inspector.typography.fontSize")}
				field={literalField(fontSize)}
				testId="ak-typography-size"
			/>
			<SelectControl
				label={msg("studio.editor.inspector.typography.fontWeight")}
				field={weightAsString}
				options={WEIGHT_OPTIONS}
				testId="ak-typography-weight"
			/>
			<NumberControl
				label={msg("studio.editor.inspector.typography.lineHeight")}
				field={lineHeightNumber}
				min={0}
				step={0.1}
			/>
			<LengthControl
				label={msg("studio.editor.inspector.typography.letterSpacing")}
				field={literalField(letterSpacing)}
			/>
			<ColorControl
				label={msg("studio.editor.inspector.typography.color")}
				field={color}
				testId="ak-typography-color"
			/>
			<SelectControl
				label={msg("studio.editor.inspector.typography.textAlign")}
				field={textAlign}
				options={ALIGN_OPTIONS}
				testId="ak-typography-align"
			/>
			<SelectControl
				label={msg("studio.editor.inspector.typography.textDecoration")}
				field={textDecoration}
				options={DECORATION_OPTIONS}
			/>
			<SelectControl
				label={msg("studio.editor.inspector.typography.textTransform")}
				field={textTransform}
				options={TRANSFORM_OPTIONS}
			/>
			<SelectControl
				label={msg("studio.editor.inspector.typography.textWrap")}
				field={textWrap}
				options={WRAP_OPTIONS}
			/>
		</div>
	);
}
