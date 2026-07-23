/**
 * @file Exporter capability declarations and validation results
 * (DD-0019 §23.2; DD-DEC-018).
 *
 * There is no standalone exporter capability object and no parallel
 * registry: `editorCapabilities` is an additive optional field on the
 * existing `ExportFormatDefinition` (CORE-P0-004). A format without
 * the field declares no editor features — any used editor feature
 * blocks production export through that format; development preview
 * may degrade only with a persistent warning.
 */

import type { EditorError } from "./errors.js";
import type { InteractionAction } from "./interactions.js";

/** Feature identifiers used for capability validation (DD-0019 §23.2). */
export type EditorFeatureId =
	| "responsive"
	| "tokens"
	| "styleDefinitions"
	| "localComponents"
	| "variants"
	| "interactions"
	| "bindings"
	| "richText";

/** An exporter's declared editor capabilities (DD-0019 §23.2, verbatim). */
export interface EditorExportCapabilities {
	readonly version: "1";
	readonly supportedFeatures: readonly EditorFeatureId[];
	readonly supportedInteractionActions?: readonly InteractionAction["type"][];
	readonly supportsTokenModes?: boolean;
	readonly supportsReducedMotion?: boolean;
}

/** The result of used-features vs declared-capabilities validation. */
export interface ExportValidationResult {
	readonly status: "passed" | "warning" | "blocked";
	readonly usedFeatures: readonly EditorFeatureId[];
	readonly errors: readonly EditorError[];
}
