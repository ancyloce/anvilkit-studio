"use client";

/**
 * @file `StyleLayerSelector` — "which layer am I authoring into"
 * (PLAN-0028 `p4-001`).
 *
 * It does **not** own the value. The shell holds exactly one write
 * layer (`composition/write-layer.tsx`, `p4-004`), so this is a view of
 * that one value: moving it here moves it for every panel, and
 * `p4-005`'s viewport toolbar takes the same value over as a controlled
 * prop so previewing a breakpoint and authoring into it stay one state.
 *
 * Rendered only when a visible target declares `responsive === true` —
 * the task's gating rule. A selector offering breakpoints that nothing
 * on screen can store would be an invitation to write nothing.
 *
 * Options are the document's **enabled** breakpoints, because
 * `updateAppearanceInData` rejects a layer that is not defined in the
 * document design system. Offering a disabled or unknown breakpoint
 * would produce `EDITOR_BREAKPOINT_INVALID` on the first edit.
 */

import type { BreakpointDefinition } from "@anvilkit/contracts/editor";
import type { ReactNode } from "react";
import { Label } from "@/primitives/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/primitives/select";
import { useMsg } from "@/state/editor-i18n-context";
import { useWriteLayer } from "../write-layer.js";

const BASE = "base";

/** Props for {@link StyleLayerSelector}. */
export interface StyleLayerSelectorProps {
	/** The document's breakpoints; disabled ones are filtered out here. */
	readonly breakpoints: readonly BreakpointDefinition[];
}

/** The shell's write layer, as a select. */
export function StyleLayerSelector({
	breakpoints,
}: StyleLayerSelectorProps): ReactNode {
	const msg = useMsg();
	const shell = useWriteLayer();
	const enabled: readonly BreakpointDefinition[] = breakpoints
		.filter((entry) => entry.enabled)
		.sort((left, right) => left.order - right.order);
	const label = msg("studio.editor.responsive.writeTarget");

	return (
		<div
			className="flex items-center gap-2"
			data-testid="ak-style-layer"
			data-layer={shell.layer}
		>
			<Label htmlFor="ak-style-layer-select" className="text-[11px]">
				{label}
			</Label>
			<Select
				value={shell.layer}
				onValueChange={(next) => {
					if (typeof next === "string") shell.setLayer(next);
				}}
			>
				<SelectTrigger
					id="ak-style-layer-select"
					size="sm"
					aria-label={label}
					className="h-7 flex-1 text-xs"
					data-testid="ak-style-layer-select"
				>
					<SelectValue>
						{(value: unknown) =>
							value === BASE || typeof value !== "string"
								? msg("studio.editor.responsive.base")
								: (enabled.find((entry) => entry.id === value)?.label ?? value)
						}
					</SelectValue>
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={BASE}>
						{msg("studio.editor.responsive.base")}
					</SelectItem>
					{enabled.map((entry) => (
						<SelectItem key={entry.id} value={entry.id}>
							{entry.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}
