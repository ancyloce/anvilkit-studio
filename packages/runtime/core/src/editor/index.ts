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
export {
	type ExportPreflightInput,
	type ExportPreflightResult,
	type PreflightA11yIssue,
	runExportPreflight,
} from "./export-preflight.js";
export {
	AI_PROPOSAL_LIMITS,
	assessProposal,
	commandNodeIds,
	type EditorCommandProposal,
	type ProposalAssessment,
	type ProposalRejection,
	proposalAffectedNodeIds,
	sanitizeProposalForDisplay,
} from "./ai/proposal.js";
export { bindingUpdateErrors } from "./bindings/validate.js";
export {
	buildRepeatContexts,
	isVisibleInDesign,
	isVisibleInPreview,
	ITEM_KEY_FIELDS,
	itemKeyOf,
	repeatExportBlockers,
	type RepeatContext,
	type RepeatExpansion,
	resolveVisibility,
	type VisibilityResolution,
} from "./bindings/repeat.js";
export {
	fetchPreviewData,
	type FetchPreviewDataOptions,
	measureJsonBytes,
	PREVIEW_DATA_LIMITS,
	type PreviewDataFailure,
	type PreviewDataResult,
	truncateRecords,
} from "./bindings/preview-data.js";
export {
	type BindingScope,
	evaluateCondition,
	evaluateExpression,
	type SafeEvaluation,
	type SafeEvaluationRejection,
} from "./bindings/evaluate.js";
export { reduceValidatedCommand } from "./commands/reduce.js";
export {
	buildInteractionTimeline,
	type InteractionTimeline,
	reorderActions,
	type TimelineRow,
	type TimelineSegment,
	type TimelineTrack,
} from "./interactions/timeline.js";
export {
	createPreviewSession,
	type EditorRunMode,
	interactionsEnabled,
	type PreviewDisposer,
	type PreviewSession,
	type PreviewVariantOverride,
} from "./interactions/preview-runtime.js";
export {
	buildInteractionSchedules,
	buildMotionSchedule,
	type MotionSchedule,
	type MotionScheduleEntry,
	REDUCED_MOTION_MAX_DURATION_MS,
	transitionSpanMs,
} from "./interactions/motion.js";
export { interactionCreateErrors, urlScheme } from "./interactions/validate.js";
export {
	interactionReferences,
	type InteractionReference,
	resolveInteraction,
	resolveInteractions,
	type ResolvedInteraction,
} from "./interactions/resolve.js";
export {
	type ValidateCommandOptions,
	validateAtomicCommand,
	validateEditorCommand,
} from "./commands/validate.js";
export {
	buildCreateComponentPlan,
	COMPONENT_FRAME_TYPE,
	type CreateComponentInput,
	type CreateComponentPlan,
	validateCreateComponentSelection,
} from "./components/create.js";
export {
	buildDetachPlan,
	type DetachFailure,
	type DetachPlan,
	isDetachFailure,
} from "./components/detach.js";
export {
	collectDefinitionNodeIds,
	collectOrphanOverrides,
	type OrphanOverride,
	orphanOverrideDiagnostics,
	setNodeOverride,
	setPropOverride,
} from "./components/instances.js";
export {
	type ComponentEditSink,
	componentDocument,
	foldComponentDocument,
	variantCombinations,
} from "./components/component-document.js";
export { applyComponentDefinitionPatch } from "./components/patch.js";
export {
	type DroppedOverride,
	droppedOverrideDiagnostics,
	switchInstanceVariant,
	type VariantSwitchResult,
} from "./components/variant-switch.js";
export {
	matchVariant,
	validateVariantModel,
	variantCombinationCount,
	variantCombinationKey,
} from "./components/variants.js";
export {
	promoteComponentOverride,
	resetAllComponentOverrides,
	resetComponentOverride,
} from "./components/overrides.js";
export {
	collectUnresolvedInstances,
	countLiveInstances,
	type DefinitionUsage,
	deleteDefinition,
	type UnresolvedInstance,
	unresolvedInstanceDiagnostics,
	validateDefinitionDelete,
} from "./components/lifecycle.js";
export {
	COMPONENT_INSTANCE_PROP,
	formatComponentPath,
	type MaterializeResult,
	materializeInstance,
	runtimeNodeId,
} from "./components/materialize.js";
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
	stableIdHash,
	styleDefinitionCssVariableName,
	tokenCssVariableName,
} from "./styles/css-variables.js";
export { applyStyleDefinitionPatch } from "./styles/patch.js";
export {
	attachStyleDefinition,
	deleteStyleDefinition,
	detachStyleDefinition,
} from "./styles/style-definitions.js";
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
export {
	cloneSubtree,
	collectSubtreeIds,
	findNode,
	indexNodeLocations,
	isComponentNode,
	type NodeLocation,
	nodeId,
	type PuckTreeNode,
	type PuckZones,
	transformContainers,
	zonesOf,
} from "./tree/nodes.js";
