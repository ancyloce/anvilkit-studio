/**
 * @file Type-only re-export barrel for `@anvilkit/core/section`.
 *
 * The section-level AI contract types (Phase 6 / M9). This subpath is
 * intentionally *types only* — runtime helpers live in
 * `@anvilkit/schema/section` (derivation) and
 * `@anvilkit/validator/section` (validation).
 *
 * Adding this subpath is a Phase 6 *additive* extension to the public
 * Core surface. The shapes themselves are also re-exported from
 * `@anvilkit/core/types` so consumers that already pull from there do
 * not need a second import path.
 */

export type {
	AiSectionContext,
	AiSectionPatch,
	AiSectionSelection,
	ConfigToAiSectionContextOptions,
} from "../types/ai-section.js";
