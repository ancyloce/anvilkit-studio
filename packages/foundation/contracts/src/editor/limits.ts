/**
 * @file Document limits (DD-0019 §7.3).
 *
 * Count limits are frozen here as a constant; byte-limit **numeric
 * defaults are deliberately absent** — they are measured and frozen
 * by the Phase 0 benchmarks (CORE-P0-014) before any writer is
 * enabled beyond development flags. Limits produce stable validation
 * errors (`EDITOR_LIMIT_EXCEEDED`); data is never silently truncated.
 */

/**
 * Byte limits measured against the canonical (compacted)
 * serialization (CORE-P0-006). Exceeding a warn limit surfaces a
 * persistent diagnostic; exceeding a hard limit rejects the write.
 * Hosts may tighten via `EditorPolicies.byteLimits` but never raise
 * above the frozen caps.
 */
export interface EditorByteLimits {
	readonly sidecarWarnBytes: number;
	readonly sidecarMaxBytes: number;
	readonly componentDefinitionMaxBytes: number;
	readonly richTextValueMaxBytes: number;
	readonly commandMaxBytes: number;
}

/**
 * The frozen §7.3 count-limit table. Enforced at schema parse and
 * command validation; each violation carries the exceeded key in
 * `EditorError.details`.
 */
export const EDITOR_COUNT_LIMITS = {
	/** Enabled breakpoints per document. */
	breakpoints: 8,
	/** Node authoring records per document. */
	nodeRecords: 5_000,
	/** Tokens per document. */
	tokens: 2_000,
	/** Maximum token alias chain depth. */
	tokenAliasDepth: 8,
	/** Style definitions per document. */
	styleDefinitions: 1_000,
	/** Local component definitions per document. */
	componentDefinitions: 500,
	/** Component nesting depth (editor UI initially limits to 5). */
	componentNestingDepth: 10,
	/** Variants per component. */
	variantsPerComponent: 20,
	/** Variant axes per component. */
	variantAxesPerComponent: 3,
	/** Interactions per document. */
	interactions: 1_000,
	/** Actions per interaction. */
	actionsPerInteraction: 100,
	/** Binding expression AST depth. */
	bindingAstDepth: 16,
	/** Binding expression AST node count. */
	bindingAstNodeCount: 256,
	/** Commands per batch (contract freeze CORE-P0-001 §5; aligns
	 * with the §21.2 AI proposal limit). */
	commandsPerBatch: 200,
} as const;

/** The frozen count-limit table's type. */
export type EditorCountLimits = typeof EDITOR_COUNT_LIMITS;
