/**
 * @file Barrel for `@anvilkit/core/editor` — the **React-free,
 * Puck-runtime-free** editor engine (DD-0019 §22.2; PLAN-0020
 * CORE-P0-007/-008/-010/-018/-019).
 *
 * ### What lives here
 *
 * The pure commit helpers (`puck/update-*.ts`: validate → one
 * functional-updater `setData` per intent), the resolvers (responsive,
 * property-wise merge, tokens, node authoring), the single
 * style-materialization implementation (`resolveAuthoringStyle` +
 * allowlisted serializer), the compiled-appearance emitter
 * (`style-compiler/`), and the shared dev-invariant helper.
 *
 * `p3-009` deleted the parallel command IR and the `__anvilkit`
 * sidecar engine that used to live here. There is one document
 * (Puck `Data`), one write path (the commit helpers) and one CSS
 * emitter (`style-compiler/compile.ts`).
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
	listUsedDocumentFeatures,
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
	readEditorAnnotations,
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
	commitDesignSystemUpdateOver,
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
	interactionsWriteErrors,
	interactionWriteErrors,
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
export { checkTokenAliasGraph } from "./tokens/graph.js";
export { applyTokenPatch } from "./tokens/patch.js";
export { isTokenRef, type TokenReferenceFamily } from "./tokens/walk.js";
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
