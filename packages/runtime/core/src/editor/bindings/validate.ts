/**
 * @file Binding command validation (PLAN-0020 CORE-P3-006;
 * ED-BIND-002; DD-0019 §19).
 *
 * `binding.update` is **upsert** semantics per the CORE-P0-001 freeze
 * §2, so there is no duplicate-id rejection here — writing an existing
 * id replaces it. That is deliberate: a binding editor edits one
 * binding repeatedly, and a create/update split would make every save
 * after the first a different command.
 *
 * Node existence is not checked, matching `commands/validate.ts` and
 * the interaction validator: `AuthoringStateV1` cannot distinguish a
 * missing node from a default-state one.
 */

import type {
	AuthoringStateV1,
	BindingV1,
	EditorError,
} from "@anvilkit/contracts/editor";
import { BindingSchema } from "@anvilkit/schema/editor";
import { makeEditorError } from "../diagnostics.js";

/**
 * Validate a `binding.update` command.
 *
 * Structural issues are aggregated into one error, matching
 * `styleDefinitionShapeErrors` and the interaction validator — a
 * malformed expression can produce a very large Zod issue list, and
 * one error per issue is unbounded on hostile input.
 */
export function bindingUpdateErrors(
	state: AuthoringStateV1,
	binding: BindingV1,
): readonly EditorError[] {
	const errors: EditorError[] = [];

	const parsed = BindingSchema.safeParse(binding);
	if (!parsed.success) {
		errors.push(
			makeEditorError(
				"EDITOR_INVALID_CSS_VALUE",
				`binding "${binding.id}" is not valid`,
				{
					details: {
						kind: "binding",
						bindingId: binding.id,
						issueCount: parsed.error.issues.length,
						firstPath: parsed.error.issues[0]?.path.map(String) ?? [],
					},
				},
			),
		);
	}

	if (binding.target.type === "repeat") {
		const itemName = binding.target.itemName;
		// The item name becomes a scope root the author writes paths
		// against, so an empty one produces expressions that can never
		// resolve — worth rejecting at the command rather than silently
		// yielding `missing` at every read.
		if (itemName.trim() === "") {
			errors.push(
				makeEditorError(
					"EDITOR_INVALID_CSS_VALUE",
					`repeat binding "${binding.id}" needs a non-empty item name`,
					{
						path: ["target", "itemName"],
						details: { kind: "binding", bindingId: binding.id },
					},
				),
			);
		}
		const limit = binding.target.limit;
		if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
			errors.push(
				makeEditorError(
					"EDITOR_INVALID_CSS_VALUE",
					`repeat binding "${binding.id}" limit must be a positive integer`,
					{
						path: ["target", "limit"],
						details: { kind: "binding", bindingId: binding.id, limit },
					},
				),
			);
		}
	}

	void state;
	return errors;
}
