/**
 * @file Default renderer for Puck `text` fields.
 */

import type { FieldProps, TextField as PuckTextField } from "@puckeditor/core";
import { type ReactNode, useCallback } from "react";

import { Input } from "@/primitives/input";
import { FieldLabel } from "@/overrides/layout/FieldLabel";
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
	return (
		<FieldLabel
			icon={field.labelIcon}
			label={field.label ?? name}
			type="text"
			readOnly={readOnly}
		>
			<Input
				id={id}
				name={name}
				type="text"
				value={displayValue}
				placeholder={field.placeholder}
				readOnly={readOnly}
				onFocus={onFocus}
				onBlur={onBlur}
				onChange={(event) => {
					if (readOnly === true) return;
					onInputChange(event.target.value);
				}}
			/>
		</FieldLabel>
	);
}
