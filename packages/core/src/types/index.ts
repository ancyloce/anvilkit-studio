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
export type { ComponentPackageManifest, StudioConfig } from "./config.js";
export type {
	ExportFormatDefinition,
	ExportOptions,
	ExportFormatRunContext,
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
	AssetResolution,
	IRAssetResolver,
	StudioHeaderAction,
	StudioLogLevel,
	StudioPlugin,
	StudioPluginContext,
	StudioPluginLifecycleHooks,
	StudioPluginMeta,
	StudioPluginRegistration,
} from "./plugin.js";
