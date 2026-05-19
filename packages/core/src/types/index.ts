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
	StudioPagesSource,
} from "./pages.js";
export type {
	AssetResolution,
	InferPluginContributions,
	IRAssetResolver,
	StudioAnyPlugin,
	StudioHeaderAction,
	StudioLogLevel,
	StudioOverlayPlacement,
	StudioPlugin,
	StudioPluginContributing,
	StudioPluginContext,
	StudioPluginLifecycleHooks,
	StudioPluginMeta,
	StudioPluginOverlay,
	StudioPluginProvider,
	StudioPluginRegistration,
	StudioPluginSlotContribution,
	StudioSlotId,
} from "./plugin.js";
export type {
	StudioAsset,
	StudioAssetAction,
	StudioAssetKind,
	StudioAssetListPage,
	StudioAssetListQuery,
	StudioAssetSource,
	StudioAssetUploadEvent,
	StudioAssetUploadListener,
	StudioCopilotPanel,
	StudioCopySnippet,
	StudioCopySnippetCategory,
	StudioCopySnippetPack,
	StudioHistoryPanel,
	StudioInsertSection,
	StudioInsertSectionPredicate,
	StudioLayerQuickAdd,
	StudioLayerQuickAddInserter,
	StudioSidebarUnregister,
} from "./sidebar.js";
