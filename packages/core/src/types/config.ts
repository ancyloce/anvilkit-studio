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

import type { StudioConfigSchema } from "@/config/schema";

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
type InferredStudioConfig = z.infer<typeof StudioConfigSchema>;

/**
 * Module-augmentation slot for plugin-specific `experimental` config.
 *
 * Plugin types are deliberately **not** propagated into `<Studio>`
 * (core decouples its type version from every plugin's — see the
 * "Plugin config & type safety" section in the plugin-authoring
 * guide). The runtime still validates `config.experimental` via Zod
 * (`z.record(z.string(), z.unknown())`); this interface is the
 * *opt-in compile-time* counterpart. A plugin (or host app) adds
 * intellisense + checking for its own keys with declaration merging:
 *
 * ```ts
 * declare module "@anvilkit/core" {
 *   interface StudioExperimentalConfig {
 *     myPlugin?: { apiKey: string; debug?: boolean };
 *   }
 * }
 * ```
 *
 * It is intentionally empty by default and intersected (not replaced)
 * with the open `Record<string, unknown>`, so this stays purely
 * additive — no existing config breaks, and unaugmented keys keep
 * working untyped.
 */
// Intentionally empty — this is a declaration-merging slot, not a
// concrete shape. Plugins/hosts extend it via `declare module`.
export interface StudioExperimentalConfig {}

/**
 * Runtime configuration surface for `<Studio>`. Identical to the
 * Zod-inferred shape except `experimental` also carries any keys a
 * plugin/host declared on {@link StudioExperimentalConfig} — the
 * runtime/type single-source-of-truth is unchanged (the schema still
 * accepts any record); this only *adds* optional typed keys.
 */
export type StudioConfig = Omit<InferredStudioConfig, "experimental"> & {
  readonly experimental: InferredStudioConfig["experimental"] &
    Partial<StudioExperimentalConfig>;
};

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
