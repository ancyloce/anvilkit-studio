"use client";

/**
 * @file `SegmentedControl` — enum property editor for **small** option
 * sets, rendered as a segmented button row instead of a dropdown.
 *
 * Same contract as {@link SelectControl} (commit on pick, reset when
 * the active option is pressed again, invalid states handled by
 * {@link InspectorFieldShell}) — only the presentation differs.
 *
 * `icon` turns an option into an icon button; the localized `label` is
 * still its accessible name, so an icon-only row is never unlabeled.
 * Options must carry pre-resolved labels — no catalog lookups here, so
 * a caller cannot accidentally ship an untranslated segment.
 *
 * Moved here from `inspector/controls/SegmentedControl.tsx` by
 * PLAN-0028 `p4-001`; the old path wraps this one.
 */

import type { ReactNode } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/primitives/toggle-group";
import { cn } from "@/shared/cn";
import { InspectorFieldShell } from "../../../inspector/InspectorFieldShell.js";
import { fieldValue, type StyleFieldHandle } from "./handle.js";

/** One segment. */
export interface SegmentedOption<T extends string> {
	readonly value: T;
	/** Localized accessible name (and visible text when `icon` is unset). */
	readonly label: string;
	readonly icon?: ReactNode;
}

/** Props for {@link SegmentedControl}. */
export interface SegmentedControlProps<T extends string> {
	readonly label: string;
	readonly field: StyleFieldHandle<T>;
	readonly options: readonly SegmentedOption<T>[];
	readonly testId?: string;
}

/** Segmented enum editor bound to one style field. */
export function SegmentedControl<T extends string>({
	label,
	field,
	options,
	testId,
}: SegmentedControlProps<T>): ReactNode {
	const current = fieldValue(field.state);
	const iconOnly = options.every((option) => option.icon !== undefined);

	return (
		<InspectorFieldShell
			label={label}
			state={field.state}
			onReset={() => field.reset()}
		>
			<ToggleGroup
				variant="outline"
				size="sm"
				spacing={0}
				value={current === undefined ? [] : [current]}
				onValueChange={(next: readonly string[]) => {
					const picked = next[0] as T | undefined;
					// Pressing the active segment clears it — the same
					// reset-at-layer the select's `unset` option performs, kept
					// reachable without a dropdown.
					if (picked === undefined) {
						field.reset();
						return;
					}
					field.commit(picked);
				}}
				aria-label={label}
				className={cn("w-full", iconOnly ? null : "grid grid-flow-col")}
				data-testid={testId}
			>
				{options.map((option) => (
					<ToggleGroupItem
						key={option.value}
						value={option.value}
						aria-label={option.icon !== undefined ? option.label : undefined}
						className="h-7 min-w-7 flex-1 px-2 text-[11px]"
						data-testid={
							testId !== undefined ? `${testId}-${option.value}` : undefined
						}
					>
						{option.icon ?? option.label}
					</ToggleGroupItem>
				))}
			</ToggleGroup>
		</InspectorFieldShell>
	);
}
