"use client";

/**
 * @file `BoxEdgesControl` — four-edge editor for margin / padding /
 * inset (PLAN-0020 CORE-P1A-006; DD-0019 §11.5 P0 rows).
 *
 * Writes one edge at a time as a nested patch (`{ top: … }`), which
 * the engine's recursive patch merge folds into the existing
 * `CssBoxEdges` — untouched edges keep their values; an emptied edge
 * is a D-8 `null` removal (an all-empty object collapses away in the
 * reducer). Pixel-only inputs with keyboard steps; drafts stay local
 * until they parse.
 */

import type { CssBoxEdges, CssLength } from "@anvilkit/contracts/editor";
import { type KeyboardEvent, type ReactNode, useEffect, useState } from "react";
import { Input } from "@/primitives/input";
import { cn } from "@/shared/cn";
import { useMsg } from "@/state/editor-i18n-context";
import { InspectorFieldShell } from "../InspectorFieldShell.js";
import type { InspectorFieldHandle } from "../use-inspector.js";

const EDGES = ["top", "right", "bottom", "left"] as const;
type Edge = (typeof EDGES)[number];

/** Props for {@link BoxEdgesControl}. */
export interface BoxEdgesControlProps {
	readonly label: string;
	readonly field: InspectorFieldHandle<CssBoxEdges>;
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
	readonly field: InspectorFieldHandle<CssBoxEdges>;
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
		const entry: CssLength | null =
			amount === null ? null : { kind: "unit", value: amount, unit: "px" };
		// One-edge nested patch: the engine merges it into the box.
		void field.commit({ [edge]: entry } as unknown as CssBoxEdges);
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

/** Four-edge (px) editor bound to one box-edges inspector field. */
export function BoxEdgesControl({
	label,
	field,
	testId,
}: BoxEdgesControlProps): ReactNode {
	const edges = field.state.kind === "value" ? field.state.value : undefined;
	return (
		<InspectorFieldShell
			label={label}
			state={field.state}
			onReset={() => void field.reset()}
		>
			<div className="grid grid-cols-4 gap-1" data-testid={testId}>
				{EDGES.map((edge) => (
					<EdgeInput key={edge} edge={edge} field={field} edges={edges} />
				))}
			</div>
		</InspectorFieldShell>
	);
}
