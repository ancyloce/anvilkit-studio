/**
 * @file Default renderer for Puck `number` fields.
 *
 * Empty string maps to `undefined` to keep the field optional;
 * non-numeric input is dropped (the browser also rejects it on
 * `<input type="number">`, but the explicit guard handles paste
 * shortcuts).
 */

import type {
	FieldProps,
	NumberField as PuckNumberField,
} from "@puckeditor/core";
import { type ReactNode, useCallback } from "react";

import { Input } from "@/primitives/input";

import { FieldLabel } from "../../layout/FieldLabel";
import type { FieldRendererProps } from "./TextField";
import { type ParseResult, useLocalFieldValue } from "./use-local-field-value";

export function NumberField({
	field,
	value,
	onChange,
	readOnly,
	id,
	name,
}: FieldRendererProps<PuckNumberField, number | undefined>): ReactNode {
	// Buffer the raw string the user is typing so intermediate states
	// like `""`, `"-"`, or `"1."` survive a parent re-render. Commit
	// only when the string parses to a finite number (or to
	// `undefined` for the empty case), matching the prior outbound
	// shape exactly.
	const parse = useCallback((raw: string): ParseResult<number | undefined> => {
		if (raw === "") return { ok: true, value: undefined };
		const next = Number(raw);
		return Number.isFinite(next) ? { ok: true, value: next } : { ok: false };
	}, []);
	const format = useCallback(
		(v: number | undefined) => (v === undefined ? "" : String(v)),
		[],
	);
	const handleCommit = useCallback(
		(next: number | undefined) => onChange(next as never),
		[onChange],
	);
	const { displayValue, onInputChange, onFocus, onBlur } = useLocalFieldValue<
		number | undefined
	>(value, parse, format, handleCommit);
	return (
		<FieldLabel
			icon={field.labelIcon}
			label={field.label ?? name}
			type="number"
			readOnly={readOnly}
		>
			<Input
				id={id}
				name={name}
				type="number"
				value={displayValue}
				placeholder={field.placeholder}
				readOnly={readOnly}
				min={field.min}
				max={field.max}
				step={field.step}
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

export type { FieldProps as PuckFieldProps };
