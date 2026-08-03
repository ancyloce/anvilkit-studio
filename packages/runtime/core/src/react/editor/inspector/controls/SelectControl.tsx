"use client";

/**
 * @file `SelectControl` — enum property editor for universal
 * inspector sections (PLAN-0020 CORE-P1A-006/-007).
 *
 * Renders the shared `@anvilkit/ui` select primitive inside an
 * {@link InspectorFieldShell}. Commits on selection; the sentinel
 * `unset` option resets the property at the active layer.
 *
 * The sentinel is a real selected value, not an absent one, so the
 * trigger's `placeholder` never applies to it — without the render
 * function below the closed trigger literally reads `__unset__`.
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
import { InspectorFieldShell } from "../InspectorFieldShell.js";
import type { InspectorFieldHandle } from "../use-inspector.js";

const UNSET_SENTINEL = "__unset__";

/** Props for {@link SelectControl}. */
export interface SelectControlProps<T extends string> {
	readonly label: string;
	readonly field: InspectorFieldHandle<T>;
	readonly options: readonly T[];
	/** Option-label resolver; defaults to the raw option string. */
	readonly optionLabel?: (option: T) => string;
	readonly testId?: string;
}

/** Enum select bound to one inspector field. */
export function SelectControl<T extends string>({
	label,
	field,
	options,
	optionLabel,
	testId,
}: SelectControlProps<T>): ReactNode {
	const msg = useMsg();
	const current = field.state.kind === "value" ? field.state.value : undefined;
	return (
		<InspectorFieldShell
			label={label}
			state={field.state}
			onReset={() => void field.reset()}
		>
			<Select
				value={current ?? UNSET_SENTINEL}
				onValueChange={(next) => {
					if (next === UNSET_SENTINEL) {
						void field.reset();
						return;
					}
					void field.commit(next as T);
				}}
			>
				{/* The shell's label is a plain `<span>`, not associated with
				    the control, so without this the trigger has NO accessible
				    name whenever the value is unset (axe `button-name`,
				    critical — PLAN-0020 CORE-P4-003). Matches the
				    `aria-label={label}` convention the other controls already
				    follow. */}
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
