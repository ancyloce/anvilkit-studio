/**
 * @file Field-type registry. Shape matches Puck's
 * `Partial<FieldRenderFunctions>` so it slots straight into
 * `studioOverrides.fieldTypes`.
 *
 * v1 covers the 9 standard field types (PRD §11 decision 2). The
 * `richtext` and `custom` types are deliberately omitted — Puck's
 * default renderer for `custom` is the consumer's own `render` fn
 * (not an override target), and `richtext` is deferred until the
 * editor stack settles (PRD §12 follow-up).
 */

import type { FieldProps, Overrides as PuckOverrides } from "@puckeditor/core";
import type { FunctionComponent, ReactNode } from "react";

import { ArrayField } from "./ArrayField";
import { ExternalField } from "./ExternalField";
import { NumberField } from "./NumberField";
import { ObjectField } from "./ObjectField";
import { RadioField } from "./RadioField";
import { SelectField } from "./SelectField";
import { SlotField } from "./SlotField";
import { TextareaField } from "./TextareaField";
import { TextField } from "./TextField";

export {
	ArrayField,
	ExternalField,
	NumberField,
	ObjectField,
	RadioField,
	SelectField,
	SlotField,
	TextareaField,
	TextField,
};

export type FieldTypeRenderer = FunctionComponent<
	FieldProps & { children: ReactNode; name: string }
>;

export type FieldTypeRegistry = NonNullable<PuckOverrides["fieldTypes"]>;

/**
 * Default field-type registry. Keys match Puck `Field.type` literals
 * exactly. `richtext` and `custom` are intentionally absent.
 */
export const defaultFieldTypes = {
	text: TextField as unknown as FieldTypeRenderer,
	textarea: TextareaField as unknown as FieldTypeRenderer,
	number: NumberField as unknown as FieldTypeRenderer,
	select: SelectField as unknown as FieldTypeRenderer,
	radio: RadioField as unknown as FieldTypeRenderer,
	array: ArrayField as unknown as FieldTypeRenderer,
	object: ObjectField as unknown as FieldTypeRenderer,
	slot: SlotField as unknown as FieldTypeRenderer,
	external: ExternalField as unknown as FieldTypeRenderer,
} as unknown as FieldTypeRegistry;
