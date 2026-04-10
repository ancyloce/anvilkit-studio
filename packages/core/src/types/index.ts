// Barrel for `@anvilkit/core/types`.
//
// Populated incrementally by the M2 task chain:
// - core-005 → plugin contract
// - core-006 → export / ir / ai domain types (this file's current
//   content)
// - core-007 → `z.infer<typeof StudioConfigSchema>` (replaces
//   `./config.js`)

export type {
	AiComponentSchema,
	AiFieldSchema,
	AiFieldType,
	AiGenerationContext,
	AiValidationIssue,
	AiValidationResult,
} from "./ai.js";
export type { StudioConfig } from "./config.js";
export type {
	ExportFormatDefinition,
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
} from "./ir.js";
export type {
	StudioHeaderAction,
	StudioLogLevel,
	StudioPlugin,
	StudioPluginContext,
	StudioPluginLifecycleHooks,
	StudioPluginMeta,
	StudioPluginRegistration,
} from "./plugin.js";
