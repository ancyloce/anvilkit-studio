/**
 * @file Compatibility re-export shim — asset resolution contract.
 *
 * Canonical ownership moved to `@anvilkit/contracts`
 * (`packages/foundation/contracts/src/assets.ts`); see the shim rationale in
 * `./ir.ts`. New code should import from `@anvilkit/contracts`
 * directly.
 */

export type { AssetResolution, IRAssetResolver } from "@anvilkit/contracts";
