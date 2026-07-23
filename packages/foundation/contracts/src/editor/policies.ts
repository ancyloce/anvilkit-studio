/**
 * @file Host policies (DD-0019 §22.4).
 *
 * Policies belong to host configuration and never change document
 * resolution semantics. `byteLimits` overrides may only tighten the
 * frozen defaults; a looser value is rejected with a diagnostic
 * (CORE-P0-014 tighten-only rule).
 */

import type { EditorByteLimits } from "./limits.js";

/**
 * How deleting a component definition with live instances behaves
 * (DD-0019 §14.6, ED-COMP-006): `"confirm-detach-all"` (default)
 * offers cancel or detach-all; `"block-when-referenced"` rejects with
 * `EDITOR_DEFINITION_REFERENCED` — including for a single-transaction
 * detach-all→delete batch, whose policy check runs against the
 * batch-entry state (contract freeze CORE-P0-001 §4).
 */
export type ComponentDefinitionDeletePolicy =
	| "confirm-detach-all"
	| "block-when-referenced";

/** Host policy bag (DD-0019 §22.4, verbatim). */
export interface EditorPolicies {
	readonly maxBreakpoints?: number;
	readonly allowRawUrls?: boolean;
	readonly requireAltText?: boolean;
	readonly exportBlockingSeverity?: "none" | "critical" | "warning";
	readonly allowPluginSilentCommands?: boolean;
	readonly componentDefinitionDelete?: ComponentDefinitionDeletePolicy;
	readonly byteLimits?: Partial<EditorByteLimits>;
}
