/**
 * @file Compatibility re-export shim — Page IR contract.
 *
 * Canonical ownership of the Page IR types moved to
 * `@anvilkit/contracts` (`packages/foundation/contracts/src/ir.ts`) so the
 * headless packages (`@anvilkit/ir`, `@anvilkit/schema`,
 * `@anvilkit/validator`) depend on the contract layer instead of
 * reaching into `@anvilkit/core`. Existing `@anvilkit/core/types`
 * consumers keep working through this shim; new code should import
 * from `@anvilkit/contracts` directly.
 */

export type {
	PageIR,
	PageIRAsset,
	PageIRMetadata,
	PageIRNode,
	PageIRNodeMeta,
} from "@anvilkit/contracts";
