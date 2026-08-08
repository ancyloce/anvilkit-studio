"use client";

/**
 * @file `BoxEdgesControl` — four-edge editor for margin / padding /
 * inset (DD-0019 §11.5 P0 rows).
 *
 * Pixel-only inputs with keyboard steps; drafts stay local until they
 * parse.
 *
 * **Whole-value writes.** Moved here from
 * `inspector/controls/BoxEdgesControl.tsx` by PLAN-0028 `p4-001`, and
 * the write shape changed with it: the old file emitted a one-edge
 * nested patch (`{ top: … }`) and relied on the legacy engine's
 * recursive patch merge to fold it into the stored box. The canonical
 * write path has no merge — `updateAppearanceInData` **assigns** the
 * spec value at `family[specKey]` — so a one-edge patch there would
 * destroy the other three edges. This control therefore always emits
 * the complete `CssBoxEdges`, and the legacy wrapper adapts it back to
 * the merge protocol (explicit `null` per cleared edge, freeze D-8).
 *
 * An emptied last edge resets the property at the layer rather than
 * storing an empty object: the canonical writer prunes content-free
 * carriers, so committing `{}` and resetting mean the same thing —
 * saying so here keeps the reset affordance and the keyboard path in
 * agreement.
 *
 * **Linked sides** (PLAN-0028 `p5-005`). One toggle collapses the four
 * boxes into a single value written to all four edges, and expands
 * them again. The initial state is *derived from the document* rather
 * than remembered: a box whose four edges are already one number reads
 * as linked, and everything else — including the unauthored box every
 * target starts from — reads as unlinked, so the four-box shape stays
 * the default it has always been. A press pins the choice for the
 * session. `inset` reaches this control through the same
 * `CONTROL_FOR` row as `padding` and `margin`, which is what makes the
 * three one idiom rather than three.
 */

import type { CssBoxEdges, CssLength } from "@anvilkit/contracts/editor";
import { Link2, Unlink2 } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useEffect, useState } from "react";
import { Input } from "@/primitives/input";
import { Toggle } from "@/primitives/toggle";
import { cn } from "@/shared/cn";
import { useMsg } from "@/state/editor-i18n-context";
import { InspectorFieldShell } from "../../../inspector/InspectorFieldShell.js";
import { fieldValue, type StyleFieldHandle } from "./handle.js";

const EDGES = ["top", "right", "bottom", "left"] as const;
type Edge = (typeof EDGES)[number];

/** Props for {@link BoxEdgesControl}. */
export interface BoxEdgesControlProps {
	readonly label: string;
	readonly field: StyleFieldHandle<CssBoxEdges>;
	readonly testId?: string;
}

function edgeNumber(edges: CssBoxEdges | undefined, edge: Edge): string {
	const value = edges?.[edge];
	return value?.kind === "unit" ? String(value.value) : "";
}

function EdgeInput({
	edge,
	field,
	edges,
}: {
	readonly edge: Edge;
	readonly field: StyleFieldHandle<CssBoxEdges>;
	readonly edges: CssBoxEdges | undefined;
}): ReactNode {
	const msg = useMsg();
	const durableText = edgeNumber(edges, edge);
	const [draft, setDraft] = useState<string | null>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: the draft intentionally resets whenever the durable value changes (external commit, undo, selection change).
	useEffect(() => setDraft(null), [durableText]);
	const text = draft ?? durableText;
	const invalid = draft !== null && draft !== "" && !isFinite(Number(draft));

	const write = (amount: number | null): void => {
		const next: Record<string, CssLength | undefined> = { ...edges };
		if (amount === null) delete next[edge];
		else next[edge] = { kind: "unit", value: amount, unit: "px" };
		const remaining = Object.values(next).filter(
			(entry) => entry !== undefined,
		);
		if (remaining.length === 0) {
			field.reset();
			return;
		}
		field.commit(next as CssBoxEdges);
	};

	const commitDraft = (): void => {
		if (draft === null) {
			return;
		}
		const trimmed = draft.trim();
		if (trimmed === "") {
			setDraft(null);
			write(null);
			return;
		}
		const amount = Number(trimmed);
		if (!isFinite(amount)) {
			return;
		}
		setDraft(null);
		write(amount);
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
			(event.shiftKey ? 10 : 1) * (event.key === "ArrowUp" ? 1 : -1);
		const current =
			draft !== null && isFinite(Number(draft))
				? Number(draft)
				: Number(durableText || 0);
		setDraft(null);
		write(current + delta);
	};

	return (
		<Input
			type="text"
			inputMode="decimal"
			value={text}
			aria-invalid={invalid || undefined}
			aria-label={msg(`studio.editor.inspector.edge.${edge}`)}
			placeholder={msg(`studio.editor.inspector.edge.${edge}`)}
			className={cn("h-7 text-xs", invalid ? "border-red-500" : null)}
			onChange={(event) => setDraft(event.target.value)}
			onBlur={commitDraft}
			onKeyDown={onKeyDown}
			data-testid={`ak-box-edge-${edge}`}
		/>
	);
}

