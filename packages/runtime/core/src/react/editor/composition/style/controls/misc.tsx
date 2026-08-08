"use client";

/**
 * @file The remaining style controls: a slider, a plain text editor, a
 * boolean switch, and the style-definition attach list (PLAN-0028
 * `p4-001`).
 *
 * The grid track editor left this file with `p5-005`: `TrackCountControl`
 * could write only N repeated `1fr` tracks, and its replacement
 * (`controls/tracks.tsx`) edits the declared `GridTrackList` itself.
 *
 * {@link SliderControl} is where the task's coalescing requirement is
 * actually satisfied. Base UI's slider distinguishes `onValueChange`
 * (fires on every pointer move) from `onValueCommitted` (fires once,
 * when the gesture ends). Moves feed a **local** preview and commit
 * nothing; the single commit happens on `onValueCommitted`. A drag is
 * therefore one commit and one undo *by construction* — it does not
 * depend on beating Puck's 300 ms history-record debounce, which would
 * silently produce several entries for a slow scrub.
 */

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
import { Slider } from "@/primitives/slider";
import { Switch } from "@/primitives/switch";
import { useMsg } from "@/state/editor-i18n-context";
import { InspectorFieldShell } from "../../../inspector/InspectorFieldShell.js";
import { fieldValue, type StyleFieldHandle } from "./handle.js";

/* ------------------------------------------------------------------ *
 * Slider — one gesture, one commit
 * ------------------------------------------------------------------ */

/** Props for {@link SliderControl}. */
export interface SliderControlProps {
	readonly label: string;
	readonly field: StyleFieldHandle<number>;
	readonly min: number;
	readonly max: number;
	readonly step: number;
	/** Decimal places in the numeric readout. */
	readonly precision?: number;
	readonly testId?: string;
}

/** Numeric slider that commits exactly once per gesture. */
export function SliderControl({
	label,
	field,
	min,
	max,
	step,
	precision = 2,
	testId,
}: SliderControlProps): ReactNode {
	const durable = fieldValue(field.state);
	const [preview, setPreview] = useState<number | null>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: the preview intentionally clears whenever the durable value changes (commit, undo, selection change).
	useEffect(() => setPreview(null), [durable]);
	const shown = preview ?? durable ?? max;

	return (
		<InspectorFieldShell
			label={label}
			state={field.state}
			onReset={() => field.reset()}
		>
			<div className="flex items-center gap-2">
				<Slider
					aria-label={label}
					className="min-w-0 flex-1"
					min={min}
					max={max}
					step={step}
					value={shown}
					onValueChange={(next) => {
						// Preview only. Committing here is what turns one drag
						// into a history entry per pointer move.
						if (typeof next === "number") setPreview(next);
					}}
					onValueCommitted={(next) => {
						if (typeof next !== "number") return;
						setPreview(null);
						field.commit(next);
					}}
					data-testid={testId}
				/>
				<span
					className="w-9 shrink-0 text-right font-mono text-[10px] text-[var(--ak-studio-muted-fg)] tabular-nums"
					data-testid={testId !== undefined ? `${testId}-value` : undefined}
				>
					{shown.toFixed(precision)}
				</span>
			</div>
		</InspectorFieldShell>
	);
}

/* ------------------------------------------------------------------ *
 * Text — the font-family literal
 * ------------------------------------------------------------------ */

/** Props for {@link TextControl}. */
export interface TextControlProps {
	readonly label: string;
	readonly field: StyleFieldHandle<string>;
	readonly placeholder?: string;
	readonly testId?: string;
}

/** Free-text editor; an emptied field resets at the layer. */
export function TextControl({
	label,
	field,
	placeholder,
	testId,
}: TextControlProps): ReactNode {
	const durable = fieldValue(field.state) ?? "";
	const [draft, setDraft] = useState<string | null>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: the draft resets when the durable value changes externally.
	useEffect(() => setDraft(null), [durable]);
	const commitDraft = (): void => {
		if (draft === null) return;
		const trimmed = draft.trim();
		setDraft(null);
		if (trimmed === "") field.reset();
		else field.commit(trimmed);
	};
	return (
		<InspectorFieldShell
			label={label}
			state={field.state}
			onReset={() => field.reset()}
		>
			<Input
				type="text"
				value={draft ?? durable}
				placeholder={placeholder}
				aria-label={label}
				className="h-7 text-xs"
				onChange={(event) => setDraft(event.target.value)}
				onBlur={commitDraft}
				onKeyDown={(event) => {
					if (event.key === "Enter") commitDraft();
				}}
				data-testid={testId}
			/>
		</InspectorFieldShell>
	);
}

