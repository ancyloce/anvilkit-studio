/**
 * @file Compatibility re-export shim — AI generation contract.
 *
 * Canonical ownership of the AI DTO types moved to
 * `@anvilkit/contracts` (`packages/foundation/contracts/src/ai.ts`) so
 * `@anvilkit/schema` and `@anvilkit/validator` no longer need
 * `@anvilkit/core` for shared type ownership. Existing
 * `@anvilkit/core/types` consumers keep working through this shim;
 * new code should import from `@anvilkit/contracts` directly.
 */

export type {
	AiComponentSchema,
	AiFieldSchema,
	AiFieldType,
	AiGenerationContext,
	AiThemeHint,
	AiValidationIssue,
	AiValidationResult,
} from "@anvilkit/contracts";
