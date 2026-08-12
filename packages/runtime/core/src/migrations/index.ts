/**
 * @file `@anvilkit/core` migrations — the PLAN-0025 §10.2 one-time
 * v1→v2 document migration, plus `p7-002`'s store-finalization pass.
 * React-free; safe in Node, workers, and the browser (re-exported
 * through `@anvilkit/core/editor`).
 *
 * Lifetimes differ and it matters: `p7-004` deletes `puck-native-v2.ts`
 * and `legacy-sidecar.ts` once production is migrated, while
 * `finalize-document.ts` **survives** — it is the body of the store
 * loader's below-floor read path, which `p7-001`'s policy keeps for at
 * least two further finalized revisions.
 */

export {
	addDocumentMarkers,
	countDocumentMarkers,
	type DocumentMarkerCounts,
	type FinalizeStoredDocumentResult,
	finalizeStoredDocument,
	NO_DOCUMENT_MARKERS,
	totalDocumentMarkers,
} from "./finalize-document.js";
export {
	legacyNodeToAppearance,
	type MigrateToPuckNativeV2Options,
	type MigrationDiagnostic,
	type MigrationResult,
	migrateToPuckNativeV2,
	normalizeCssForParity,
} from "./puck-native-v2.js";
