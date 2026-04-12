import { z } from "zod";

const knownFieldTypes = [
	"text",
	"textarea",
	"richtext",
	"number",
	"select",
	"radio",
	"array",
	"object",
	"external",
	"custom",
	"slot",
] as const;

export type KnownFieldType = (typeof knownFieldTypes)[number];

export const knownFieldTypeSet: ReadonlySet<string> = new Set<string>(
	knownFieldTypes,
);

const fieldZodSchema = z
	.object({
		type: z.string().check(z.minLength(1)),
	})
	.passthrough();

export function makeFieldZodSchema() {
	return fieldZodSchema;
}
