/**
 * @file Field-type registry. Shape matches Puck's
 * `Partial<FieldRenderFunctions>` so it slots straight into
 * `studioOverrides.fieldTypes`.
 *
 * Covers the 9 standard field types plus `richtext` — a lazily-loaded
 * TipTap editor (see {@link RichTextField}) that replaces Puck's built-in
 * richtext editor. `custom` is the lone omission: Puck's renderer for
 * `custom` is the consumer's own `render` fn, not an override target.
 */

import type { FieldProps, Overrides as PuckOverrides } from "@puckeditor/core";
import type { FunctionComponent, ReactNode } from "react";

import { ArrayField } from "./ArrayField";
import { ExternalField } from "./ExternalField";
import { NumberField } from "./NumberField";
import { ObjectField } from "./ObjectField";
import { RadioField } from "./RadioField";
import { RichTextField } from "./RichTextField";
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
	RichTextField,
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
 * Puck `Field.type` literals this registry can supply. `custom` is
 * intentionally absent (see file header). Used both as the compile-time
 * key set (`Record<FieldTypeKey, …>`) and the runtime guard in
 * {@link defineFieldTypeRegistry}.
 */
const FIELD_TYPE_KEYS = [
	"text",
	"textarea",
	"richtext",
	"number",
	"select",
	"radio",
	"array",
	"object",
	"slot",
	"external",
] as const;

export type FieldTypeKey = (typeof FIELD_TYPE_KEYS)[number];

const KNOWN_FIELD_TYPES: ReadonlySet<string> = new Set(FIELD_TYPE_KEYS);

/**
 * The single, documented type-erasure boundary. Each concrete `*Field`
 * component has its own precise prop type; Puck's `fieldTypes` generic
 * flattens them to one signature and validates props at call time.
 * Accepting `FunctionComponent<never>` lets every concrete renderer be
 * passed without a call-site cast (a narrower-props function is
 * assignable to a `never`-props one), so the cast lives here once
 * instead of being repeated per entry.
 */
function asFieldRenderer(
	component: FunctionComponent<never>,
): FieldTypeRenderer {
	return component as unknown as FieldTypeRenderer;
}

/**
 * Build the Puck `fieldTypes` registry from a fully-keyed renderer map.
 * `Record<FieldTypeKey, …>` enforces — at compile time — that every
 * supported key is present and no unknown key is added; the runtime
 * guard turns any stray key into a loud error instead of a silently
 * dropped renderer. The lone unavoidable registry-shape cast is kept
 * here, not duplicated at every renderer.
 */
export function defineFieldTypeRegistry(
	renderers: Record<FieldTypeKey, FieldTypeRenderer>,
): FieldTypeRegistry {
	for (const key of Object.keys(renderers)) {
		if (!KNOWN_FIELD_TYPES.has(key)) {
			throw new Error(`Unknown field type in registry: "${key}"`);
		}
	}
	return renderers as unknown as FieldTypeRegistry;
}

/**
 * Default field-type registry. Keys match Puck `Field.type` literals
 * exactly. `custom` is intentionally absent (it has no override target).
 */
export const defaultFieldTypes = defineFieldTypeRegistry({
	text: asFieldRenderer(TextField),
	textarea: asFieldRenderer(TextareaField),
	richtext: asFieldRenderer(RichTextField),
	number: asFieldRenderer(NumberField),
	select: asFieldRenderer(SelectField),
	radio: asFieldRenderer(RadioField),
	array: asFieldRenderer(ArrayField),
	object: asFieldRenderer(ObjectField),
	slot: asFieldRenderer(SlotField),
	external: asFieldRenderer(ExternalField),
} satisfies Record<FieldTypeKey, FieldTypeRenderer>);