/** The one number all four edges share, or `undefined` if they differ. */
function uniformEdge(edges: CssBoxEdges | undefined): number | undefined {
	if (edges === undefined) {
		return undefined;
	}
	const first = edges.top;
	if (first?.kind !== "unit") {
		return undefined;
	}
	for (const edge of EDGES) {
		const value = edges[edge];
		if (
			value?.kind !== "unit" ||
			value.value !== first.value ||
			value.unit !== first.unit
		) {
			return undefined;
		}
	}
	return first.value;
}

/** The single input shown while the four sides are linked. */
function LinkedInput({
	field,
	amount,
}: {
	readonly field: StyleFieldHandle<CssBoxEdges>;
	readonly amount: number | undefined;
}): ReactNode {
	const msg = useMsg();
	const durableText = amount === undefined ? "" : String(amount);
	const [draft, setDraft] = useState<string | null>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: the draft intentionally resets whenever the durable value changes (external commit, undo, selection change).
	useEffect(() => setDraft(null), [durableText]);
	const text = draft ?? durableText;
	const invalid = draft !== null && draft !== "" && !isFinite(Number(draft));

	const write = (next: number | null): void => {
		if (next === null) {
			field.reset();
			return;
		}
		const length: CssLength = { kind: "unit", value: next, unit: "px" };
		field.commit({ top: length, right: length, bottom: length, left: length });
	};

	const commitDraft = (): void => {
		if (draft === null) {
			return;
		}
		const trimmed = draft.trim();
		if (trimmed === "") {
			setDraft(null);
			write(null);
			return;
		}
		const next = Number(trimmed);
		if (!isFinite(next)) {
			return;
		}
		setDraft(null);
		write(next);
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
			(event.shiftKey ? 10 : 1) * (event.key === "ArrowUp" ? 1 : -1);
		const current =
			draft !== null && isFinite(Number(draft)) ? Number(draft) : (amount ?? 0);
		setDraft(null);
		write(current + delta);
	};

	return (
		<Input
			type="text"
			inputMode="decimal"
			value={text}
			aria-invalid={invalid || undefined}
			aria-label={msg("studio.editor.inspector.edge.all")}
			placeholder={msg("studio.editor.inspector.edge.all")}
			className={cn("h-7 min-w-0 flex-1 text-xs", invalid && "border-red-500")}
			onChange={(event) => setDraft(event.target.value)}
			onBlur={commitDraft}
			onKeyDown={onKeyDown}
			data-testid="ak-box-edge-all"
		/>
	);
}

/** Four-edge (px) editor bound to one box-edges style field. */
export function BoxEdgesControl({
	label,
	field,
	testId,
}: BoxEdgesControlProps): ReactNode {
	const msg = useMsg();
	const edges = fieldValue(field.state);
	const uniform = uniformEdge(edges);
	// `null` = follow the document; a press pins the choice for the
	// session so an author can link before typing anything.
	const [pinned, setPinned] = useState<boolean | null>(null);
	const linked = pinned ?? uniform !== undefined;

	return (
		<InspectorFieldShell
			label={label}
			state={field.state}
			onReset={() => field.reset()}
			// Four side-by-side inputs need the full panel width.
			layout="stack"
		>
			<div className="flex items-center gap-1" data-testid={testId}>
				{linked ? (
					<LinkedInput field={field} amount={uniform} />
				) : (
					<div className="grid min-w-0 flex-1 grid-cols-4 gap-1">
						{EDGES.map((edge) => (
							<EdgeInput key={edge} edge={edge} field={field} edges={edges} />
						))}
					</div>
				)}
				<Toggle
					size="sm"
					pressed={linked}
					onPressedChange={(next: boolean) => setPinned(next)}
					aria-label={msg("studio.editor.inspector.edge.link")}
					className="size-7 shrink-0"
					data-testid="ak-box-edge-link"
				>
					{linked ? (
						<Link2 className="size-3" aria-hidden="true" />
					) : (
						<Unlink2 className="size-3" aria-hidden="true" />
					)}
				</Toggle>
			</div>
		</InspectorFieldShell>
	);
}
