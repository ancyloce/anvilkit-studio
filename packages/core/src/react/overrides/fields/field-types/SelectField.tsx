/**
 * @file Default renderer for Puck `select` fields. Built on the Base
 * UI Select primitive for richer keyboard / search behavior.
 *
 * Puck options can carry any serializable value (string, number,
 * boolean, object). Base UI's Item only accepts a string `value`, so
 * we use stable internal option ids and resolve back to the original
 * option on selection. The `items` prop carries the id→label map so
 * `<SelectValue>` renders the label automatically.
 */

import type {
	FieldProps,
	SelectField as PuckSelectField,
} from "@puckeditor/core";
import { type ReactNode, useMemo } from "react";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/primitives/select";

import { useMsg } from "@/state/editor-i18n-store";
import { FieldLabel } from "../../layout/FieldLabel";
import {
	findOptionIndex,
	type OptionValue,
	optionId,
	optionIndexFromId,
} from "./option-ids";
import type { FieldRendererProps } from "./TextField";

export function SelectField({
	field,
	value,
	onChange,
	readOnly,
	id,
	name,
}: FieldRendererProps<PuckSelectField, OptionValue | undefined>): ReactNode {
	const msg = useMsg();
	const selectedIndex = useMemo(
		() => findOptionIndex(field.options, value),
		[field.options, value],
	);
	const items = useMemo(
		() =>
			field.options.map((option, index) => ({
				label: option.label,
				value: optionId(index),
			})),
		[field.options],
	);

	return (
		<FieldLabel
			icon={field.labelIcon}
			label={field.label ?? name}
			type="select"
			el="div"
			readOnly={readOnly}
		>
			<Select
				items={items}
				value={selectedIndex === -1 ? null : optionId(selectedIndex)}
				onValueChange={(next) => {
					if (readOnly === true) return;
					if (next === null) {
						onChange(undefined as never);
						return;
					}
					const index = optionIndexFromId(next);
					const match = index === null ? undefined : field.options[index];
					if (match === undefined) return;
					onChange(match.value as never);
				}}
				disabled={readOnly}
				name={name}
			>
				<SelectTrigger id={id} className="w-full">
					<SelectValue placeholder={msg("studio.field.placeholder.select")} />
				</SelectTrigger>
				<SelectContent>
					{field.options.map((option, index) => (
						<SelectItem key={optionId(index)} value={optionId(index)}>
							{option.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</FieldLabel>
	);
}

export type { FieldProps as PuckFieldProps };
