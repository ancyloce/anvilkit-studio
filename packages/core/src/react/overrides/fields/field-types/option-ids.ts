export type OptionValue = string | number | boolean | undefined | null | object;

const OPTION_ID_PREFIX = "option:";

export function optionId(index: number): string {
	return `${OPTION_ID_PREFIX}${index}`;
}

export function optionIndexFromId(id: string): number | null {
	if (!id.startsWith(OPTION_ID_PREFIX)) return null;
	const index = Number(id.slice(OPTION_ID_PREFIX.length));
	return Number.isInteger(index) && index >= 0 ? index : null;
}

export function findOptionIndex(
	options: readonly { readonly value?: unknown }[],
	value: unknown,
): number {
	return options.findIndex((option) => Object.is(option.value, value));
}
