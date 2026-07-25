/**
 * @file `styleDefinition.update` patch application (PLAN-0020
 * CORE-P2-003).
 *
 * Shared by validation (which needs the prospective definition to
 * shape-check before commit) and reduction (which writes it), so what
 * was validated is exactly what lands.
 */

import type {
	EditorPatch,
	StyleDefinitionV1,
} from "@anvilkit/contracts/editor";
import { applyEditorPatch } from "../patch.js";

/**
 * Apply a style-definition patch. `id` and `version` are immutable
 * (they are not part of the patch type) and are always carried
 * through.
 */
export function applyStyleDefinitionPatch(
	definition: StyleDefinitionV1,
	patch: EditorPatch<Omit<StyleDefinitionV1, "id" | "version">>,
): StyleDefinitionV1 {
	const next = applyEditorPatch<StyleDefinitionV1>(
		definition,
		patch as EditorPatch<StyleDefinitionV1>,
	);
	if (next === undefined) {
		return definition;
	}
	return next.id === definition.id && next.version === definition.version
		? next
		: { ...next, id: definition.id, version: definition.version };
}