/* ------------------------------------------------------------------ *
 * Boolean — the target's `hidden` flag
 * ------------------------------------------------------------------ */

/** Props for {@link SwitchControl}. */
export interface SwitchControlProps {
	readonly label: string;
	readonly field: StyleFieldHandle<boolean>;
	readonly testId?: string;
}

/** Boolean switch bound to one style field. */
export function SwitchControl({
	label,
	field,
	testId,
}: SwitchControlProps): ReactNode {
	const value = fieldValue(field.state);
	return (
		<InspectorFieldShell
			label={label}
			state={field.state}
			onReset={() => field.reset()}
		>
			<Switch
				checked={value === true}
				aria-label={label}
				onCheckedChange={(next: boolean) => {
					// `false` is a real authored value, not an absence: hiding a
					// target at `md` and un-hiding it at `md` are different from
					// saying nothing at `md`. Clearing is the reset affordance.
					field.commit(next);
				}}
				data-testid={testId}
			/>
		</InspectorFieldShell>
	);
}

/* ------------------------------------------------------------------ *
 * Style references — the target's ordered `styleRefs`
 * ------------------------------------------------------------------ */

/** One attachable style definition. */
export interface StyleDefinitionChoice {
	readonly id: string;
	readonly name: string;
}

/** Props for {@link StyleRefsControl}. */
export interface StyleRefsControlProps {
	readonly label: string;
	readonly field: StyleFieldHandle<readonly string[]>;
	/** Document-local definitions available to attach. */
	readonly definitions: readonly StyleDefinitionChoice[];
	readonly testId?: string;
}

/**
 * Ordered multi-attach list of document style definitions.
 *
 * A reference to a definition the document no longer holds is rendered
 * by its id rather than hidden — an author cannot detach what the panel
 * pretends is not there.
 */
export function StyleRefsControl({
	label,
	field,
	definitions,
	testId,
}: StyleRefsControlProps): ReactNode {
	const msg = useMsg();
	const refs = fieldValue(field.state) ?? [];
	const available = definitions.filter((entry) => !refs.includes(entry.id));
	const nameOf = (id: string): string =>
		definitions.find((entry) => entry.id === id)?.name ?? id;
	const write = (next: readonly string[]): void => {
		if (next.length === 0) field.reset();
		else field.commit(next);
	};
	return (
		<InspectorFieldShell
			label={label}
			state={field.state}
			onReset={() => field.reset()}
			layout="stack"
		>
			<div className="flex flex-col gap-1" data-testid={testId}>
				{refs.length === 0 ? (
					<span className="text-[11px] text-[var(--ak-studio-muted-fg)]">
						{msg("studio.editor.style.empty")}
					</span>
				) : (
					<ul className="flex flex-col gap-1">
						{refs.map((id) => (
							<li
								key={id}
								className="flex items-center justify-between gap-2 rounded border border-[var(--ak-studio-border)] px-2 py-0.5"
								data-testid={`ak-style-ref-${id}`}
							>
								<span className="min-w-0 truncate text-[11px]">
									{nameOf(id)}
								</span>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-6 px-1 text-[10px]"
									onClick={() => write(refs.filter((entry) => entry !== id))}
									data-testid={`ak-style-ref-detach-${id}`}
								>
									{msg("studio.editor.style.detach")}
								</Button>
							</li>
						))}
					</ul>
				)}
				{available.length > 0 ? (
					<Select
						value=""
						onValueChange={(next) => {
							if (typeof next === "string" && next !== "") {
								write([...refs, next]);
							}
						}}
					>
						<SelectTrigger
							size="sm"
							aria-label={msg("studio.editor.style.attach")}
							className="h-7 w-full text-xs"
							data-testid="ak-style-ref-attach"
						>
							<SelectValue placeholder={msg("studio.editor.style.attach")} />
						</SelectTrigger>
						<SelectContent>
							{available.map((entry) => (
								<SelectItem key={entry.id} value={entry.id}>
									{entry.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				) : null}
			</div>
		</InspectorFieldShell>
	);
}
