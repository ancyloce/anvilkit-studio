/**
 * @file Barrel for `@anvilkit/contracts/editor` — the persistent,
 * type-only contract surface of the AnvilKit Core visual editor
 * (DD-0019; PLAN-0020 CORE-P0-003).
 *
 * ### What lives here
 *
 * The versioned authoring sidecar (`AuthoringStateV1` at
 * `PuckData.root.props.__anvilkit`), typed CSS value primitives,
 * layout/style/typography specs, responsive values, tokens and style
 * definitions, document-local components and variants, interactions,
 * safe bindings, the component capability contract
 * (`metadata.editor`), the complete frozen `EditorCommand` union with
 * its port, the stable error envelope, document limits, host
 * policies, content-free events, exporter capability declarations,
 * and the collaboration capability declaration.
 *
 * ### What deliberately does NOT live here
 *
 * Runtime logic: zod validation/compaction/migration is
 * `@anvilkit/schema/editor`; pure reducers/resolvers are
 * `@anvilkit/core/editor`; sidecar→IR projection is
 * `@anvilkit/ir/editor`; React and Puck integration is
 * `@anvilkit/core/react/editor`. The only runtime exports are two
 * frozen constants (`ANVILKIT_AUTHORING_KEY`, `EDITOR_COUNT_LIMITS`).
 *
 * ### Frozen decisions
 *
 * Command/transaction contracts:
 * `docs/architecture/editor-command-transaction-contract-freeze.md`
 * (CORE-P0-001). Collaboration capability:
 * `docs/architecture/editor-collab-capability-contract-freeze.md`
 * (CORE-P0-020). Adapter members of `StudioEditorConfig`
 * (`pageAdapter`, `dataSourceAdapter`) carry v1-frozen minimal
 * descriptor shapes; their runtime semantics land in Phase 3.
 */

export {
	ANVILKIT_AUTHORING_KEY,
	type AnvilKitRootProps,
	type AuthoringStateV1,
} from "./authoring-state.js";
export type {
	BindingId,
	BindingTarget,
	BindingV1,
	DataSchema,
	DataSourceDescriptor,
	EditorDataSourceAdapter,
	PreviewDataRequest,
	SafeCondition,
	SafeExpression,
} from "./bindings.js";
export type {
	EditorCapabilityMetadata,
	ImageTarget,
	InlineTextTarget,
	SlotCapability,
} from "./capability-metadata.js";
export type { StudioPluginCollabCapability } from "./collab.js";
export type {
	AtomicEditorCommand,
	AttachStyleDefinitionCommand,
	BatchEditorCommand,
	CreateComponentDefinitionCommand,
	CreateInteractionCommand,
	CreateStyleDefinitionCommand,
	CreateTokenCommand,
	DeleteComponentDefinitionCommand,
	DeleteInteractionCommand,
	DeleteStyleDefinitionCommand,
	DeleteTokenCommand,
	DetachAllComponentInstancesCommand,
	DetachComponentInstanceCommand,
	DetachStyleDefinitionCommand,
	EditorCommand,
	EditorCommandBase,
	EditorCommandPort,
	EditorCommandResult,
	EditorCommandSnapshot,
	EditorPreviewResult,
	EditorSelectionState,
	PromoteComponentOverrideCommand,
	RenameNodeCommand,
	ResetAllComponentOverridesCommand,
	ResetComponentOverrideCommand,
	SetBreakpointsCommand,
	SetComponentNodeOverrideCommand,
	SetComponentPropOverrideCommand,
	SetInstanceVariantCommand,
	SetNodeLayoutCommand,
	SetNodeLockCommand,
	SetNodeStyleCommand,
	SetNodeTypographyCommand,
	SetNodeVisibilityCommand,
	SetResponsiveOverrideCommand,
	UpdateBindingCommand,
	UpdateComponentDefinitionCommand,
	UpdateInteractionCommand,
	UpdateStyleDefinitionCommand,
	UpdateTokenCommand,
} from "./commands.js";
export type {
	ComponentDefinitionId,
	ComponentDefinitionV1,
	ComponentInstanceState,
	ComponentOverrideTarget,
	ComponentPropDefinition,
	ComponentVariant,
	NodeOverridePatch,
	SerializablePuckNode,
	VariantAxis,
	VariantAxisOption,
} from "./components.js";
export type { EditorError, EditorErrorCode } from "./errors.js";
export type { EditorDiagnosticPort, EditorEvent } from "./events.js";
export type {
	EditorExportCapabilities,
	EditorFeatureId,
	ExportValidationResult,
} from "./export-capabilities.js";
export type {
	AnimatableProperty,
	AnimationStep,
	InteractionAction,
	InteractionId,
	InteractionTrigger,
	InteractionV1,
	MotionTransition,
} from "./interactions.js";
export {
	EDITOR_COUNT_LIMITS,
	type EditorByteLimits,
	type EditorCountLimits,
} from "./limits.js";
export type {
	AccessibilityOverride,
	ImageAdjustment,
	InlineTextValue,
	NodeAuthoringStateV1,
	TiptapBlockNode,
	TiptapDocumentV1,
} from "./node-state.js";
export type {
	ComponentDefinitionDeletePolicy,
	EditorPolicies,
} from "./policies.js";
export type {
	BreakpointDefinition,
	BreakpointId,
	ResolvedValue,
	ResponsiveEditorState,
	ResponsiveFamily,
	ResponsiveLayerRef,
	ResponsiveValue,
} from "./responsive.js";
export type { LayoutSpec, TypographySpec, VisualStyleSpec } from "./specs.js";
export type {
	EditorPageAdapter,
	EditorPageDescriptor,
	EditorRenderScope,
	StudioEditorConfig,
	StudioEditorFeatures,
} from "./studio-config.js";
export type {
	StyleDefinitionDeletionDisposition,
	StyleDefinitionId,
	StyleDefinitionV1,
} from "./style-definitions.js";
export type {
	DesignToken,
	DesignTokenSource,
	ImportableTokenValue,
	TokenDeletionDisposition,
	TokenMode,
	TokenModeId,
	TokenType,
	TokenValue,
} from "./tokens.js";
export type {
	BorderEdge,
	BorderSpec,
	CssAlignment,
	CssBlendMode,
	CssBoxEdges,
	CssColor,
	CssCorners,
	CssCursor,
	CssJustification,
	CssLength,
	CssMathExpression,
	CssUnit,
	CubicBezier,
	EditorPatch,
	FilterSpec,
	GradientStop,
	GridTrack,
	GridTrackList,
	JsonValue,
	Paint,
	PropertyPath,
	ShadowSpec,
	SizeValue,
	TokenOrLiteral,
} from "./values.js";
