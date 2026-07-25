"use client";

/**
 * @file `createEditorCapabilityRegistry` (PLAN-0020 CORE-P1A-003;
 * DD-0019 §8, §21.1).
 *
 * Lives in the lazy editor chunk. Component lookups read the live
 * (decorated) Puck config's `metadata.editor` — decoration preserves
 * metadata by reference, so this sees exactly what the host declared.
 * Node lookups resolve through Puck's own id index
 * (`getItemById`). `listUsedFeatures` delegates to the shared
 * `@anvilkit/ir/editor` projection — the same set exporter preflight
 * consumes, so the two can never disagree.
 */

import type {
	AuthoringStateV1,
	EditorCapabilityMetadata,
	EditorFeatureId,
} from "@anvilkit/contracts/editor";
import type { PuckApi } from "@puckeditor/core";
import { listUsedAuthoringFeatures } from "../../editor/index.js";
import type { EditorCapabilityRegistry } from "../../types/editor-api.js";
import { readEditorMetadata } from "./decorate-config.js";

/** Dependencies of the registry — thunks so tests need no `<Studio>`. */
export interface CapabilityRegistryDeps {
	/** Live Puck API; may throw before `<Puck>` binds. */
	readonly getPuckApi: () => PuckApi;
	/** Current parsed authoring state (the command port's read side). */
	readonly readAuthoring: () => AuthoringStateV1;
}

/** Build the per-`<Studio>` capability registry. */
export function createEditorCapabilityRegistry(
	deps: CapabilityRegistryDeps,
): EditorCapabilityRegistry {
	const api = (): PuckApi | null => {
		try {
			return deps.getPuckApi();
		} catch {
			return null;
		}
	};

	const forComponent = (
		componentType: string,
	): EditorCapabilityMetadata | undefined => {
		const components = api()?.config.components as
			| Record<string, unknown>
			| undefined;
		const component = components?.[componentType];
		return component === undefined ? undefined : readEditorMetadata(component);
	};

	return {
		forComponent,
		forNode(nodeId: string): EditorCapabilityMetadata | undefined {
			const item = api()?.getItemById(nodeId);
			return item === undefined || item === null
				? undefined
				: forComponent(item.type);
		},
		listUsedFeatures(): readonly EditorFeatureId[] {
			return listUsedAuthoringFeatures(deps.readAuthoring());
		},
	};
}
