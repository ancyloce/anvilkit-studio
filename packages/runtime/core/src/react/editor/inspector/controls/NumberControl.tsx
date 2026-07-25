"use client";

/**
 * @file `NumberControl` — plain numeric property editor (zIndex,
 * opacity, weights, filter ratios) with local invalid-draft retention
 * and ↑/↓ keyboard steps (PLAN-0020 CORE-P1A-006/-007; DD-0019
 * §11.3).
 */

import { type KeyboardEvent, type ReactNode, useEffect, useState } from "react";
import { Input } from "@/primitives/input";
import { cn } from "@/shared/cn";
import { InspectorFieldShell } from "../InspectorFieldShell.js";
import type { InspectorFieldHandle } from "../use-inspector.js";

/** Props for {@link NumberControl}. */
export interface NumberControlProps {
	readonly label: string;
	readonly field: InspectorFieldHandle<number>;
	readonly min?: number;
	readonly max?: number;
	/** Keyboard step (Shift multiplies by 10). Default 1. */
	readonly step?: number;
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

/** Plain number editor bound to one inspector field. */
export function NumberControl({
	label,
	field,
	min,
	max,
	step = 1,
	testId,
}: NumberControlProps): ReactNode {
	const value = field.state.kind === "value" ? field.state.value : undefined;
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
			void field.reset();
			return;
		}
		const amount = Number(trimmed);
		if (!isFinite(amount)) {
			return; // invalid draft retained, never committed (§11.3)
		}
		setDraft(null);
		void field.commit(clamp(amount, min, max));
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
		void field.commit(clamp(current + delta, min, max));
	};

	return (
		<InspectorFieldShell
			label={label}
			state={field.state}
			onReset={() => void field.reset()}
		>
			<Input
				type="text"
				inputMode="decimal"
				value={text}
				aria-invalid={invalid || undefined}
				aria-label={label}
				className={cn("h-7 text-xs", invalid ? "border-red-500" : null)}
				onChange={(event) => setDraft(event.target.value)}
				onBlur={commitDraft}
				onKeyDown={onKeyDown}
				data-testid={testId}
			/>
		</InspectorFieldShell>
	);
}
