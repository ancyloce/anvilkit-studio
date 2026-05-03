/**
 * @file Default renderer for Puck `select` fields. Uses a native
 * `<select>` for v1 — the chrome's other dropdowns can move to Base
 * UI Select later if richer keyboard / search behaviors land.
 */

import type {
	FieldProps,
	SelectField as PuckSelectField,
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

export function SelectField({
	field,
	value,
	onChange,
	readOnly,
	id,
	name,
}: FieldRendererProps<PuckSelectField, OptionValue | undefined>): ReactNode {
	return (
		<select
			id={id}
			name={name}
			value={value === undefined ? "" : optionKey(value)}
			disabled={readOnly}
			className={cn(
				"flex h-8 w-full rounded-md border border-[var(--ak-studio-border)] bg-transparent px-2 text-sm",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ak-studio-ring)]",
				"disabled:cursor-not-allowed disabled:opacity-50",
			)}
			onChange={(event) => {
				if (readOnly === true) return;
				const raw = event.target.value;
				const match = field.options.find((opt) => optionKey(opt.value) === raw);
				onChange((match?.value ?? raw) as OptionValue);
			}}
		>
			{field.options.map((option) => (
				<option key={optionKey(option.value)} value={optionKey(option.value)}>
					{option.label}
				</option>
			))}
		</select>
	);
}

export type { FieldProps as PuckFieldProps };
