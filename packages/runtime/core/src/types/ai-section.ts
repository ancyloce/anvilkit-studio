/**
 * @file Compatibility re-export shim — section-level AI editing
 * contract.
 *
 * Canonical ownership moved to `@anvilkit/contracts`
 * (`packages/foundation/contracts/src/ai-section.ts`); see the shim rationale in
 * `./ir.ts`. New code should import from `@anvilkit/contracts`
 * directly.
 */

export type {
	AiSectionContext,
	AiSectionPatch,
	AiSectionSelection,
	ConfigToAiSectionContextOptions,
} from "@anvilkit/contracts";
