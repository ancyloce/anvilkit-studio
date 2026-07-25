/**
 * @file Barrel for `@anvilkit/core/editor` — the **React-free,
 * Puck-runtime-free** editor engine (DD-0019 §22.2; PLAN-0020
 * CORE-P0-007/-008/-010/-018/-019).
 *
 * ### What lives here
 *
 * Sidecar read/write over `root.props.__anvilkit`, the pure command
 * pipeline (`applyEditorCommand`: revision gate → validate → reduce →
 * noop detection), the resolvers (responsive, property-wise merge,
 * tokens, node authoring), the single style-materialization
 * implementation (`resolveAuthoringStyle` + allowlisted serializer),
 * the reconciliation engine, and the shared dev-invariant helper.
 *
 * ### Import rules (enforced by `check:no-headless-import` +
 * `check:react-free-runtime`)
 *
 * Only `@anvilkit/contracts`, `@anvilkit/schema`, `@anvilkit/ir`,
 * and `@anvilkit/utils` may be imported. Puck imports are type-only
 * (`import type { Data }`); React never appears. React and Puck
 * integration lives in `@anvilkit/core/react/editor` (Phase 1A).
 */

// Shared used-features projection (CORE-P1A-003): re-exported from
// the engine so React-layer consumers reach it without importing
// `@anvilkit/ir` directly — `src/editor/` is the one directory the
// `check:no-headless-import` gate allowlists for ir imports.
export { listUsedAuthoringFeatures } from "@anvilkit/ir/editor";
export {
	type AuthoringChangeSet,
	applyEditorCommand,
	diffAuthoringState,
	type EditorReduceResult,
	EMPTY_CHANGE_SET,
} from "./commands/apply.js";
export { reduceValidatedCommand } from "./commands/reduce.js";
export {
	validateAtomicCommand,
	validateEditorCommand,
} from "./commands/validate.js";
export {
	checkInvariant,
	EditorInvariantError,
	makeEditorError,
} from "./diagnostics.js";
export {
	EDITOR_BYTE_LIMIT_DEFAULTS,
	type ResolvedByteLimits,
	resolveByteLimits,
} from "./limits.js";
export {
	applyEditorPatch,
	deepEqualJson,
	stripPatchNulls,
} from "./patch.js";
export {
	type AuthoringReadResult,
	createEmptyAuthoringState,
	readAuthoringState,
	writeAuthoringState,
} from "./read-write.js";
export {
	collectLiveNodeIds,
	type DuplicateRemapResult,
	type ReconcileChangeSet,
	type ReconcileResult,
	reconcileAuthoringState,
	remapForDuplicate,
} from "./reconcile.js";
export { mergePropertyWise } from "./resolve/merge.js";
export {
	type NodeComponentDefaults,
	type ResolveContext,
	type ResolvedNodeAuthoring,
	resolveNodeAuthoring,
} from "./resolve/node.js";
export {
	getMatchingBreakpoints,
	resolveResponsiveValue,
} from "./resolve/responsive.js";
export {
	materializeTokenLiteral,
	type ResolveTokenOptions,
	resolveToken,
	type TokenResolution,
} from "./resolve/token.js";
export {
	serializeBorderEdge,
	serializeCssColor,
	serializeCssLength,
	serializeCssMath,
	serializeFilter,
	serializeGridTracks,
	serializePaint,
	serializeShadow,
	serializeTokenOrLiteral,
} from "./style/css-serializer.js";
export {
	type ResolvedAuthoringStyle,
	type ResolvedNodeStyleInput,
	resolveAuthoringStyle,
} from "./style/resolve-authoring-style.js";
export {
	applyTokenDeletion,
	planTokenDeletion,
	type TokenDeletionContext,
	type TokenDeletionPlan,
} from "./tokens/deletion.js";
export { checkTokenAliasGraph } from "./tokens/graph.js";
export { applyTokenPatch } from "./tokens/patch.js";
export {
	aliasDependents,
	collectTokenUsage,
	type TokenUsageIndex,
	tokenUsageSites,
} from "./tokens/usage.js";
export {
	isTokenRef,
	mapAuthoringTokens,
	type TokenReferenceFamily,
	type TokenRefVisitor,
	type TokenUsageSite,
} from "./tokens/walk.js";
