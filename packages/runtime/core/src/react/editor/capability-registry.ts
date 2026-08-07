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
 *
 * `readDocument` is optional so existing callers keep compiling, but
 * every in-repo construction site supplies it: without the document
 * the scan cannot see `richText` (which lives in component props),
 * and a registry that under-reports used features would let a
 * document slip past the production export block (DD-DEC-018).
 */

import type {
	AnvilComponentMetadata,
	EditorFeatureId,
} from "@anvilkit/contracts/editor";
import type {
	AuthoringStateV1,
} from "../../editor/legacy/index.js";
import type { PuckApi } from "@puckeditor/core";
import {
	type EditorFeatureScanDocument,
	listUsedEditorFeatures,
} from "../../editor/index.js";
import type { EditorCapabilityRegistry } from "../../types/editor-api.js";
import { readEditorMetadata } from "../../puck/component-metadata.js";

/** Dependencies of the registry — thunks so tests need no `<Studio>`. */
export interface CapabilityRegistryDeps {
	/** Live Puck API; may throw before `<Puck>` binds. */
	readonly getPuckApi: () => PuckApi;
	/** Current parsed authoring state (the command port's read side). */
	readonly readAuthoring: () => AuthoringStateV1;
	/**
	 * Current document, for prop-level feature detection. Omitting it
	 * limits `listUsedFeatures` to sidecar-visible features.
	 */
	readonly readDocument?: () => EditorFeatureScanDocument | null;
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
	): AnvilComponentMetadata | undefined => {
		try {
			const components = api()?.config.components as
				| Record<string, unknown>
				| undefined;
			const component = components?.[componentType];
			return component === undefined
				? undefined
				: readEditorMetadata(component);
		} catch {
			return undefined;
		}
	};

	return {
		forComponent,
		forNode(nodeId: string): AnvilComponentMetadata | undefined {
			// Puck's own id index throws while its app state is mid-
			// transition — notably on the render right after an undo of a
			// tree mutation. A capability lookup is advisory, so a
			// transient failure must degrade to "no metadata" (the legacy
			// path) and never take the chrome down with it: this call
			// happens during render, where a throw crashes the Studio.
			try {
				const item = api()?.getItemById(nodeId);
				return item === undefined || item === null
					? undefined
					: forComponent(item.type);
			} catch {
				return undefined;
			}
		},
		listUsedFeatures(): readonly EditorFeatureId[] {
			return listUsedEditorFeatures(
				deps.readAuthoring(),
				deps.readDocument?.() ?? null,
			);
		},
	};
}
