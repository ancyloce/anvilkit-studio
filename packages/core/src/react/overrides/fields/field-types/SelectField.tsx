/**
 * @file Default renderer for Puck `select` fields. Built on the Base
 * UI Select primitive for richer keyboard / search behavior.
 *
 * Puck options can carry any serializable value (string, number,
 * boolean, object). Base UI's Item only accepts a string `value`, so
 * we serialize each option's value through `optionKey()` and resolve
 * back to the original on selection. The `items` prop carries the
 * key→label map so `<SelectValue>` renders the label automatically.
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

import type { FieldRendererProps } from "./TextField";

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
	const items = useMemo(
    () =>
      field.options.map((option) => ({
        label: option.label,
        value: optionKey(option.value as OptionValue),
      })),
    [field.options],
  );

	return (
    <Select
      items={items}
      value={value === undefined ? null : optionKey(value)}
      onValueChange={(next) => {
        if (readOnly === true) return;
        if (next === null || next === "") {
          onChange(undefined as never);
          return;
        }
        const match = field.options.find(
          (opt) => optionKey(opt.value as OptionValue) === next,
        );
        onChange((match?.value ?? next) as never);
      }}
      disabled={readOnly}
      name={name}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder="Select…" />
      </SelectTrigger>
      <SelectContent>
        {field.options.map((option) => (
          <SelectItem
            key={optionKey(option.value as OptionValue)}
            value={optionKey(option.value as OptionValue)}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export type { FieldProps as PuckFieldProps };
