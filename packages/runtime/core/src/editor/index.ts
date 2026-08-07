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

// §5.1 authoring-carrier types, re-exported so v2-protocol consumers
// (studio demo config, Phase 3.5 plugins) need no direct contracts dep.
export type {
	AnvilAppearance,
	AnvilNodeFeatureProps,
	AuthorableProps,
	Binding,
	Interaction,
	TargetAppearance,
} from "@anvilkit/contracts/editor";
// Shared used-features projection (CORE-P1A-003): re-exported from
// the engine so React-layer consumers reach it without importing
// `@anvilkit/ir` directly — `src/editor/` is the one directory the
// `check:no-headless-import` gate allowlists for ir imports.
export {
	type EditorFeatureScanDocument,
	listUsedAuthoringFeatures,
	listUsedDocumentFeatures,
	listUsedEditorFeatures,
} from "@anvilkit/ir/editor";
export {
	legacyNodeToAppearance,
	type MigrateToPuckNativeV2Options,
	type MigrationDiagnostic,
	type MigrationResult,
	migrateToPuckNativeV2,
	normalizeCssForParity,
} from "../migrations/index.js";
export {
	AUTHORABLE_PROPERTY_LOCATIONS,
	type AuthorablePropertyLocation,
	authorablePropertyForSpecKey,
	type ResolvedStyleTarget,
	readEditorMetadataFor,
	resolveStyleTargets,
} from "../puck/component-metadata.js";
export {
	type AppearanceNode,
	type AppearanceReadState,
	collectAppearanceNodes,
	documentBreakpoints,
	readAppearanceProperty,
	readTargetHidden,
	readTargetStyleRefs,
	type TargetReadInput,
} from "../puck/read-appearance.js";
export {
	BINDING_SCOPE_METADATA_KEY,
	type ProductionBindingScope,
	withBindingResolution,
} from "../puck/resolve-bindings.js";
export { anvilRootAttrs, anvilTargetAttrs } from "../puck/targets.js";
export {
	type AppearanceCommitDeps,
	type AppearanceCommitResult,
	type AppearancePatch,
	commitAppearanceUpdate,
	type UpdateAppearanceInput,
	type UpdateAppearanceResult,
	updateAppearanceInData,
} from "../puck/update-appearance.js";
export {
	type AnnotationCommitDeps,
	type AnnotationCommitResult,
	type AnnotationEdit,
	commitAnnotationUpdate,
	isNodeLocked,
	type UpdateAnnotationsInput,
	type UpdateAnnotationsResult,
	updateAnnotationsInData,
} from "../puck/update-annotations.js";
export {
	commitDeleteNodes,
	commitDuplicateNodes,
	commitInsertNode,
	commitReorderNode,
	deleteNodesInData,
	duplicateNodesInData,
	type InsertNodeInput,
	insertNodeInData,
	normalizeZone,
	type ReorderNodeInput,
	reorderNodeInData,
	ROOT_ZONE,
	type TreeCommitDeps,
	type TreeCommitResult,
	type UpdateTreeResult,
} from "../puck/update-tree.js";
export {
	type CarrierCommitDeps,
	type CarrierCommitResult,
	commitBindingsUpdate,
	commitInlineTextUpdate,
	commitInteractionsUpdate,
	type NodeCarrier,
	type UpdateCarrierInput,
	type UpdateCarrierResult,
	type UpdateInlineTextInput,
	updateBindingsInData,
	updateInlineTextInData,
	updateInteractionsInData,
} from "../puck/update-carriers.js";
export {
	commitDetachInstance,
	commitInstanceOverride,
	type DetachInstanceInput,
	type DetachInstanceResult,
	detachInstanceInData,
	type InstanceCommitDeps,
	type InstanceCommitResult,
	type InstanceOverrideEdit,
	type UpdateInstanceOverridesInput,
	type UpdateInstanceOverridesResult,
	updateInstanceOverridesInData,
} from "../puck/update-instance-overrides.js";
export {
	commitInstanceSelection,
	commitVariantModelUpdate,
	MAX_EXPRESSIBLE_COMBINATIONS,
	type UpdateInstanceSelectionInput,
	type UpdateVariantModelInput,
	type UpdateVariantResult,
	updateInstanceSelectionInData,
	updateVariantModelInData,
	type VariantCommitDeps,
	type VariantCommitResult,
	type VariantModelEdit,
} from "../puck/update-variants.js";
export {
	commitComponentLibraryUpdate,
	type ComponentLibraryCommitDeps,
	type ComponentLibraryCommitResult,
	type ComponentLibraryEdit,
	countDefinitionInstances,
	type DefinitionInstanceUsage,
	type UpdateComponentLibraryInput,
	type UpdateComponentLibraryResult,
	updateComponentLibraryInData,
} from "../puck/update-component-library.js";
export {
	commitDesignSystemUpdate,
	type DesignSystemCommitDeps,
	type DesignSystemCommitResult,
	type UpdateDesignSystemInput,
	type UpdateDesignSystemResult,
	updateDesignSystemInData,
} from "../puck/update-design-system.js";
export {
	type AppearanceCompilerCache,
	type CompileAppearanceInput,
	type CompiledAppearance,
	type CompiledTargetFragment,
	compileDocumentAppearance,
	createAppearanceCompilerCache,
	fingerprintOf,
} from "../style-compiler/index.js";
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
export {
	type BindingScope,
	evaluateCondition,
	evaluateExpression,
	type SafeEvaluation,
	type SafeEvaluationRejection,
} from "./bindings/evaluate.js";
export {
	type FetchPreviewDataOptions,
	fetchPreviewData,
	measureJsonBytes,
	PREVIEW_DATA_LIMITS,
	type PreviewDataFailure,
	type PreviewDataResult,
	truncateRecords,
} from "./bindings/preview-data.js";
export {
	buildRepeatContexts,
	ITEM_KEY_FIELDS,
	isVisibleInDesign,
	isVisibleInPreview,
	itemKeyOf,
	type RepeatContext,
	type RepeatExpansion,
	repeatExportBlockers,
	resolveVisibility,
	type VisibilityResolution,
} from "./bindings/repeat.js";
export { bindingUpdateErrors } from "./bindings/validate.js";

