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
import { type ReactNode } from "react";

import { Input } from "../../../studio/primitives/input.js";

import type { FieldRendererProps } from "./TextField.js";

export function NumberField({
	field,
	value,
	onChange,
	readOnly,
	id,
	name,
}: FieldRendererProps<PuckNumberField, number | undefined>): ReactNode {
	return (
		<Input
			id={id}
			name={name}
			type="number"
			value={value === undefined ? "" : value}
			placeholder={field.placeholder}
			readOnly={readOnly}
			min={field.min}
			max={field.max}
			step={field.step}
			onChange={(event) => {
				if (readOnly === true) return;
				const raw = event.target.value;
				if (raw === "") {
					onChange(undefined as never);
					return;
				}
				const next = Number(raw);
				if (Number.isFinite(next)) {
					onChange(next);
				}
			}}
		/>
	);
}

export type { FieldProps as PuckFieldProps };
