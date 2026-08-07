// Barrel for `@anvilkit/core/types`.
//
// Populated incrementally by the M2 task chain:
// - core-005 → plugin contract
// - core-006 → export / ir / ai domain types
// - core-007 → `z.infer<typeof StudioConfigSchema>` +
//   `ComponentPackageManifest` (this file's current content)

export type {
	AiComponentSchema,
	AiFieldSchema,
	AiFieldType,
	AiGenerationContext,
	AiThemeHint,
	AiValidationIssue,
	AiValidationResult,
} from "./ai.js";
export type {
	AiSectionContext,
	AiSectionPatch,
	AiSectionSelection,
	ConfigToAiSectionContextOptions,
} from "./ai-section.js";
export type {
	ComponentPackageManifest,
	StudioConfig,
	StudioExperimentalConfig,
} from "./config.js";
export type {
	EditorCapabilityRegistry,
	EditorSelectionReader,
	StudioPluginEditorApi,
} from "./editor-api.js";
export type {
	DataSchema,
	DataSourceDescriptor,
	EditorDataSourceAdapter,
	EditorPageAdapter,
	EditorPageDescriptor,
	EditorPolicies,
	EditorRenderScope,
	EditorStyleAdapter,
	JsonValue,
	PreviewDataRequest,
	StudioEditorConfig,
} from "./editor-config.js";
export type {
	CompiledAppearanceArtifact,
	EditorExportCapabilities,
	ExportFormatDefinition,
	ExportFormatRunContext,
	ExportOptions,
	ExportResult,
	ExportWarning,
	ExportWarningLevel,
} from "./export.js";
export type {
	PageIR,
	PageIRAsset,
	PageIRMetadata,
	PageIRNode,
	PageIRNodeMeta,
} from "./ir.js";
export type {
	StudioPage,
	StudioPageCreateInput,
	StudioPageRenameInput,
	StudioPageReorderInput,
	StudioPageSeo,
	StudioPageSettingsInput,
	StudioPagesSource,
} from "./pages.js";
export type {
	AssetResolution,
	InferPluginContributions,
	IRAssetResolver,
	StaticHeaderActionPlaceholder,
	StudioAnyPlugin,
	StudioHeaderAction,
	StudioLogLevel,
	StudioOverlayPlacement,
	StudioPlugin,
	StudioPluginCapabilities,
	StudioPluginCollabCapability,
	StudioPluginContext,
	StudioPluginContributing,
	StudioPluginLifecycleHooks,
	StudioPluginMeta,
	StudioPluginOverlay,
	StudioPluginPrefetch,
	StudioPluginProvider,
	StudioPluginRegistration,
	StudioPluginRuntimeCapabilities,
	StudioPluginSlotContribution,
	StudioPluginSurfaceCapabilities,
	StudioSlotId,
} from "./plugin.js";
export { defineStudioPlugin } from "./plugin.js";
export type {
	StudioAsset,
	StudioAssetAction,
	StudioAssetFolder,
	StudioAssetKind,
	StudioAssetListPage,
	StudioAssetListQuery,
	StudioAssetSort,
	StudioAssetSource,
	StudioAssetSourceStatus,
	StudioAssetTheme,
	StudioAssetUploadEvent,
	StudioAssetUploadListener,
	StudioCopilotPanel,
	StudioCopySnippet,
	StudioCopySnippetCategory,
	StudioCopySnippetPack,
	StudioDesignSystemPanel,
	StudioHistoryPanel,
	StudioInsertSection,
	StudioInsertSectionPredicate,
	StudioLayerQuickAdd,
	StudioLayerQuickAddInserter,
	StudioPageSettingsSeoFields,
	StudioPageSettingsSeoFieldsProps,
	StudioSeoPanel,
	StudioSidebarUnregister,
} from "./sidebar.js";
export type {
	EditorApi,
	EditorCommitApi,
	EditorCommitOutcome,
	EditorIntent,
	EditorIntentOutcome,
} from "./editor-api-v2.js";
