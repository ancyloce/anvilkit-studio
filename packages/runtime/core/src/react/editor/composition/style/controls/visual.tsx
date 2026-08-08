"use client";

/**
 * @file Structured visual-style editors — fill, border, corner radius,
 * shadow layers and filter (PLAN-0028 `p4-001`; DD-0019 §11.5 P0
 * rows).
 *
 * These five properties do not store scalars: `background` is a
 * `Paint` union, `border` is four `BorderEdge`s, `borderRadius` is four
 * corners, `boxShadow` is an ordered layer list and `filter` is a ratio
 * bag. A generic control cannot edit them, so each gets an editor here.
 *
 * Every editor writes the **whole** spec value. That is not a style
 * choice: `updateAppearanceInData` assigns `family[specKey]` rather
 * than merging into it, so a partial write would silently drop the
 * parts it omitted. The edit-then-commit shape below (`{...current,
 * …patch}`) is what keeps a one-field edit from destroying its
 * siblings.
 *
 * Color inputs go through {@link ColorSwatch}, so dragging inside the
 * OS picker is one commit and therefore one undo.
 */

import type {
	BorderEdge,
	BorderSpec,
	CssCorners,
	CssLength,
	FilterSpec,
	Paint,
	ShadowSpec,
} from "@anvilkit/contracts/editor";
import { Plus, Trash2 } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Button } from "@/primitives/button";
import { Input } from "@/primitives/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/primitives/select";
import { cn } from "@/shared/cn";
import { useMsg } from "@/state/editor-i18n-context";
import { InspectorFieldShell } from "../../../inspector/InspectorFieldShell.js";
import { hexLiteral, hexOf } from "./ColorControl.js";
import { ColorSwatch } from "./ColorSwatch.js";
import { fieldValue, type StyleFieldHandle } from "./handle.js";

const UNSET_SENTINEL = "__unset__";
const FILL_KINDS = ["none", "solid", "linear-gradient", "image"] as const;
const BORDER_STYLES = ["none", "solid", "dashed", "dotted"] as const;
const SHADOW_KINDS = ["drop", "inner"] as const;

const BLACK = hexLiteral("#000000");
const WHITE = hexLiteral("#ffffff");

function px(value: number): CssLength {
	return { kind: "unit", value, unit: "px" };
}

function lengthNumber(value: CssLength | undefined): number {
	return value?.kind === "unit" ? value.value : 0;
}

/* ------------------------------------------------------------------ *
 * Fill (`background` → `Paint`)
 * ------------------------------------------------------------------ */

/** Props shared by the structured editors. */
export interface StructuredControlProps<T> {
	readonly label: string;
	readonly field: StyleFieldHandle<T>;
	readonly testId?: string;
}

