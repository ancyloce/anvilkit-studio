"use client";

/**
 * @file `StyleSection` — the §11.5 P0 visual-style controls
 * (PLAN-0020 CORE-P1A-007; ED-STYLE-001).
 *
 * Fill (none/solid/linear-gradient/image), border (all-edge width /
 * style / color written per-edge under the hood), radius linked /
 * per-corner, multi-layer shadows (add/remove/edit), opacity, and the
 * basic filter set (blur). Token attach/detach affordances are
 * type-compatible but the picker is deferred to Phase 2 — token
 * values render a badge and detach via reset. All writes are
 * `node.style.set` patches; no `!important` ever (serializer rule).
 */

import type {
	BorderSpec,
	CssColor,
	CssCorners,
	CssLength,
	FilterSpec,
	Paint,
	ShadowSpec,
	TokenOrLiteral,
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
import { useMsg } from "@/state/editor-i18n-context";
import { LengthControl } from "../../controls/LengthControl.js";
import { NumberControl } from "../../controls/NumberControl.js";
import { InspectorFieldShell } from "../../InspectorFieldShell.js";
import type { InspectorSectionProps } from "../../sections-registry.js";
import {
	type InspectorFieldHandle,
	useInspectorField,
} from "../../use-inspector.js";

const FILL_KINDS = ["none", "solid", "linear-gradient", "image"] as const;
const BORDER_STYLES = ["none", "solid", "dashed", "dotted"] as const;

const BLACK: TokenOrLiteral<CssColor> = {
	kind: "literal",
	value: { kind: "hex", value: "#000000" },
};

function px(value: number): CssLength {
	return { kind: "unit", value, unit: "px" };
}

/** Fill editor: kind select + per-kind minimal editors. */
function FillControl({
	field,
}: {
	readonly field: InspectorFieldHandle<Paint>;
}): ReactNode {
	const msg = useMsg();
	const value = field.state.kind === "value" ? field.state.value : undefined;
	const kind = value?.kind;
	return (
		<InspectorFieldShell
			label={msg("studio.editor.inspector.style.fill")}
			state={field.state}
			onReset={() => void field.reset()}
			// Kind select plus a per-kind editor beneath it.
			layout="stack"
		>
			<div className="flex flex-col gap-1.5">
				<Select
					value={kind ?? "__unset__"}
					onValueChange={(next) => {
						if (next === "__unset__") {
							void field.reset();
							return;
						}
						if (next === "none") {
							void field.commit({ kind: "none" });
						} else if (next === "solid") {
							void field.commit({ kind: "solid", color: BLACK });
						} else if (next === "linear-gradient") {
							void field.commit({
								kind: "linear-gradient",
								angle: 180,
								stops: [
									{ color: BLACK, offset: 0 },
									{
										color: {
											kind: "literal",
											value: { kind: "hex", value: "#ffffff" },
										},
										offset: 1,
									},
								],
							});
						} else {
							void field.commit({ kind: "image", src: "", fit: "cover" });
						}
					}}
				>
					<SelectTrigger
						size="sm"
						aria-label={msg("studio.editor.inspector.style.fill")}
						className="h-7 w-full text-xs"
						data-testid="ak-style-fill-kind"
					>
						{/*
						 * The unset sentinel is a *selected* value, so the
						 * trigger's placeholder never applies to it — without
						 * this the closed trigger reads `__unset__`.
						 */}
						<SelectValue placeholder={msg("studio.editor.inspector.unset")}>
							{(value: unknown) =>
								typeof value === "string" && value !== "__unset__"
									? msg(`studio.editor.inspector.style.fill.${value}`)
									: msg("studio.editor.inspector.unset")
							}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="__unset__">
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
					<SolidColorRow field={field} paint={value} />
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

function SolidColorRow({
	field,
	paint,
}: {
	readonly field: InspectorFieldHandle<Paint>;
	readonly paint: Extract<Paint, { kind: "solid" }>;
}): ReactNode {
	const msg = useMsg();
	const hex =
		paint.color.kind === "literal" && paint.color.value.kind === "hex"
			? paint.color.value.value
			: "#000000";
	return (
		<input
			type="color"
			value={/^#[0-9a-f]{6}$/i.test(hex) ? hex : "#000000"}
			aria-label={msg("studio.editor.inspector.style.fillColor")}
			className="h-7 w-full cursor-pointer rounded border border-[var(--ak-studio-border)] bg-transparent p-0.5"
			onChange={(event) =>
				void field.commit({
					kind: "solid",
					color: {
						kind: "literal",
						value: { kind: "hex", value: event.target.value },
					},
				})
			}
			data-testid="ak-style-fill-color"
		/>
	);
}

function GradientRow({
	field,
	paint,
}: {
	readonly field: InspectorFieldHandle<Paint>;
	readonly paint: Extract<Paint, { kind: "linear-gradient" }>;
}): ReactNode {
	const msg = useMsg();
	const stopHex = (index: number): string => {
		const color = paint.stops[index]?.color;
		return color?.kind === "literal" && color.value.kind === "hex"
			? color.value.value
			: "#000000";
	};
	const writeStop = (index: number, hex: string): void => {
		const stops = paint.stops.map((stop, i) =>
			i === index
				? {
						...stop,
						color: {
							kind: "literal" as const,
							value: { kind: "hex" as const, value: hex },
						},
					}
				: stop,
		);
		void field.commit({ ...paint, stops });
	};
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
					if (isFinite(angle)) {
						void field.commit({ ...paint, angle });
					}
				}}
			/>
			{paint.stops.slice(0, 2).map((stop, index) => (
				<input
					// biome-ignore lint/suspicious/noArrayIndexKey: gradient stops have no identity beyond position.
					key={index}
					type="color"
					value={
						/^#[0-9a-f]{6}$/i.test(stopHex(index)) ? stopHex(index) : "#000000"
					}
					aria-label={`${msg("studio.editor.inspector.style.gradientStop")} ${index + 1}`}
					className="size-7 shrink-0 cursor-pointer rounded border border-[var(--ak-studio-border)] bg-transparent p-0.5"
					onChange={(event) => writeStop(index, event.target.value)}
				/>
			))}
		</div>
	);
}

function ImageSrcRow({
	field,
	paint,
}: {
	readonly field: InspectorFieldHandle<Paint>;
	readonly paint: Extract<Paint, { kind: "image" }>;
}): ReactNode {
	const msg = useMsg();
	const [draft, setDraft] = useState<string | null>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: draft resets when the durable src changes externally.
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
				if (draft !== null) {
					setDraft(null);
					void field.commit({ ...paint, src: draft.trim() });
				}
			}}
			data-testid="ak-style-image-src"
		/>
	);
}

