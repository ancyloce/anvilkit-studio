export interface IsJsonSerializableOptions {
	dateAsIso?: boolean;
}

export function isJsonSerializable(
	value: unknown,
	opts?: IsJsonSerializableOptions,
): boolean {
	return check(value, opts, new WeakSet());
}

function check(
	value: unknown,
	opts: IsJsonSerializableOptions | undefined,
	seen: WeakSet<object>,
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

	if (seen.has(value as object)) return false;
	seen.add(value as object);

	if (Array.isArray(value)) {
		return value.every((item) => check(item, opts, seen));
	}

	return Object.values(value as Record<string, unknown>).every((v) =>
		check(v, opts, seen),
	);
}
