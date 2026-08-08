"use client";

/**
 * @file `SelectControl` — enum property editor.
 *
 * Renders the shared `@anvilkit/ui` select primitive inside an
 * {@link InspectorFieldShell}. Commits on selection; the sentinel
 * `unset` option resets the property at the active layer.
 *
 * The sentinel is a real selected value, not an absent one, so the
 * trigger's `placeholder` never applies to it — without the render
 * function below the closed trigger literally reads `__unset__`.
 *
 * Moved here from `inspector/controls/SelectControl.tsx` by PLAN-0028
 * `p4-001`; the old path wraps this one.
 */

import type { ReactNode } from "react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/primitives/select";
import { useMsg } from "@/state/editor-i18n-context";
import { InspectorFieldShell } from "../../../inspector/InspectorFieldShell.js";
import { fieldValue, type StyleFieldHandle } from "./handle.js";

const UNSET_SENTINEL = "__unset__";

/** Props for {@link SelectControl}. */
export interface SelectControlProps<T extends string> {
	readonly label: string;
	readonly field: StyleFieldHandle<T>;
	readonly options: readonly T[];
	/** Option-label resolver; defaults to the raw option string. */
	readonly optionLabel?: (option: T) => string;
	readonly testId?: string;
}

/** Enum select bound to one style field. */
export function SelectControl<T extends string>({
	label,
	field,
	options,
	optionLabel,
	testId,
}: SelectControlProps<T>): ReactNode {
	const msg = useMsg();
	const current = fieldValue(field.state);
	return (
		<InspectorFieldShell
			label={label}
			state={field.state}
			onReset={() => field.reset()}
		>
			<Select
				value={current ?? UNSET_SENTINEL}
				onValueChange={(next) => {
					if (next === UNSET_SENTINEL) {
						field.reset();
						return;
					}
					field.commit(next as T);
				}}
			>
				{/* The shell's label is a plain `<span>`, not associated with
				    the control, so without this the trigger has NO accessible
				    name whenever the value is unset (axe `button-name`). */}
				<SelectTrigger
					size="sm"
					aria-label={label}
					className="h-7 w-full text-xs"
					data-testid={testId}
				>
					<SelectValue placeholder={msg("studio.editor.inspector.unset")}>
						{(value: unknown) =>
							value === UNSET_SENTINEL || value === null || value === undefined
								? msg("studio.editor.inspector.unset")
								: (optionLabel?.(value as T) ?? String(value))
						}
					</SelectValue>
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={UNSET_SENTINEL}>
						{msg("studio.editor.inspector.unset")}
					</SelectItem>
					{options.map((option) => (
						<SelectItem key={option} value={option}>
							{optionLabel?.(option) ?? option}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</InspectorFieldShell>
	);
}
