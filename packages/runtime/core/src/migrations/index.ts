/**
 * @file `@anvilkit/core` migrations — the PLAN-0025 §10.2 one-time
 * v1→v2 document migration. React-free; safe in Node, workers, and
 * the browser (re-exported through `@anvilkit/core/editor`).
 */

export {
	legacyNodeToAppearance,
	type MigrateToPuckNativeV2Options,
	type MigrationDiagnostic,
	type MigrationResult,
	migrateToPuckNativeV2,
	normalizeCssForParity,
} from "./puck-native-v2.js";
