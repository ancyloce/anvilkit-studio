/**
 * @file Default renderer for Puck `radio` fields. Built on the
 * ToggleGroup primitive — Base UI's exclusive-select semantics
 * (`multiple: false`) match radio behavior, with a segmented-control
 * presentation.
 *
 * Puck options can carry any serializable value, so each option is
 * serialized to a string via `optionKey()` and resolved back on
 * selection.
 */

import type {
	FieldProps,
	RadioField as PuckRadioField,
} from "@puckeditor/core";
import { type ReactNode } from "react";

import { ToggleGroup, ToggleGroupItem } from "@/primitives/toggle-group";

import type { FieldRendererProps } from "./TextField";

type OptionValue = string | number | boolean | undefined | null | object;

function optionKey(value: OptionValue): string {
	if (value === null) return "null";
	if (value === undefined) return "";
	if (typeof value === "object") return JSON.stringify(value);
	return String(value);
}

export function RadioField({
	field,
	value,
	onChange,
	readOnly,
}: FieldRendererProps<PuckRadioField, OptionValue | undefined>): ReactNode {
	const selected = value === undefined ? [] : [optionKey(value)];

	return (
		<ToggleGroup
			value={selected}
			onValueChange={(next) => {
				if (readOnly === true) return;
				const key = next[0];
				if (key === undefined) {
					onChange(undefined as never);
					return;
				}
				const match = field.options.find(
					(opt) => optionKey(opt.value as OptionValue) === key,
				);
				onChange((match?.value ?? key) as never);
			}}
			disabled={readOnly}
			variant="outline"
		>
			{field.options.map((option) => (
				<ToggleGroupItem
					key={optionKey(option.value as OptionValue)}
					value={optionKey(option.value as OptionValue)}
				>
					{option.label}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	);
}

export type { FieldProps as PuckFieldProps };
