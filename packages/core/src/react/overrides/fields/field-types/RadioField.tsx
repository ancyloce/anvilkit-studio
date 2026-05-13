/**
 * @file Default renderer for Puck `radio` fields. Built on the
 * ToggleGroup primitive — Base UI's exclusive-select semantics
 * (`multiple: false`) match radio behavior, with a segmented-control
 * presentation.
 *
 * Puck options can carry any serializable value, so each option is
 * assigned a stable internal id and resolved back on selection.
 */

import type {
	FieldProps,
	RadioField as PuckRadioField,
} from "@puckeditor/core";
import { type ReactNode } from "react";

import {
	Toggle,
	ToggleGroup,
} from "@/primitives/animate-ui/components/base/toggle-group";

import { FieldLabel } from "../../layout/FieldLabel";
import {
	findOptionIndex,
	type OptionValue,
	optionId,
	optionIndexFromId,
} from "./option-ids";
import type { FieldRendererProps } from "./TextField";

export function RadioField({
	field,
	value,
	onChange,
	readOnly,
	name,
}: FieldRendererProps<PuckRadioField, OptionValue | undefined>): ReactNode {
	const selectedIndex = findOptionIndex(field.options, value);
	const selected = selectedIndex === -1 ? [] : [optionId(selectedIndex)];

	return (
		<FieldLabel
			icon={field.labelIcon}
			label={field.label ?? name}
			type="radio"
			el="div"
			readOnly={readOnly}
		>
			<ToggleGroup
				value={selected}
				onValueChange={(next) => {
					if (readOnly === true) return;
					const key = next[0];
					if (key === undefined) {
						onChange(undefined as never);
						return;
					}
					const index = optionIndexFromId(key);
					const match = index === null ? undefined : field.options[index];
					if (match === undefined) return;
					onChange(match.value as never);
				}}
				disabled={readOnly}
				size="sm"
				variant="outline"
			>
				{field.options.map((option, index) => (
					<Toggle key={optionId(index)} value={optionId(index)}>
						{option.label}
					</Toggle>
				))}
			</ToggleGroup>
		</FieldLabel>
	);
}

export type { FieldProps as PuckFieldProps };
