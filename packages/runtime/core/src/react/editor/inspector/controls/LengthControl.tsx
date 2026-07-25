"use client";

/**
 * @file `LengthControl` — typed `CssLength` editor (PLAN-0020
 * CORE-P1A-006/-007; DD-0019 §11.3, §11.5).
 *
 * Number input plus unit select over the typed value model — never
 * raw CSS text. Behavior contracts:
 *
 * - **invalid drafts stay local** (§11.3): a non-numeric draft renders
 *   the invalid affordance and is never committed; the durable state
 *   keeps the last valid value.
 * - **keyboard steps**: ↑/↓ nudge ±1, Shift for ±10 — each nudge is
 *   one commit (one history entry; Puck's record debounce may merge
 *   rapid nudges, accepted native behavior).
 * - **unit switching never rescales** the number (no silent
 *   conversion); token-backed values render a token badge and can
 *   only be detached via reset (picker lands with Phase 2).
 * - Sizing keywords (`auto`, `min-content`, …) are selectable where
 *   the caller allows them.
 */

import type { CssLength, CssUnit } from "@anvilkit/contracts/editor";
import { type KeyboardEvent, type ReactNode, useEffect, useState } from "react";
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
import { InspectorFieldShell } from "../InspectorFieldShell.js";
import type { InspectorFieldHandle } from "../use-inspector.js";

const DEFAULT_UNITS: readonly CssUnit[] = ["px", "rem", "em", "%", "vw", "vh"];
const KEYWORDS = ["auto", "min-content", "max-content", "fit-content"] as const;

/** Props for {@link LengthControl}. */
export interface LengthControlProps {
	readonly label: string;
	readonly field: InspectorFieldHandle<CssLength>;
	readonly units?: readonly CssUnit[];
	/** Allow the sizing keywords in the unit dropdown. */
	readonly allowKeywords?: boolean;
	readonly testId?: string;
}

/** Typed CSS length editor bound to one inspector field. */
export function LengthControl({
	label,
	field,
	units = DEFAULT_UNITS,
	allowKeywords = false,
	testId,
}: LengthControlProps): ReactNode {
	const msg = useMsg();
	const value = field.state.kind === "value" ? field.state.value : undefined;
	const numeric = value?.kind === "unit" ? value : undefined;
	const keyword = value?.kind === "keyword" ? value.keyword : undefined;
	const isToken = value?.kind === "token";

	// Local draft (§11.3): mirrors the durable value until the user
	// types; an unparsable draft stays here and never commits.
	const [draft, setDraft] = useState<string | null>(null);
	const durableText = numeric !== undefined ? String(numeric.value) : "";
	// biome-ignore lint/correctness/useExhaustiveDependencies: the draft intentionally resets whenever the durable value changes (external commit, undo, selection change).
	useEffect(() => setDraft(null), [durableText]);
	const text = draft ?? durableText;
	const invalid = draft !== null && !isFinite(Number(draft));

	const commitNumber = (amount: number, unit?: CssUnit): void => {
		void field.commit({
			kind: "unit",
			value: amount,
			unit: unit ?? numeric?.unit ?? units[0] ?? "px",
		});
	};

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
			return; // invalid draft retained, never committed
		}
		setDraft(null);
		commitNumber(amount);
	};

	const nudge = (event: KeyboardEvent<HTMLInputElement>): void => {
		if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
			if (event.key === "Enter") {
				commitDraft();
			}
			return;
		}
		event.preventDefault();
		const step = (event.shiftKey ? 10 : 1) * (event.key === "ArrowUp" ? 1 : -1);
		const current =
			draft !== null && isFinite(Number(draft))
				? Number(draft)
				: (numeric?.value ?? 0);
		setDraft(null);
		commitNumber(current + step);
	};

	const unitValue = keyword ?? numeric?.unit ?? units[0] ?? "px";

	return (
		<InspectorFieldShell
			label={label}
			state={field.state}
			onReset={() => void field.reset()}
		>
			{isToken ? (
				<span
					className="rounded border border-[var(--ak-studio-border)] px-2 py-1 text-[11px] text-[var(--ak-studio-muted-fg)]"
					data-testid="ak-length-token"
				>
					{msg("studio.editor.inspector.tokenValue")}
				</span>
			) : (
				<div className="flex items-center gap-1">
					<Input
						type="text"
						inputMode="decimal"
						value={keyword !== undefined ? "" : text}
						placeholder={keyword ?? undefined}
						disabled={keyword !== undefined}
						aria-invalid={invalid || undefined}
						aria-label={label}
						className={cn(
							"h-7 flex-1 text-xs",
							invalid ? "border-red-500" : null,
						)}
						onChange={(event) => setDraft(event.target.value)}
						onBlur={commitDraft}
						onKeyDown={nudge}
						data-testid={testId}
					/>
					<Select
						value={unitValue}
						onValueChange={(next) => {
							if (next === null) {
								return;
							}
							if ((KEYWORDS as readonly string[]).includes(next)) {
								void field.commit({
									kind: "keyword",
									keyword: next as (typeof KEYWORDS)[number],
								});
								return;
							}
							// Unit switch keeps the number — never rescales.
							commitNumber(numeric?.value ?? 0, next as CssUnit);
						}}
					>
						<SelectTrigger
							size="sm"
							className="h-7 w-16 text-xs"
							aria-label={msg("studio.editor.inspector.unit")}
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{units.map((unit) => (
								<SelectItem key={unit} value={unit}>
									{unit}
								</SelectItem>
							))}
							{allowKeywords
								? KEYWORDS.map((word) => (
										<SelectItem key={word} value={word}>
											{word}
										</SelectItem>
									))
								: null}
						</SelectContent>
					</Select>
				</div>
			)}
		</InspectorFieldShell>
	);
}
