/**
 * @file Re-export shim for the variant model algebra.
 *
 * The implementations moved to `src/document-model/materialize.ts` in
 * `p3-002` — they are pure functions of a `ComponentDefinition` and
 * never read the sidecar, so keeping them here would have deleted them
 * with this directory at `p3-009`. This file carries no logic.
 */

export {
	matchVariant,
	validateVariantModel,
	variantCombinationCount,
	variantCombinationKey,
} from "../../document-model/materialize.js";
