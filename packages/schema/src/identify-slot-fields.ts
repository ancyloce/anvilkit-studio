import type { Config } from "@puckeditor/core";

export function identifySlotFields<C extends Config>(
	config: C,
): Map<string, readonly string[]> {
	const entries: [string, readonly string[]][] = [];

	for (const [name, componentConfig] of Object.entries(
		config.components ?? {},
	)) {
		const slotKeys: string[] = [];
		const fields = componentConfig.fields;

		if (fields && typeof fields === "object") {
			for (const [fieldKey, fieldDef] of Object.entries(fields)) {
				if (
					fieldDef &&
					typeof fieldDef === "object" &&
					"type" in fieldDef &&
					fieldDef.type === "slot"
				) {
					slotKeys.push(fieldKey);
				}
			}
		}

		entries.push([name, slotKeys.sort((a, b) => a.localeCompare(b))]);
	}

	entries.sort(([a], [b]) => a.localeCompare(b));

	const result = new Map<string, readonly string[]>();

	for (const [name, keys] of entries) {
		result.set(name, keys);
	}

	return result;
}
