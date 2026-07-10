/**
 * @file Barrel for `@anvilkit/contracts` — the shared, type-only
 * contract layer of the AnvilKit workspace.
 *
 * ### What lives here
 *
 * The serializable data contracts passed **between** packages: the
 * Page IR (`ir.ts`), the AI generation + validation DTOs (`ai.ts`,
 * `ai-section.ts`), the export format contract (`export.ts`), the
 * pages-source host contract (`page.ts`), and asset resolution
 * (`assets.ts`).
 *
 * ### What deliberately does NOT live here
 *
 * Runtime logic of any kind. Transforms (`puckDataToIR`,
 * `configToAiContext`, …), Zod validators, migrations, React hooks,
 * Puck overrides, and the Studio plugin registration surface stay in
 * their owning packages. This package must remain runtime-free: it
 * has no `dependencies`, its only peer is a **type-only** import from
 * `@puckeditor/core`, and every module compiles to an empty runtime
 * output under `verbatimModuleSyntax`.
 *
 * ### Dependency direction
 *
 * ```
 * @anvilkit/contracts
 *       ↓
 * @anvilkit/ir · @anvilkit/schema · @anvilkit/validator
 *       ↓
 * @anvilkit/core
 *       ↓
 * plugins / apps
 * ```
 *
 * `@anvilkit/core/types` re-exports everything below as a
 * compatibility shim, so existing consumers keep working; new code
 * should import from `@anvilkit/contracts` directly.
 */

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
export type { AssetResolution, IRAssetResolver } from "./assets.js";
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
	StudioPageRenameInput,
	StudioPageReorderInput,
	StudioPageSeo,
	StudioPageSettingsInput,
	StudioPagesSource,
} from "./page.js";