/** Fill editor: kind select plus a per-kind body. */
export function PaintControl({
	label,
	field,
	testId,
}: StructuredControlProps<Paint>): ReactNode {
	const msg = useMsg();
	const value = fieldValue(field.state);
	return (
		<InspectorFieldShell
			label={label}
			state={field.state}
			onReset={() => field.reset()}
			layout="stack"
		>
			<div className="flex flex-col gap-1.5">
				<Select
					value={value?.kind ?? UNSET_SENTINEL}
					onValueChange={(next) => {
						if (next === UNSET_SENTINEL) {
							field.reset();
							return;
						}
						if (next === "none") field.commit({ kind: "none" });
						else if (next === "solid")
							field.commit({ kind: "solid", color: BLACK });
						else if (next === "linear-gradient")
							field.commit({
								kind: "linear-gradient",
								angle: 180,
								stops: [
									{ color: BLACK, offset: 0 },
									{ color: WHITE, offset: 1 },
								],
							});
						else field.commit({ kind: "image", src: "", fit: "cover" });
					}}
				>
					<SelectTrigger
						size="sm"
						aria-label={label}
						className="h-7 w-full text-xs"
						data-testid={testId}
					>
						<SelectValue placeholder={msg("studio.editor.inspector.unset")}>
							{(selected: unknown) =>
								typeof selected === "string" && selected !== UNSET_SENTINEL
									? msg(`studio.editor.inspector.style.fill.${selected}`)
									: msg("studio.editor.inspector.unset")
							}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={UNSET_SENTINEL}>
							{msg("studio.editor.inspector.unset")}
						</SelectItem>
						{FILL_KINDS.map((option) => (
							<SelectItem key={option} value={option}>
								{msg(`studio.editor.inspector.style.fill.${option}`)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{value?.kind === "solid" ? (
					<ColorSwatch
						hex={hexOf(value.color)}
						label={msg("studio.editor.inspector.style.fillColor")}
						className="h-7 w-full"
						onCommit={(hex) =>
							field.commit({ kind: "solid", color: hexLiteral(hex) })
						}
						testId="ak-style-fill-color"
					/>
				) : null}
				{value?.kind === "linear-gradient" ? (
					<GradientRow field={field} paint={value} />
				) : null}
				{value?.kind === "image" ? (
					<ImageSrcRow field={field} paint={value} />
				) : null}
			</div>
		</InspectorFieldShell>
	);
}

function GradientRow({
	field,
	paint,
}: {
	readonly field: StyleFieldHandle<Paint>;
	readonly paint: Extract<Paint, { kind: "linear-gradient" }>;
}): ReactNode {
	const msg = useMsg();
	return (
		<div className="flex items-center gap-1" data-testid="ak-style-gradient">
			<Input
				type="text"
				inputMode="decimal"
				value={String(paint.angle)}
				aria-label={msg("studio.editor.inspector.style.angle")}
				className="h-7 w-14 text-xs"
				onChange={(event) => {
					const angle = Number(event.target.value);
					if (isFinite(angle)) field.commit({ ...paint, angle });
				}}
			/>
			{paint.stops.slice(0, 2).map((stop, index) => (
				<ColorSwatch
					// biome-ignore lint/suspicious/noArrayIndexKey: gradient stops have no identity beyond position.
					key={index}
					hex={hexOf(stop.color)}
					label={`${msg("studio.editor.inspector.style.gradientStop")} ${index + 1}`}
					onCommit={(hex) =>
						field.commit({
							...paint,
							stops: paint.stops.map((entry, at) =>
								at === index ? { ...entry, color: hexLiteral(hex) } : entry,
							),
						})
					}
				/>
			))}
		</div>
	);
}

function ImageSrcRow({
	field,
	paint,
}: {
	readonly field: StyleFieldHandle<Paint>;
	readonly paint: Extract<Paint, { kind: "image" }>;
}): ReactNode {
	const msg = useMsg();
	const [draft, setDraft] = useState<string | null>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: the draft resets when the durable src changes externally.
	useEffect(() => setDraft(null), [paint.src]);
	return (
		<Input
			type="text"
			value={draft ?? paint.src}
			placeholder={msg("studio.editor.inspector.style.imageSrc")}
			aria-label={msg("studio.editor.inspector.style.imageSrc")}
			className="h-7 text-xs"
			onChange={(event) => setDraft(event.target.value)}
			onBlur={() => {
				if (draft === null) return;
				setDraft(null);
				field.commit({ ...paint, src: draft.trim() });
			}}
			data-testid="ak-style-image-src"
		/>
	);
}

/* ------------------------------------------------------------------ *
 * Border (`border` → `BorderSpec`)
 * ------------------------------------------------------------------ */

/** All-edge border editor writing the four edges in one value. */
export function BorderControl({
	label,
	field,
	testId,
}: StructuredControlProps<BorderSpec>): ReactNode {
	const msg = useMsg();
	const value = fieldValue(field.state);
	const top = value?.top;
	const writeAll = (patch: Partial<BorderEdge>): void => {
		const edge: BorderEdge = { ...top, ...patch };
		field.commit({ top: edge, right: edge, bottom: edge, left: edge });
	};
	return (
		<InspectorFieldShell
			label={label}
			state={field.state}
			onReset={() => field.reset()}
			// Width + style + colour on one line needs the full width.
			layout="stack"
		>
			<div className="flex items-center gap-1" data-testid={testId}>
				<Input
					type="text"
					inputMode="decimal"
					value={String(lengthNumber(top?.width))}
					aria-label={msg("studio.editor.inspector.style.borderWidth")}
					className="h-7 w-14 text-xs"
					onChange={(event) => {
						const width = Number(event.target.value);
						if (isFinite(width) && width >= 0) writeAll({ width: px(width) });
					}}
				/>
				<Select
					value={top?.style ?? "solid"}
					onValueChange={(next) =>
						writeAll({ style: next as BorderEdge["style"] })
					}
				>
					<SelectTrigger
						size="sm"
						aria-label={msg("studio.editor.inspector.style.borderStyle")}
						className="h-7 w-24 text-xs"
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{BORDER_STYLES.map((option) => (
							<SelectItem key={option} value={option}>
								{option}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<ColorSwatch
					hex={hexOf(top?.color)}
					label={msg("studio.editor.inspector.style.borderColor")}
					onCommit={(hex) => writeAll({ color: hexLiteral(hex) })}
				/>
			</div>
		</InspectorFieldShell>
	);
}

/* ------------------------------------------------------------------ *
 * Radius (`borderRadius` → `CssCorners`)
 * ------------------------------------------------------------------ */

const CORNERS: readonly (keyof CssCorners)[] = [
	"topLeft",
	"topRight",
	"bottomRight",
	"bottomLeft",
];

/** Linked / per-corner radius editor. */
export function CornersControl({
	label,
	field,
	testId,
}: StructuredControlProps<CssCorners>): ReactNode {
	const msg = useMsg();
	const [perCorner, setPerCorner] = useState(false);
	const value = fieldValue(field.state);
	return (
		<InspectorFieldShell
			label={label}
			state={field.state}
			onReset={() => field.reset()}
			// Per-corner mode lays out four inputs side by side.
			layout="stack"
		>
			<div className="flex items-center gap-1" data-testid={testId}>
				{perCorner ? (
					<div className="grid flex-1 grid-cols-4 gap-1">
						{CORNERS.map((corner) => (
							<Input
								key={corner}
								type="text"
								inputMode="decimal"
								value={String(lengthNumber(value?.[corner]))}
								aria-label={`${msg("studio.editor.inspector.style.radius")} ${corner}`}
								className="h-7 text-xs"
								onChange={(event) => {
									const amount = Number(event.target.value);
									if (isFinite(amount) && amount >= 0) {
										// Whole value: the writer assigns, never merges.
										field.commit({ ...value, [corner]: px(amount) });
									}
								}}
							/>
						))}
					</div>
				) : (
					<Input
						type="text"
						inputMode="decimal"
						value={String(lengthNumber(value?.topLeft))}
						aria-label={msg("studio.editor.inspector.style.radius")}
						className="h-7 flex-1 text-xs"
						onChange={(event) => {
							const amount = Number(event.target.value);
							if (isFinite(amount) && amount >= 0) {
								const length = px(amount);
								field.commit({
									topLeft: length,
									topRight: length,
									bottomRight: length,
									bottomLeft: length,
								});
							}
						}}
					/>
				)}
				<Button
					type="button"
					variant={perCorner ? "secondary" : "ghost"}
					size="sm"
					className="h-7 px-2 text-[10px]"
					onClick={() => setPerCorner((current) => !current)}
					aria-pressed={perCorner}
				>
					{msg("studio.editor.inspector.style.perCorner")}
				</Button>
			</div>
		</InspectorFieldShell>
	);
}

/* ------------------------------------------------------------------ *
 * Shadows (`boxShadow` → `readonly ShadowSpec[]`)
 * ------------------------------------------------------------------ */

/** Multi-layer shadow list editor. */
export function ShadowsControl({
	label,
	field,
	testId,
}: StructuredControlProps<readonly ShadowSpec[]>): ReactNode {
	const msg = useMsg();
	const shadows = fieldValue(field.state) ?? [];
	const write = (next: readonly ShadowSpec[]): void => {
		// An empty list is the absence of the property, not a stored `[]`.
		if (next.length === 0) field.reset();
		else field.commit(next);
	};
	return (
		<InspectorFieldShell
			label={label}
			state={field.state}
			onReset={() => field.reset()}
			// A list of shadow layers, one row each.
			layout="stack"
		>
			<div className="flex flex-col gap-1" data-testid={testId}>
				{shadows.map((shadow, index) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: shadow layers have no identity beyond order.
						key={index}
						className="flex items-center gap-1"
					>
						<Select
							value={shadow.kind}
							onValueChange={(next) =>
								write(
									shadows.map((entry, at) =>
										at === index
											? { ...entry, kind: next as ShadowSpec["kind"] }
											: entry,
									),
								)
							}
						>
							<SelectTrigger
								size="sm"
								aria-label={msg("studio.editor.inspector.style.shadowKind")}
								className="h-7 w-20 text-xs"
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{SHADOW_KINDS.map((option) => (
									<SelectItem key={option} value={option}>
										{option}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<ColorSwatch
							hex={hexOf(shadow.color)}
							label={`${msg("studio.editor.inspector.style.shadowColor")} ${index + 1}`}
							onCommit={(hex) =>
								write(
									shadows.map((entry, at) =>
										at === index ? { ...entry, color: hexLiteral(hex) } : entry,
									),
								)
							}
						/>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="size-7"
							aria-label={msg("studio.editor.inspector.style.removeShadow")}
							onClick={() => write(shadows.filter((_, at) => at !== index))}
						>
							<Trash2 className="size-3" aria-hidden="true" />
						</Button>
					</div>
				))}
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="h-7 text-xs"
					onClick={() =>
						write([
							...shadows,
							{
								kind: "drop",
								offsetX: px(0),
								offsetY: px(2),
								blur: px(8),
								color: {
									kind: "literal",
									value: { kind: "rgba", r: 0, g: 0, b: 0, a: 0.25 },
								},
							},
						])
					}
					data-testid="ak-style-add-shadow"
				>
					<Plus className="size-3" aria-hidden="true" />
					{msg("studio.editor.inspector.style.addShadow")}
				</Button>
			</div>
		</InspectorFieldShell>
	);
}

/* ------------------------------------------------------------------ *
 * Filter (`filter` → `FilterSpec`)
 * ------------------------------------------------------------------ */

/**
 * The five members of `FilterSpec`, in the order `serializeFilter`
 * emits them. The list is the serializer's own, not a wider CSS filter
 * vocabulary: a control that could author `sepia()` or `hue-rotate()`
 * would produce a value `css-serializer.ts` drops on the floor.
 * `blur` is a `CssLength`; the other four are plain ratios.
 */
interface FilterRatio {
	/** The `FilterSpec` member this cell edits (all four are numbers). */
	readonly key: "brightness" | "contrast" | "saturate" | "grayscale";
	readonly labelKey: string;
	readonly min: number;
	readonly max?: number;
}

const FILTER_RATIOS: readonly FilterRatio[] = [
	{
		key: "brightness",
		labelKey: "studio.editor.inspector.style.brightness",
		min: 0,
	},
	{
		key: "contrast",
		labelKey: "studio.editor.inspector.style.contrast",
		min: 0,
	},
	{
		key: "saturate",
		labelKey: "studio.editor.inspector.style.saturate",
		min: 0,
	},
	{
		key: "grayscale",
		labelKey: "studio.editor.inspector.style.grayscale",
		min: 0,
		max: 1,
	},
];

/**
 * One labelled numeric cell of the filter bag. Drafts stay local until
 * they parse (§11.3); an emptied cell removes its member rather than
 * storing a zero, because `brightness(0)` is black and "no brightness
 * filter" is not.
 */
function FilterCell({
	label,
	durableText,
	min,
	max,
	suffix,
	onCommit,
	testId,
}: {
	readonly label: string;
	readonly durableText: string;
	readonly min?: number;
	readonly max?: number;
	readonly suffix?: string;
	readonly onCommit: (amount: number | undefined) => void;
	readonly testId?: string;
}): ReactNode {
	const [draft, setDraft] = useState<string | null>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: the draft intentionally resets whenever the durable value changes (external commit, undo, selection change).
	useEffect(() => setDraft(null), [durableText]);
	const text = draft ?? durableText;
	const invalid = draft !== null && draft !== "" && !isFinite(Number(draft));

	const commitDraft = (): void => {
		if (draft === null) {
			return;
		}
		const trimmed = draft.trim();
		if (trimmed === "") {
			setDraft(null);
			onCommit(undefined);
			return;
		}
		const amount = Number(trimmed);
		if (!isFinite(amount)) {
			return; // invalid draft retained, never committed
		}
		setDraft(null);
		let clamped = amount;
		if (min !== undefined) clamped = Math.max(min, clamped);
		if (max !== undefined) clamped = Math.min(max, clamped);
		onCommit(clamped);
	};

	return (
		<div className="flex items-center gap-1">
			<span className="w-16 shrink-0 truncate text-[10px] text-[var(--ak-studio-muted-fg)]">
				{label}
			</span>
			<Input
				type="text"
				inputMode="decimal"
				value={text}
				aria-invalid={invalid || undefined}
				aria-label={label}
				className={cn(
					"h-7 min-w-0 flex-1 text-xs",
					invalid && "border-red-500",
				)}
				onChange={(event) => setDraft(event.target.value)}
				onBlur={commitDraft}
				onKeyDown={(event) => {
					if (event.key === "Enter") commitDraft();
				}}
				data-testid={testId}
			/>
			{suffix === undefined ? null : (
				<span className="w-5 shrink-0 text-[10px] text-[var(--ak-studio-muted-fg)]">
					{suffix}
				</span>
			)}
		</div>
	);
}

/**
 * The P0 filter set, whole: `blur` plus the four ratios. Every member
 * is optional and each cell writes the **whole** spec back, so editing
 * contrast cannot drop the blur beside it. A bag with no members left
 * is the absence of the property, not a stored `{}` —
 * `serializeFilter` returns `null` for one, so storing it would be
 * unreachable state.
 */
export function FilterControl({
	label,
	field,
	testId,
}: StructuredControlProps<FilterSpec>): ReactNode {
	const msg = useMsg();
	const value = fieldValue(field.state);

	const write = (patch: Partial<Record<keyof FilterSpec, unknown>>): void => {
		const next: Record<string, unknown> = { ...value, ...patch };
		for (const key of Object.keys(next)) {
			if (next[key] === undefined) delete next[key];
		}
		if (Object.keys(next).length === 0) {
			field.reset();
			return;
		}
		field.commit(next as FilterSpec);
	};

	return (
		<InspectorFieldShell
			label={label}
			state={field.state}
			onReset={() => field.reset()}
			// Five labelled cells: the full panel width, label above.
			layout="stack"
		>
			<div className="flex flex-col gap-1" data-testid={testId}>
				<FilterCell
					label={msg("studio.editor.inspector.style.blur")}
					durableText={
						value?.blur === undefined ? "" : String(lengthNumber(value.blur))
					}
					min={0}
					suffix="px"
					onCommit={(amount) =>
						write({ blur: amount === undefined ? undefined : px(amount) })
					}
					testId="ak-style-filter-blur"
				/>
				{FILTER_RATIOS.map((ratio) => {
					const current = value === undefined ? undefined : value[ratio.key];
					return (
						<FilterCell
							key={ratio.key}
							label={msg(ratio.labelKey)}
							durableText={current === undefined ? "" : String(current)}
							min={ratio.min}
							max={ratio.max}
							onCommit={(amount) => write({ [ratio.key]: amount })}
							testId={`ak-style-filter-${ratio.key}`}
						/>
					);
				})}
			</div>
		</InspectorFieldShell>
	);
}
