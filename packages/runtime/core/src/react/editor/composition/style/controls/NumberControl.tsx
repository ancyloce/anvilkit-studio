"use client";

/**
 * @file `NumberControl` — plain numeric property editor (zIndex,
 * opacity, weights, filter ratios) with local invalid-draft retention
 * and ↑/↓ keyboard steps (DD-0019 §11.3).
 *
 * Moved here from `inspector/controls/NumberControl.tsx` by PLAN-0028
 * `p4-001` so the canonical Style panel and the pre-canonical inspector
 * sections render ONE implementation. The old path is a thin wrapper
 * over this file; nothing was duplicated and no behaviour changed.
 *
 * `help` (PLAN-0028 `p5-005`) renders a localized note under the input
 * and is wired to the control by `aria-describedby`, so a screen reader
 * hears the constraint rather than only sighted users seeing it. It
 * exists for `zIndex`, whose effect is **non-local**: the number means
 * nothing without knowing which positioned ancestor scopes the
 * stacking context, and that is not visible in the box being edited.
 */

import {
	type KeyboardEvent,
	type ReactNode,
	useEffect,
	useId,
	useState,
} from "react";
import { Input } from "@/primitives/input";
import { cn } from "@/shared/cn";
import { InspectorFieldShell } from "../../../inspector/InspectorFieldShell.js";
import { fieldValue, type StyleFieldHandle } from "./handle.js";

/** Props for {@link NumberControl}. */
export interface NumberControlProps {
	readonly label: string;
	readonly field: StyleFieldHandle<number>;
	readonly min?: number;
	readonly max?: number;
	/** Keyboard step (Shift multiplies by 10). Default 1. */
	readonly step?: number;
	/** Localized constraint note, announced via `aria-describedby`. */
	readonly help?: string;
	readonly testId?: string;
}

function clamp(value: number, min?: number, max?: number): number {
	let next = value;
	if (min !== undefined) {
		next = Math.max(min, next);
	}
	if (max !== undefined) {
		next = Math.min(max, next);
	}
	return next;
}

/** Plain number editor bound to one style field. */
export function NumberControl({
	label,
	field,
	min,
	max,
	step = 1,
	help,
	testId,
}: NumberControlProps): ReactNode {
	const helpId = useId();
	const value = fieldValue(field.state);
	const [draft, setDraft] = useState<string | null>(null);
	const durableText = value !== undefined ? String(value) : "";
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
			field.reset();
			return;
		}
		const amount = Number(trimmed);
		if (!isFinite(amount)) {
			return; // invalid draft retained, never committed (§11.3)
		}
		setDraft(null);
		field.commit(clamp(amount, min, max));
	};

	const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
		if (event.key === "Enter") {
			commitDraft();
			return;
		}
		if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
			return;
		}
		event.preventDefault();
		const delta =
			step * (event.shiftKey ? 10 : 1) * (event.key === "ArrowUp" ? 1 : -1);
		const current =
			draft !== null && isFinite(Number(draft)) ? Number(draft) : (value ?? 0);
		setDraft(null);
		field.commit(clamp(current + delta, min, max));
	};

	return (
		<InspectorFieldShell
			label={label}
			state={field.state}
			onReset={() => field.reset()}
		>
			<Input
				type="text"
				inputMode="decimal"
				value={text}
				aria-invalid={invalid || undefined}
				aria-label={label}
				aria-describedby={help === undefined ? undefined : helpId}
				className={cn("h-7 text-xs", invalid ? "border-red-500" : null)}
				onChange={(event) => setDraft(event.target.value)}
				onBlur={commitDraft}
				onKeyDown={onKeyDown}
				data-testid={testId}
			/>
			{help === undefined ? null : (
				<p
					id={helpId}
					className="text-[10px] leading-tight text-[var(--ak-studio-muted-fg)]"
					data-testid={testId !== undefined ? `${testId}-help` : undefined}
				>
					{help}
				</p>
			)}
		</InspectorFieldShell>
	);
}
