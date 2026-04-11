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
 * **Stubbed in `phase3-002`.** Real implementation lands in
 * `phase3-004`.
 *
 * @param _config - The Puck `Config` to inspect.
 * @returns A map from component name to the set of slot-field keys
 *   declared on that component.
 * @throws {Error} Always — the real helper lands in `phase3-004`.
 */
export function identifySlots(_config: Config): Map<string, ReadonlySet<string>> {
	throw new Error(
		"[@anvilkit/ir] identifySlots is not implemented yet — see phase3-004.",
	);
}
