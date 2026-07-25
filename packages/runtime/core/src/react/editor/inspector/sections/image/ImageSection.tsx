"use client";

/**
 * @file `ImageSection` — replace / alt / decorative / fit / focal /
 * rotation controls for declared image targets (PLAN-0020
 * CORE-P1B-010; ED-IMAGE-001/002).
 *
 * Visible only when the primary selected node's component declares
 * `metadata.editor.capabilities.imageAdjust`. Writes are prop writes
 * through the port's native-mutation path (one recording dispatch
 * per commit): `srcPropPath` for replace, `altPropPath` for alt text
 * and decorative mode (EMPTY alt — an explicit choice), and
 * `cropPropPath` (when declared) for the normalized
 * `ImageAdjustment`. Upload/storage stays with the host asset
 * adapter (the established `plugin-asset-manager` idiom); this
 * section accepts URLs/refs directly. The legacy image-drop
 * heuristic remains the fallback for undeclared components
 * (ED-IMAGE-002 — precedence wired in the drop controller).
 */

import type { ImageAdjustment, ImageTarget } from "@anvilkit/contracts/editor";
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
import type { InternalEditorCommandPort } from "../../../command-port.js";
import {
	defaultImageAdjustment,
	normalizeImageAdjustment,
} from "../../../inline/image/adjustments.js";
import { findNodeProps, setNodeProp } from "../../../native-tree.js";
import type { InspectorSectionProps } from "../../sections-registry.js";

const FITS = ["cover", "contain", "fill", "none", "scale-down"] as const;
const ROTATIONS = ["0", "90", "180", "270"] as const;

function toPath(raw: string): readonly (string | number)[] {
	return raw
		.split(".")
		.map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment));
}

function readPath(host: unknown, raw: string): unknown {
	let current = host;
	for (const segment of toPath(raw)) {
		if (typeof current !== "object" || current === null) {
			return undefined;
		}
		current = (current as Record<string, unknown>)[String(segment)];
	}
	return current;
}

/** The image section body (first declared target of the primary). */
export function ImageSection({ context }: InspectorSectionProps): ReactNode {
	const msg = useMsg();
	const { bridge, selection } = context;
	const primary = selection.primaryId;
	const port = bridge.port as InternalEditorCommandPort | null;
	const metadata =
		primary === undefined ? undefined : bridge.capabilities?.forNode(primary);
	const target: ImageTarget | undefined =
		metadata?.capabilities.imageAdjust?.[0];

	const props =
		primary === undefined || port === null
			? null
			: findNodeProps(port.readData(), primary);
	const src =
		target === undefined || props === null
			? ""
			: String(readPath(props, target.srcPropPath) ?? "");
	const alt =
		target?.altPropPath === undefined || props === null
			? undefined
			: readPath(props, target.altPropPath);
	const adjustment: ImageAdjustment =
		target?.cropPropPath === undefined || props === null
			? defaultImageAdjustment()
			: ((readPath(props, target.cropPropPath) as
					| ImageAdjustment
					| undefined) ?? defaultImageAdjustment());

	const [srcDraft, setSrcDraft] = useState<string | null>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: the draft resets when the durable src changes externally.
	useEffect(() => setSrcDraft(null), [src]);

	if (target === undefined || primary === undefined || port === null) {
		return null;
	}

	const write = (raw: string, value: unknown): void => {
		port.commitNative((data, authoring) => {
			const next = setNodeProp(data, primary, toPath(raw), value);
			return next === null ? null : { data: next, authoring };
		});
	};
	const writeAdjustment = (patch: Partial<ImageAdjustment>): void => {
		if (target.cropPropPath === undefined) {
			return;
		}
		write(
			target.cropPropPath,
			normalizeImageAdjustment({ ...adjustment, ...patch }),
		);
	};

	return (
		<div className="flex flex-col gap-2.5" data-testid="ak-image-section">
			<div className="flex flex-col gap-1">
				<span className="text-[11px] font-medium text-[var(--ak-studio-muted-fg)]">
					{msg("studio.editor.image.src")}
				</span>
				<Input
					type="text"
					value={srcDraft ?? src}
					aria-label={msg("studio.editor.image.src")}
					className="h-7 text-xs"
					data-testid="ak-image-src"
					onChange={(event) => setSrcDraft(event.target.value)}
					onBlur={() => {
						if (srcDraft !== null && srcDraft.trim() !== src) {
							write(target.srcPropPath, srcDraft.trim());
						}
						setSrcDraft(null);
					}}
				/>
			</div>
			{target.altPropPath !== undefined ? (
				<div className="flex flex-col gap-1">
					<span className="text-[11px] font-medium text-[var(--ak-studio-muted-fg)]">
						{msg("studio.editor.image.alt")}
					</span>
					<div className="flex items-center gap-1">
						<Input
							type="text"
							value={typeof alt === "string" ? alt : ""}
							aria-label={msg("studio.editor.image.alt")}
							className="h-7 flex-1 text-xs"
							data-testid="ak-image-alt"
							onChange={(event) =>
								write(target.altPropPath as string, event.target.value)
							}
						/>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="h-7 px-2 text-[10px]"
							data-testid="ak-image-decorative"
							onClick={() => write(target.altPropPath as string, "")}
						>
							{msg("studio.editor.image.decorative")}
						</Button>
					</div>
				</div>
			) : null}
			{target.cropPropPath !== undefined ? (
				<>
					<div className="grid grid-cols-2 gap-2">
						<Select
							value={adjustment.fit}
							onValueChange={(next) => {
								if (next !== null) {
									writeAdjustment({ fit: next as ImageAdjustment["fit"] });
								}
							}}
						>
							<SelectTrigger
								size="sm"
								className="h-7 text-xs"
								aria-label={msg("studio.editor.image.fit")}
								data-testid="ak-image-fit"
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{FITS.map((fit) => (
									<SelectItem key={fit} value={fit}>
										{fit}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Select
							value={String(adjustment.rotation ?? 0)}
							onValueChange={(next) => {
								if (next !== null) {
									writeAdjustment({
										rotation: Number(next) as ImageAdjustment["rotation"],
									});
								}
							}}
						>
							<SelectTrigger
								size="sm"
								className="h-7 text-xs"
								aria-label={msg("studio.editor.image.rotation")}
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{ROTATIONS.map((deg) => (
									<SelectItem key={deg} value={deg}>
										{deg}°
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="grid grid-cols-2 gap-2">
						{(["x", "y"] as const).map((axis) => (
							<Input
								key={axis}
								type="text"
								inputMode="decimal"
								value={String(adjustment.position[axis])}
								aria-label={`${msg("studio.editor.image.focal")} ${axis}`}
								className="h-7 text-xs"
								data-testid={`ak-image-focal-${axis}`}
								onChange={(event) => {
									const value = Number(event.target.value);
									if (Number.isFinite(value)) {
										writeAdjustment({
											position: { ...adjustment.position, [axis]: value },
										});
									}
								}}
							/>
						))}
					</div>
				</>
			) : null}
		</div>
	);
}
