/**
 * @file Insert another instance of an existing definition
 * (PLAN-0020 CORE-P2-009F; ED-COMP-002; DD-0019 §14.3).
 *
 * §14.3's second half — "create another instance from an existing
 * definition" — is the mirror of `buildCreateComponentPlan`: no
 * definition is authored, only a new instance node plus the
 * authoring record that points at the definition. Like the capture
 * path it is a **native mutation**: tree change and sidecar record
 * land in one `commitNative`, so one undo removes the instance and
 * its record together.
 *
 * The instance node's component type is the definition root's type,
 * so the page renders the same component the definition captured; the
 * materializer then resolves props from the definition (§14.4).
 */

import type {
	AuthoringStateV1,
	ComponentDefinitionId,
} from "@anvilkit/contracts/editor";
import type { Data as PuckData } from "@puckeditor/core";
import type { PuckTreeNode } from "../tree/nodes.js";

/** A validated insert-instance request. */
export interface InsertInstanceInput {
	readonly definitionId: ComponentDefinitionId;
	/** Caller-generated node id — reducers never generate ids. */
	readonly instanceNodeId: string;
}

/** The result of {@link buildInsertInstancePlan}. */
export interface InsertInstancePlan {
	readonly data: PuckData;
	readonly authoring: AuthoringStateV1;
	readonly instanceNodeId: string;
}

/**
 * Append a new instance of `definitionId` to the page root.
 *
 * Returns `null` — nothing dispatched — when the definition is not in
 * the document or the node id is already taken. Appending to the root
 * rather than into the current selection is deliberate: the panel
 * offers this action with no drop target, and silently nesting into
 * whatever happened to be selected is a worse surprise than a
 * predictable position the user can then drag.
 */
export function buildInsertInstancePlan(
	data: PuckData,
	authoring: AuthoringStateV1,
	input: InsertInstanceInput,
): InsertInstancePlan | null {
	const definition = authoring.componentDefinitions[input.definitionId];
	if (definition === undefined) {
		return null;
	}
	if (authoring.nodes[input.instanceNodeId] !== undefined) {
		return null;
	}

	const instanceNode: PuckTreeNode = {
		type: definition.root.type,
		props: { id: input.instanceNodeId },
	};

	const content = Array.isArray(data.content) ? data.content : [];
	const nextData = {
		...data,
		content: [...content, instanceNode],
	} as PuckData;

	return {
		data: nextData,
		authoring: {
			...authoring,
			nodes: {
				...authoring.nodes,
				[input.instanceNodeId]: {
					version: "1",
					componentInstance: {
						definitionId: definition.id,
						definitionRevision: definition.revision,
						variantSelection: {},
						propOverrides: {},
						nodeOverrides: {},
					},
				},
			},
		},
		instanceNodeId: input.instanceNodeId,
	};
}
