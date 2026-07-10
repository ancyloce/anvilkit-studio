/**
 * @file Compatibility re-export shim — `<Studio>` Pages source
 * contract.
 *
 * Canonical ownership moved to `@anvilkit/contracts`
 * (`packages/foundation/contracts/src/page.ts`); see the shim rationale in
 * `./ir.ts`. The host-adapter contract is shared with plugins
 * (e.g. `@anvilkit/plugin-page-seo`) and platform-facing pages
 * adapters, which is what qualifies it for the contract layer. New
 * code should import from `@anvilkit/contracts` directly.
 */

export type {
	StudioPage,
	StudioPageCreateInput,
	StudioPageRenameInput,
	StudioPageReorderInput,
	StudioPageSeo,
	StudioPageSettingsInput,
	StudioPagesSource,
} from "@anvilkit/contracts";
