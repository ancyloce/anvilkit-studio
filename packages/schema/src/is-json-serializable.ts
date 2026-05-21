export interface IsJsonSerializableOptions {
	dateAsIso?: boolean;
}

export function isJsonSerializable(
	value: unknown,
	opts?: IsJsonSerializableOptions,
): boolean {
	return check(value, opts, new Set());
}

function check(
	value: unknown,
	opts: IsJsonSerializableOptions | undefined,
	ancestors: Set<object>,
): boolean {
	if (value === null) return true;
	if (value === undefined) return false;

	switch (typeof value) {
		case "string":
		case "number":
		case "boolean":
			return true;
		case "function":
		case "symbol":
		case "bigint":
			return false;
		case "object":
			break;
		default:
			return false;
	}

	if (value instanceof Date) {
		return opts?.dateAsIso === true;
	}

	const proto = Object.getPrototypeOf(value);
	if (
		proto !== Object.prototype &&
		proto !== Array.prototype &&
		proto !== null
	) {
		return false;
	}

	const obj = value as object;
	if (ancestors.has(obj)) return false;
	ancestors.add(obj);

	const result = Array.isArray(value)
		? value.every((item) => check(item, opts, ancestors))
		: Object.values(value as Record<string, unknown>).every((v) =>
				check(v, opts, ancestors),
			);

	ancestors.delete(obj);
	return result;
}
