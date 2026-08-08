"use client";

/**
 * @file `GridTracksControl` — the `columns` / `rows` grid track list
 * editor (PLAN-0028 `p5-005`; DD-0019 §11.5 `GridTrackList`).
 *
 * Replaces `p4-001`'s placeholder (`TrackCountControl`), which wrote N
 * repeated `1fr` tracks from a single count box and could therefore
 * express exactly one of the three declared track kinds. `ED-LAYOUT-002`
 * asks for flex **and grid**, so this editor edits the list itself:
 * add, remove, retype and resize every track independently.
 *
 * **Whole-list writes.** `updateAppearanceInData` assigns
 * `layout.columns` / `layout.rows` rather than merging into them, so
 * every edit rebuilds the array and commits it entire — the same rule
 * the shadow-layer and box-edges editors follow.
 *
 * **An empty list is not a value.** `serializeGridTracks`
 * (`editor/style/css-serializer.ts`) returns `null` for a zero-length
 * list, so removing the last track resets the property at the layer
 * rather than storing a `[]` the stylesheet would silently drop.
 *
 * **The value model is exactly `GridTrack`** — `fr`, `fixed` (a
 * `CssLength`) and `auto`, no fourth kind and no raw text. Fixed tracks
 * are authored as number-plus-unit over {@link DEFAULT_LENGTH_UNITS};
 * that is a strict subset of what `serializeCssLength` accepts, so no
 * value this control can build is one the serializer drops.
 */

