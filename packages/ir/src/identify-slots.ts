import type { Config } from "@puckeditor/core";

/**
 * Inspect a Puck `Config` and return the set of field keys that
 * behave as `slot` (nested child-tree) fields, grouped by
 * component name.
 *
 * The IR transform uses this to decide which prop values should be
 * descended into as {@link import("@anvilkit/core/types").PageIRNode.children | PageIRNode.children}
 * versus copied verbatim into {@link import("@anvilkit/core/types").PageIRNode.props | PageIRNode.props}.
 *
 * ### Detection heuristic
 *
 * A field is considered a slot if its `type` is `"slot"` (Puck's
 * explicit slot field type). This covers Puck 0.19+ where slot
 * fields are first-class citizens in the field schema.
 *
 * @param config - The Puck `Config` to inspect.
 * @returns A map from component name to the list of slot-field keys
 *   declared on that component. Components with no slots are
 *   included with an empty array.
 */
export function identifySlots(config: Config): Map<string, readonly string[]> {
	const result = new Map<string, readonly string[]>();

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

		result.set(name, slotKeys.sort());
	}

	return result;
}
