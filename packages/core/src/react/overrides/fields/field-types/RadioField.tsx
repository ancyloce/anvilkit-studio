/**
 * @file Default renderer for Puck `radio` fields. Plain HTML radios —
 * accessibility comes free.
 */

import type {
	FieldProps,
	RadioField as PuckRadioField,
} from "@puckeditor/core";
import { type ReactNode } from "react";

import { cn } from "../../utils/cn.js";

import type { FieldRendererProps } from "./TextField.js";

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
	id,
	name,
}: FieldRendererProps<PuckRadioField, OptionValue | undefined>): ReactNode {
	const groupName = id ?? name;
	return (
		<div role="radiogroup" className="flex flex-col gap-1">
			{field.options.map((option) => {
				const optionId = `${groupName}-${optionKey(option.value)}`;
				const checked =
					value !== undefined && optionKey(option.value) === optionKey(value);
				return (
					<label
						key={optionId}
						htmlFor={optionId}
						className={cn(
							"flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-sm",
							"hover:bg-[var(--ak-studio-muted)]",
							readOnly === true ? "cursor-not-allowed opacity-70" : null,
						)}
					>
						<input
							id={optionId}
							type="radio"
							name={groupName}
							value={optionKey(option.value)}
							checked={checked}
							disabled={readOnly}
							onChange={() => {
								if (readOnly === true) return;
								onChange(option.value as OptionValue);
							}}
						/>
						<span>{option.label}</span>
					</label>
				);
			})}
		</div>
	);
}

export type { FieldProps as PuckFieldProps };