export {
	type AuthoringChangeSet,
	applyEditorCommand,
	diffAuthoringState,
	type EditorReduceResult,
	EMPTY_CHANGE_SET,
} from "./commands/apply.js";
export { reduceValidatedCommand } from "./commands/reduce.js";
export {
	type ValidateCommandOptions,
	validateAtomicCommand,
	validateEditorCommand,
} from "./commands/validate.js";
export {
	type ComponentEditSink,
	componentDocument,
	foldComponentDocument,
	variantCombinations,
} from "./components/component-document.js";
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
	buildInsertInstancePlan,
	type InsertInstanceInput,
	type InsertInstancePlan,
} from "./components/insert.js";
export {
	collectDefinitionNodeIds,
	collectOrphanOverrides,
	type OrphanOverride,
	orphanOverrideDiagnostics,
	setNodeOverride,
	setPropOverride,
} from "./components/instances.js";
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
	promoteComponentOverride,
	resetAllComponentOverrides,
	resetComponentOverride,
} from "./components/overrides.js";
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
	checkInvariant,
	EditorInvariantError,
	makeEditorError,
} from "./diagnostics.js";
export {
	type ExportPreflightInput,
	type ExportPreflightResult,
	type ExportValidationEvent,
	type PreflightA11yIssue,
	runExportPreflight,
} from "./export-preflight.js";
export {
	type ComponentCapabilityReport,
	EDITOR_ADOPTION_LEVEL_NAMES,
	type EditorAdoptionLevel,
	type EditorCapabilityInspection,
	formatEditorCapabilityReport,
	inspectEditorCapabilities,
} from "./inspect-capabilities.js";
export {
	buildInteractionSchedules,
	buildMotionSchedule,
	type MotionSchedule,
	type MotionScheduleEntry,
	REDUCED_MOTION_MAX_DURATION_MS,
	transitionSpanMs,
} from "./interactions/motion.js";
export {
	createPreviewSession,
	type EditorRunMode,
	interactionsEnabled,
	type PreviewDisposer,
	type PreviewSession,
	type PreviewVariantOverride,
} from "./interactions/preview-runtime.js";
export {
	type InteractionReference,
	interactionReferences,
	type ResolvedInteraction,
	resolveInteraction,
	resolveInteractions,
} from "./interactions/resolve.js";
export {
	buildInteractionTimeline,
	type InteractionTimeline,
	reorderActions,
	type TimelineRow,
	type TimelineSegment,
	type TimelineTrack,
} from "./interactions/timeline.js";
export {
	interactionCreateErrors,
	interactionDeleteErrors,
	interactionUpdateErrors,
	urlScheme,
} from "./interactions/validate.js";
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
	type ResolveDesignSystem,
	type ResolvedNodeAuthoring,
	resolveTargetAppearance,
	substituteTokens,
	type TokenSubstitutionContext,
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
	buildExportAuthoring,
	type ExportAuthoring,
} from "./style/export-authoring.js";
export {
	buildExportStylesheet,
	type ExportInstanceAuthoring,
	type ExportStylesheetInput,
	type ExportStylesheetResult,
} from "./style/export-stylesheet.js";
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
