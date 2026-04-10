/**
 * @file Public configuration types for `@anvilkit/core`.
 *
 * {@link StudioConfig} is the inferred output type of the Zod
 * schema at `src/config/schema.ts`. This re-export pattern is
 * intentional: the schema is the single source of truth, and the
 * type cannot drift from the runtime validator.
 *
 * {@link ComponentPackageManifest} is a static type (no Zod
 * counterpart) used by plugin discovery — it mirrors the metadata
 * shape every `@anvilkit/<slug>` component package exports from
 * its own `config.ts`.
 *
 * ### Type-only import
 *
 * `StudioConfigSchema` is imported via `import type` so `config.ts`
 * has no runtime dependency on the schema file. The real runtime
 * use sites (`create-config.ts` in `core-011`, tests in
 * `__tests__/schema.test.ts`) import it as a value directly.
 *
 * @see {@link https://github.com/anvilkit/studio/blob/main/docs/tasks/core-007-config-schema.md | core-007}
 */

import type { z } from "zod";

import type { StudioConfigSchema } from "../config/schema.js";

/**
 * Runtime configuration surface for `<Studio>`.
 *
 * Inferred directly from {@link StudioConfigSchema} via
 * `z.infer` — every field here has a runtime validator that matches
 * it exactly. Consumers receive this shape from
 * `createStudioConfig()` (`core-011`) and pass it through
 * `StudioConfigProvider` (`core-012`) to the plugin context.
 *
 * Plugin authors must treat this as deeply read-only — mutating
 * it has no effect on the runtime and may throw in strict mode.
 *
 * @see {@link StudioConfigSchema} for the authoritative shape.
 */
export type StudioConfig = z.infer<typeof StudioConfigSchema>;

/**
 * Runtime-discoverable metadata for an `@anvilkit/<slug>` component
 * package.
 *
 * Mirrors the metadata shape every component package exports from
 * its own `config.ts` (`componentName`, `componentSlug`,
 * `packageName`, `packageVersion`, `scaffoldType`, `schemaVersion`).
 * The host app's plugin discovery layer projects the on-disk
 * manifest into this shape so the Studio runtime can enumerate
 * installed components without importing their full Puck configs.
 */
export interface ComponentPackageManifest {
	/**
	 * Fully-qualified package name on npm (e.g.
	 * `"@anvilkit/button"`).
	 */
	readonly name: string;
	/**
	 * The package's own semver version (e.g. `"1.2.3"`).
	 */
	readonly version: string;
	/**
	 * Short, URL-safe slug for the component (e.g. `"button"`,
	 * `"bento-grid"`). Matches the directory name under
	 * `packages/components/src/`.
	 */
	readonly slug: string;
	/**
	 * Human-readable display name surfaced in the editor's
	 * component palette (e.g. `"Button"`, `"Bento Grid"`).
	 */
	readonly displayName: string;
	/**
	 * The scaffold template this component was produced from.
	 *
	 * - `"content"` — author-facing text/media components.
	 * - `"layout"` — structural containers, grids, stacks.
	 * - `"form"` — inputs, buttons, form wrappers.
	 *
	 * Closed union — extending it requires updating the scaffold
	 * CLI in `packages/components/`.
	 */
	readonly scaffoldType: "content" | "layout" | "form";
	/**
	 * The version of the component package schema this manifest
	 * was produced against. Used by future migration shims when
	 * the manifest shape itself evolves.
	 */
	readonly schemaVersion: string;
	/**
	 * Path or package specifier the host app uses to import the
	 * component's Puck config (e.g. `"@anvilkit/button"`,
	 * `"./components/hero"`).
	 */
	readonly entry: string;
}
