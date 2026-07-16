/**
 * @file Default renderer for Puck `text` fields.
 *
 * Presentation adoption (all opt-in via the field's own `metadata`
 * bag, see `../field-presentation.ts`): compact `property-row`
 * layout, muted description with `aria-describedby`, reset-to-default
 * affordance, and — via `metadata.control = "dimension"` — the
 * unit-aware {@link DimensionControl} for CSS dimension strings. A
 * field without metadata renders exactly the plain input it always
 * has.
 */

import type { FieldProps, TextField as PuckTextField } from "@puckeditor/core";
import { type ReactNode, useCallback } from "react";
import { FieldLabel } from "@/overrides/layout/FieldLabel";
import { Input } from "@/primitives/input";
import { DimensionControl } from "./DimensionControl";
import { useFieldChrome } from "./use-field-chrome";
import { useLocalFieldValue } from "./use-local-field-value";

export interface FieldRendererProps<F, V> extends FieldProps<F, V> {
	readonly name: string;
	readonly children?: ReactNode;
}

export function TextField({
	field,
	value,
	onChange,
	readOnly,
	id,
	name,
}: FieldRendererProps<PuckTextField, string | undefined>): ReactNode {
	const chrome = useFieldChrome({
		field,
		name,
		id,
		value,
		readOnly,
		onChange: onChange as (value: never) => void,
		rowCapable: true,
	});

	// Preserve the prior outbound shape: the raw input string is
	// emitted on every keystroke (including `""`), matching Puck's
	// default text field. The buffer formats `undefined` → `""` only
	// for the displayed value, never for the committed value.
	const parse = useCallback(
		(raw: string) => ({ ok: true, value: raw }) as const,
		[],
	);
	const format = useCallback((v: string) => v, []);
	const handleCommit = useCallback(
		(next: string) => onChange(next),
		[onChange],
	);
	const { displayValue, onInputChange, onFocus, onBlur } =
		useLocalFieldValue<string>(value ?? "", parse, format, handleCommit);

	const label = field.label ?? name;
	const control =
		chrome.presentation.control === "dimension" ? (
			<DimensionControl
				id={id}
				name={name}
				label={label}
				value={value}
				units={chrome.presentation.units}
				placeholder={field.placeholder}
				readOnly={readOnly}
				describedBy={chrome.describedBy}
				onCommit={handleCommit}
			/>
		) : (
			<Input
				id={id}
				name={name}
				type="text"
				value={displayValue}
				placeholder={field.placeholder}
				readOnly={readOnly}
				aria-describedby={chrome.describedBy}
				onFocus={onFocus}
				onBlur={onBlur}
				onChange={(event) => {
					if (readOnly === true) return;
					onInputChange(event.target.value);
				}}
			/>
		);

	return (
		<FieldLabel
			icon={field.labelIcon}
			label={label}
			type="text"
			readOnly={readOnly}
			layout={chrome.layout}
			description={chrome.description}
			descriptionId={chrome.descriptionId}
			action={chrome.action}
			htmlFor={id}
		>
			{control}
		</FieldLabel>
	);
}
