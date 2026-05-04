/**
 * @file Default renderer for Puck `textarea` fields.
 */

import type {
	FieldProps,
	TextareaField as PuckTextareaField,
} from "@puckeditor/core";
import { type ReactNode } from "react";

import { Textarea } from "@/primitives/textarea";

import type { FieldRendererProps } from "./TextField";

export function TextareaField({
	field,
	value,
	onChange,
	readOnly,
	id,
	name,
}: FieldRendererProps<PuckTextareaField, string | undefined>): ReactNode {
	return (
    <Textarea
      id={id}
      name={name}
      value={value ?? ""}
      placeholder={field.placeholder}
      readOnly={readOnly}
      rows={4}
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
export type { FieldRendererProps } from "./TextField";
