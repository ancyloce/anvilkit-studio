/**
 * @file `component.definition.update` patch application (PLAN-0020
 * CORE-P2-009A).
 *
 * Shared by validation (which needs the *prospective* definition to
 * run the variant-model checks before commit) and reduction (which
 * writes it), so the model that was validated is exactly the one that
 * lands.
 */

import type {
	ComponentDefinitionV1,
	EditorPatch,
} from "@anvilkit/contracts/editor";
import { applyEditorPatch } from "../patch.js";

/**
 * Apply a definition patch. `id`, `version`, and `revision` are not
 * patchable and are always carried through — the reducer owns the
 * revision bump so propagation is observable and callers cannot forge
 * a stale value.
 */
export function applyComponentDefinitionPatch(
	definition: ComponentDefinitionV1,
	patch: EditorPatch<
		Omit<ComponentDefinitionV1, "id" | "version" | "revision">
	>,
): ComponentDefinitionV1 {
	const next = applyEditorPatch<ComponentDefinitionV1>(
		definition,
		patch as EditorPatch<ComponentDefinitionV1>,
	);
	if (next === undefined) {
		return definition;
	}
	return {
		...next,
		id: definition.id,
		version: definition.version,
		revision: definition.revision,
	};
}
