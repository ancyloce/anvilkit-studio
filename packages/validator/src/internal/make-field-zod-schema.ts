import { looseObject, minLength, string } from "zod/mini";

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

export function makeFieldZodSchema() {
	return looseObject({
		type: string().check(minLength(1)),
	});
}