/** All-edge border editor writing the four edges in one patch. */
function BorderControl({
	field,
}: {
	readonly field: InspectorFieldHandle<BorderSpec>;
}): ReactNode {
	const msg = useMsg();
	const value = field.state.kind === "value" ? field.state.value : undefined;
	const top = value?.top;
	const writeAll = (patch: Partial<NonNullable<BorderSpec["top"]>>): void => {
		const edge = { ...top, ...patch };
		void field.commit({
			top: edge,
			right: edge,
			bottom: edge,
			left: edge,
		});
	};
	const widthValue = top?.width?.kind === "unit" ? top.width.value : 0;
	const hex =
		top?.color?.kind === "literal" && top.color.value.kind === "hex"
			? top.color.value.value
			: "#000000";
	return (
		<InspectorFieldShell
			label={msg("studio.editor.inspector.style.border")}
			state={field.state}
			onReset={() => void field.reset()}
			// Width + style + colour on one line needs the full width.
			layout="stack"
		>
			<div className="flex items-center gap-1" data-testid="ak-style-border">
				<Input
					type="text"
					inputMode="decimal"
					value={String(widthValue)}
					aria-label={msg("studio.editor.inspector.style.borderWidth")}
					className="h-7 w-14 text-xs"
					onChange={(event) => {
						const width = Number(event.target.value);
						if (isFinite(width) && width >= 0) {
							writeAll({ width: px(width) });
						}
					}}
				/>
				<Select
					value={top?.style ?? "solid"}
					onValueChange={(next) =>
						writeAll({ style: next as (typeof BORDER_STYLES)[number] })
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
				<input
					type="color"
					value={/^#[0-9a-f]{6}$/i.test(hex) ? hex : "#000000"}
					aria-label={msg("studio.editor.inspector.style.borderColor")}
					className="size-7 shrink-0 cursor-pointer rounded border border-[var(--ak-studio-border)] bg-transparent p-0.5"
					onChange={(event) =>
						writeAll({
							color: {
								kind: "literal",
								value: { kind: "hex", value: event.target.value },
							},
						})
					}
				/>
			</div>
		</InspectorFieldShell>
	);
}

/** Linked / per-corner radius editor. */
function RadiusControl({
	field,
}: {
	readonly field: InspectorFieldHandle<CssCorners>;
}): ReactNode {
	const msg = useMsg();
	const [perCorner, setPerCorner] = useState(false);
	const value = field.state.kind === "value" ? field.state.value : undefined;
	const cornerValue = (corner: keyof CssCorners): number => {
		const entry = value?.[corner];
		return entry?.kind === "unit" ? entry.value : 0;
	};
	const writeLinked = (amount: number): void => {
		const length = px(amount);
		void field.commit({
			topLeft: length,
			topRight: length,
			bottomRight: length,
			bottomLeft: length,
		});
	};
	const corners: readonly (keyof CssCorners)[] = [
		"topLeft",
		"topRight",
		"bottomRight",
		"bottomLeft",
	];
	return (
		<InspectorFieldShell
			label={msg("studio.editor.inspector.style.radius")}
			state={field.state}
			onReset={() => void field.reset()}
			// Per-corner mode lays out four inputs side by side.
			layout="stack"
		>
			<div className="flex flex-col gap-1" data-testid="ak-style-radius">
				<div className="flex items-center gap-1">
					{perCorner ? (
						<div className="grid flex-1 grid-cols-4 gap-1">
							{corners.map((corner) => (
								<Input
									key={corner}
									type="text"
									inputMode="decimal"
									value={String(cornerValue(corner))}
									aria-label={`${msg("studio.editor.inspector.style.radius")} ${corner}`}
									className="h-7 text-xs"
									onChange={(event) => {
										const amount = Number(event.target.value);
										if (isFinite(amount) && amount >= 0) {
											void field.commit({
												[corner]: px(amount),
											} as CssCorners);
										}
									}}
								/>
							))}
						</div>
					) : (
						<Input
							type="text"
							inputMode="decimal"
							value={String(cornerValue("topLeft"))}
							aria-label={msg("studio.editor.inspector.style.radius")}
							className="h-7 flex-1 text-xs"
							onChange={(event) => {
								const amount = Number(event.target.value);
								if (isFinite(amount) && amount >= 0) {
									writeLinked(amount);
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
			</div>
		</InspectorFieldShell>
	);
}

/** Multi-layer shadow list editor. */
function ShadowsControl({
	field,
}: {
	readonly field: InspectorFieldHandle<readonly ShadowSpec[]>;
}): ReactNode {
	const msg = useMsg();
	const shadows = field.state.kind === "value" ? field.state.value : [];
	const write = (next: readonly ShadowSpec[]): void => {
		if (next.length === 0) {
			void field.reset();
			return;
		}
		void field.commit(next);
	};
	return (
		<InspectorFieldShell
			label={msg("studio.editor.inspector.style.shadows")}
			state={field.state}
			onReset={() => void field.reset()}
			// A list of shadow layers, one row each.
			layout="stack"
		>
			<div className="flex flex-col gap-1" data-testid="ak-style-shadows">
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
									shadows.map((s, i) =>
										i === index
											? { ...s, kind: next as ShadowSpec["kind"] }
											: s,
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
								<SelectItem value="drop">drop</SelectItem>
								<SelectItem value="inner">inner</SelectItem>
							</SelectContent>
						</Select>
						<input
							type="color"
							value={
								shadow.color.kind === "literal" &&
								shadow.color.value.kind === "hex" &&
								/^#[0-9a-f]{6}$/i.test(shadow.color.value.value)
									? shadow.color.value.value
									: "#000000"
							}
							aria-label={`${msg("studio.editor.inspector.style.shadowColor")} ${index + 1}`}
							className="size-7 shrink-0 cursor-pointer rounded border border-[var(--ak-studio-border)] bg-transparent p-0.5"
							onChange={(event) =>
								write(
									shadows.map((s, i) =>
										i === index
											? {
													...s,
													color: {
														kind: "literal",
														value: {
															kind: "hex",
															value: event.target.value,
														},
													},
												}
											: s,
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
							onClick={() => write(shadows.filter((_, i) => i !== index))}
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

/** The visual style section body. */
export function StyleSection({ context }: InspectorSectionProps): ReactNode {
	const msg = useMsg();
	const background = useInspectorField<Paint>(context, "style", "background");
	const border = useInspectorField<BorderSpec>(context, "style", "border");
	const radius = useInspectorField<CssCorners>(context, "style", "radius");
	const opacity = useInspectorField<number>(context, "style", "opacity");
	const shadows = useInspectorField<readonly ShadowSpec[]>(
		context,
		"style",
		"shadows",
	);
	const filter = useInspectorField<FilterSpec>(context, "style", "filter");
	const blur =
		filter.state.kind === "value" ? filter.state.value.blur : undefined;
	const blurValue = blur?.kind === "unit" ? blur.value : 0;

	return (
		<div className="flex flex-col gap-2.5" data-testid="ak-style-section">
			<FillControl field={background} />
			<BorderControl field={border} />
			<RadiusControl field={radius} />
			<ShadowsControl field={shadows} />
			<NumberControl
				label={msg("studio.editor.inspector.style.opacity")}
				field={opacity}
				min={0}
				max={1}
				step={0.1}
				testId="ak-style-opacity"
			/>
			<InspectorFieldShell
				label={msg("studio.editor.inspector.style.blur")}
				state={filter.state}
				onReset={() => void filter.reset()}
			>
				<Input
					type="text"
					inputMode="decimal"
					value={String(blurValue)}
					aria-label={msg("studio.editor.inspector.style.blur")}
					className="h-7 text-xs"
					onChange={(event) => {
						const amount = Number(event.target.value);
						if (isFinite(amount) && amount >= 0) {
							void filter.commit({ blur: px(amount) });
						}
					}}
					data-testid="ak-style-filter-blur"
				/>
			</InspectorFieldShell>
		</div>
	);
}
