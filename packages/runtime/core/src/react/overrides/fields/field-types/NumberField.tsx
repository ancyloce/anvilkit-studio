/**
 * @file Default renderer for Puck `number` fields.
 *
 * Empty string maps to `undefined` to keep the field optional;
 * non-numeric input is dropped (the browser also rejects it on
 * `<input type="number">`, but the explicit guard handles paste
 * shortcuts).
 *
 * task Phase 7: always renders with tabular numerals (DESIGN.md §4.2 —
 * "tabular numerals for zoom, dimensions, measurements"), and shows an
 * explicit unit suffix (`px`, `%`, `rem`, …) when the component author
 * opts in via `field.metadata.unit` — Puck's own generic per-field
 * `metadata` bag (`BaseField.metadata`), not a new convention. Absent
 * metadata renders exactly as before (no unit, plain `<Input>`).
 */

import type {
	FieldProps,
	NumberField as PuckNumberField,
} from "@puckeditor/core";
import { type ReactNode, useCallback } from "react";
import { FieldLabel } from "@/overrides/layout/FieldLabel";
import { Input } from "@/primitives/input";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
	InputGroupText,
} from "@/primitives/input-group";
import type { FieldRendererProps } from "./TextField";
import { type ParseResult, useLocalFieldValue } from "./use-local-field-value";

function readUnit(metadata: unknown): string | undefined {
	if (metadata === null || typeof metadata !== "object") return undefined;
	const unit = (metadata as Record<string, unknown>).unit;
	return typeof unit === "string" && unit.length > 0 ? unit : undefined;
}

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

	const unit = readUnit(field.metadata);
	const handleChange = useCallback(
		(event: { target: { value: string } }) => {
			if (readOnly === true) return;
			onInputChange(event.target.value);
		},
		[onInputChange, readOnly],
	);

	return (
		<FieldLabel
			icon={field.labelIcon}
			label={field.label ?? name}
			type="number"
			readOnly={readOnly}
		>
			{unit === undefined ? (
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
					className="tabular-nums"
					onFocus={onFocus}
					onBlur={onBlur}
					onChange={handleChange}
				/>
			) : (
				<InputGroup>
					<InputGroupInput
						id={id}
						name={name}
						type="number"
						value={displayValue}
						placeholder={field.placeholder}
						readOnly={readOnly}
						min={field.min}
						max={field.max}
						step={field.step}
						className="tabular-nums"
						onFocus={onFocus}
						onBlur={onBlur}
						onChange={handleChange}
					/>
					<InputGroupAddon align="inline-end">
						<InputGroupText>{unit}</InputGroupText>
					</InputGroupAddon>
				</InputGroup>
			)}
		</FieldLabel>
	);
}

export type { FieldProps as PuckFieldProps };
