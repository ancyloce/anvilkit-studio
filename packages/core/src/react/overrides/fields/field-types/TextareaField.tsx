/**
 * @file Default renderer for Puck `textarea` fields.
 */

import type {
	FieldProps,
	TextareaField as PuckTextareaField,
} from "@puckeditor/core";
import { type ReactNode } from "react";

import { cn } from "../../utils/cn.js";

import type { FieldRendererProps } from "./TextField.js";

export function TextareaField({
	field,
	value,
	onChange,
	readOnly,
	id,
	name,
}: FieldRendererProps<PuckTextareaField, string | undefined>): ReactNode {
	return (
		<textarea
			id={id}
			name={name}
			value={value ?? ""}
			placeholder={field.placeholder}
			readOnly={readOnly}
			rows={4}
			className={cn(
				"flex w-full resize-y rounded-md border border-[var(--ak-studio-border)] bg-transparent px-2.5 py-1.5 text-sm",
				"placeholder:text-[var(--ak-studio-muted-fg)]",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ak-studio-ring)]",
				"disabled:cursor-not-allowed disabled:opacity-50",
				readOnly === true ? "opacity-70" : null,
			)}
			onChange={(event) => {
				if (readOnly === true) return;
				onChange(event.target.value);
			}}
		/>
	);
}

// Re-export the shared FieldRendererProps so other field renderers can
// pull the type through this barrel; avoids fanning out the import path.
export type { FieldProps as PuckFieldProps } from "@puckeditor/core";
export type { FieldRendererProps } from "./TextField.js";