import type {
	CssUnit,
	GridTrack,
	GridTrackList,
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
import { fieldValue, type StyleFieldHandle } from "./handle.js";
import { DEFAULT_LENGTH_UNITS } from "./LengthControl.js";

/** The three declared track kinds (`values.ts` `GridTrack`). */
const TRACK_KINDS = ["fr", "fixed", "auto"] as const;
type TrackKind = (typeof TRACK_KINDS)[number];

/** Track kind → catalog key. Full literals: the parity gate reads them. */
const TRACK_KIND_LABELS: Readonly<Record<TrackKind, string>> = {
	fr: "studio.editor.inspector.layout.track.fr",
	fixed: "studio.editor.inspector.layout.track.fixed",
	auto: "studio.editor.inspector.layout.track.auto",
};

/**
 * Upper bound on authorable tracks. Carried over from the control this
 * replaces: a grid with more than two dozen explicit tracks is a data
 * problem, and an unbounded list is an unbounded write.
 */
const MAX_TRACKS = 24;

/** The number a track carries, as input text (`auto` carries none). */
function trackNumber(track: GridTrack): string {
	if (track.kind === "fr") {
		return String(track.value);
	}
	if (track.kind === "fixed" && track.length.kind === "unit") {
		return String(track.length.value);
	}
	return "";
}

/** The unit a fixed track carries; `px` for the kinds that carry none. */
function trackUnit(track: GridTrack): CssUnit {
	return track.kind === "fixed" && track.length.kind === "unit"
		? track.length.unit
		: "px";
}

/** Retype a track, carrying its number across where one exists. */
function retype(track: GridTrack, kind: TrackKind): GridTrack {
	if (kind === track.kind) {
		return track;
	}
	if (kind === "auto") {
		return { kind: "auto" };
	}
	const carried = Number(trackNumber(track));
	if (kind === "fr") {
		return {
			kind: "fr",
			value: isFinite(carried) && carried > 0 ? carried : 1,
		};
	}
	return {
		kind: "fixed",
		length: {
			kind: "unit",
			value: isFinite(carried) && carried !== 0 ? carried : 100,
			unit: trackUnit(track),
		},
	};
}

/** Resize a track; `auto` has no size and is returned unchanged. */
function resize(track: GridTrack, amount: number): GridTrack {
	if (track.kind === "fr") {
		return { kind: "fr", value: amount };
	}
	if (track.kind === "fixed") {
		return {
			kind: "fixed",
			length: { kind: "unit", value: amount, unit: trackUnit(track) },
		};
	}
	return track;
}

/** Re-unit a fixed track; the other kinds carry no unit. */
function reunit(track: GridTrack, unit: CssUnit): GridTrack {
	if (track.kind !== "fixed") {
		return track;
	}
	return {
		kind: "fixed",
		length: {
			kind: "unit",
			value: track.length.kind === "unit" ? track.length.value : 0,
			unit,
		},
	};
}

/** One track's row: kind, size, unit, remove. */
function TrackRow({
	track,
	onChange,
	onRemove,
}: {
	readonly track: GridTrack;
	readonly onChange: (next: GridTrack) => void;
	readonly onRemove: () => void;
}): ReactNode {
	const msg = useMsg();
	const durableText = trackNumber(track);
	const [draft, setDraft] = useState<string | null>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: the draft intentionally resets whenever the durable value changes (external commit, undo, selection change).
	useEffect(() => setDraft(null), [durableText]);
	const text = draft ?? durableText;
	const invalid = draft !== null && draft !== "" && !isFinite(Number(draft));

	const commitDraft = (): void => {
		if (draft === null) {
			return;
		}
		const amount = Number(draft.trim());
		if (draft.trim() === "" || !isFinite(amount)) {
			return; // invalid draft retained, never committed (§11.3)
		}
		setDraft(null);
		onChange(resize(track, amount));
	};

	return (
		<div className="flex items-center gap-1">
			<Select
				value={track.kind}
				onValueChange={(next) => {
					if (typeof next === "string") {
						onChange(retype(track, next as TrackKind));
					}
				}}
			>
				<SelectTrigger
					size="sm"
					aria-label={msg("studio.editor.inspector.layout.track.kind")}
					className="h-7 w-20 shrink-0 text-xs"
				>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{TRACK_KINDS.map((kind) => (
						<SelectItem key={kind} value={kind}>
							{msg(TRACK_KIND_LABELS[kind])}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Input
				type="text"
				inputMode="decimal"
				value={track.kind === "auto" ? "" : text}
				disabled={track.kind === "auto"}
				aria-invalid={invalid || undefined}
				aria-label={msg("studio.editor.inspector.layout.track.size")}
				className={cn(
					"h-7 min-w-0 flex-1 text-xs",
					invalid && "border-red-500",
				)}
				onChange={(event) => setDraft(event.target.value)}
				onBlur={commitDraft}
				onKeyDown={(event) => {
					if (event.key === "Enter") {
						commitDraft();
					}
				}}
			/>
			{track.kind === "fixed" ? (
				<Select
					value={trackUnit(track)}
					onValueChange={(next) => {
						if (typeof next === "string") {
							// Unit switch keeps the number — never rescales.
							onChange(reunit(track, next as CssUnit));
						}
					}}
				>
					<SelectTrigger
						size="sm"
						aria-label={msg("studio.editor.inspector.unit")}
						className="h-7 w-16 shrink-0 text-xs"
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{DEFAULT_LENGTH_UNITS.map((unit) => (
							<SelectItem key={unit} value={unit}>
								{unit}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			) : (
				<span className="w-16 shrink-0" aria-hidden="true" />
			)}
			<Button
				type="button"
				variant="ghost"
				size="icon"
				className="size-7 shrink-0"
				aria-label={msg("studio.editor.inspector.layout.track.remove")}
				onClick={onRemove}
			>
				<Trash2 className="size-3" aria-hidden="true" />
			</Button>
		</div>
	);
}

/** Props for {@link GridTracksControl}. */
export interface GridTracksControlProps {
	readonly label: string;
	readonly field: StyleFieldHandle<GridTrackList>;
	readonly testId?: string;
}

/** Grid track list editor: add / remove / retype / resize per track. */
export function GridTracksControl({
	label,
	field,
	testId,
}: GridTracksControlProps): ReactNode {
	const msg = useMsg();
	const tracks = fieldValue(field.state) ?? [];

	const write = (next: readonly GridTrack[]): void => {
		if (next.length === 0) {
			field.reset();
			return;
		}
		field.commit(next.slice(0, MAX_TRACKS));
	};

	return (
		<InspectorFieldShell
			label={label}
			state={field.state}
			onReset={() => field.reset()}
			// One row per track: the full panel width, label above.
			layout="stack"
		>
			<div className="flex flex-col gap-1" data-testid={testId}>
				{tracks.map((track, index) => (
					<TrackRow
						// biome-ignore lint/suspicious/noArrayIndexKey: grid tracks have no identity beyond order.
						key={index}
						track={track}
						onChange={(next) =>
							write(tracks.map((entry, at) => (at === index ? next : entry)))
						}
						onRemove={() => write(tracks.filter((_, at) => at !== index))}
					/>
				))}
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="h-7 text-xs"
					disabled={tracks.length >= MAX_TRACKS}
					onClick={() => write([...tracks, { kind: "fr", value: 1 }])}
					data-testid={
						testId !== undefined ? `${testId}-add` : "ak-style-add-track"
					}
				>
					<Plus className="size-3" aria-hidden="true" />
					{msg("studio.editor.inspector.layout.track.add")}
				</Button>
			</div>
		</InspectorFieldShell>
	);
}
