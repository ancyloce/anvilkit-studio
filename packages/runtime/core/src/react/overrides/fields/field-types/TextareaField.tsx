/**
 * @file Default renderer for Puck `textarea` fields.
 */

import type {
	FieldProps,
	TextareaField as PuckTextareaField,
} from "@puckeditor/core";
import { type ReactNode, useCallback } from "react";
import { FieldLabel } from "@/overrides/layout/FieldLabel";
import { Textarea } from "@/primitives/textarea";
import type { FieldRendererProps } from "./TextField";
import { useFieldChrome } from "./use-field-chrome";
import { useLocalFieldValue } from "./use-local-field-value";

export function TextareaField({
	field,
	value,
	onChange,
	readOnly,
	id,
	name,
}: FieldRendererProps<PuckTextareaField, string | undefined>): ReactNode {
	// Textareas are always full-width (task §4.5) — the chrome is used
	// only for description + reset, never the row layout.
	const chrome = useFieldChrome({
		field,
		name,
		id,
		value,
		readOnly,
		onChange: onChange as (value: never) => void,
	});
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
			type="textarea"
			readOnly={readOnly}
			description={chrome.description}
			descriptionId={chrome.descriptionId}
			action={chrome.action}
			htmlFor={id}
		>
			<Textarea
				id={id}
				name={name}
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
		</FieldLabel>
	);
}

// Re-export the shared FieldRendererProps so other field renderers can
// pull the type through this barrel; avoids fanning out the import path.
export type { FieldProps as PuckFieldProps } from "@puckeditor/core";
export type { FieldRendererProps } from "./TextField";
