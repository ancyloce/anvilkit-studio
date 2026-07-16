/**
 * @file `useFieldChrome()` — shared presentation adoption for the
 * simple field-type renderers (text / textarea / number / select /
 * radio).
 *
 * Centralizes the three per-field presentation features so each
 * renderer stays a thin control:
 *
 * - compact `property-row` layout opt-in (`metadata.layout`), only
 *   honored when the caller says the control is row-capable;
 * - muted description text + the `aria-describedby` id pair;
 * - the reset affordance for fields with a reliable configured
 *   default (see `use-field-default.ts`) — rendered as a stable
 *   always-present-but-invisible button so toggling "modified" never
 *   restructures the label row and drops input focus.
 *
 * All hints come from Puck's own `BaseField.metadata` bag via
 * `readFieldPresentation()`; a field without metadata gets the exact
 * pre-existing stacked presentation.
 */

import { type ReactNode, useCallback, useId, useMemo } from "react";

import {
	readFieldPresentation,
	type StudioFieldPresentation,
} from "../field-presentation";
import { PropertyResetButton } from "../PropertyResetButton";
import { NO_DEFAULT, useFieldDefault } from "../use-field-default";

export interface FieldChromeInput {
	readonly field: { readonly metadata?: unknown };
	readonly name: string;
	readonly id?: string;
	readonly value: unknown;
	readonly readOnly?: boolean;
	/** Commit callback — receives the configured default on reset. */
	readonly onChange: (value: never) => void;
	/**
	 * Whether this renderer's control fits the compact two-column row.
	 * Complex/full-width renderers pass `false` (or omit) and the
	 * `property-row` hint is ignored rather than forced.
	 */
	readonly rowCapable?: boolean;
}

export interface FieldChrome {
	readonly presentation: StudioFieldPresentation;
	readonly layout: "stacked" | "row";
	readonly description?: string;
	/** id for the description node (defined only with a description). */
	readonly descriptionId?: string;
	/** Value for `aria-describedby` on the control. */
	readonly describedBy?: string;
	/** Reset affordance for the label row, when a default exists. */
	readonly action?: ReactNode;
}

export function useFieldChrome({
	field,
	name,
	id,
	value,
	readOnly,
	onChange,
	rowCapable = false,
}: FieldChromeInput): FieldChrome {
	const presentation = useMemo(
		() => readFieldPresentation(field.metadata),
		[field.metadata],
	);

	const defaultValue = useFieldDefault(name);
	const hasDefault = defaultValue !== NO_DEFAULT && readOnly !== true;
	// `Object.is` — defaults are guaranteed primitives, so this is an
	// exact comparison with no false positives (NaN included).
	const modified = hasDefault && !Object.is(value, defaultValue);

	const handleReset = useCallback(() => {
		if (defaultValue === NO_DEFAULT) return;
		onChange(defaultValue as never);
	}, [defaultValue, onChange]);

	const autoId = useId();
	const descriptionId =
		presentation.description === undefined
			? undefined
			: `${id ?? autoId}-description`;

	return {
		presentation,
		layout:
			rowCapable && presentation.layout === "property-row" ? "row" : "stacked",
		description: presentation.description,
		descriptionId,
		describedBy: descriptionId,
		action: hasDefault ? (
			<PropertyResetButton modified={modified} onReset={handleReset} />
		) : undefined,
	};
}
