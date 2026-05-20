/**
 * @file Public type surface for the override preset (PRD §3.5).
 *
 * Phase 5's `<Studio>` consumes `StudioChromeMode` for the `chrome`
 * prop. `DefaultOverrideSlot` enumerates the slots the preset
 * actually populates so consumers can write switch statements that
 * fail to compile when the preset gains a slot.
 */

import type { Overrides as PuckOverrides } from "@puckeditor/core";

/**
 * Chrome modes accepted by `<Studio chrome>`. `"anvilkit"` mounts
 * the default preset; `"puck"` is a single-prop opt-out that ships
 * the raw Puck UI.
 */
export type StudioChromeMode = "anvilkit" | "puck";

/**
 * Options passed to {@link createStudioOverrides}.
 *
 * v1 has no fields — the call returns the default preset. The shape
 * is locked in as an object so future opts (icon-set swap, custom
 * field-type registry, etc.) extend without a breaking signature
 * change.
 */
export interface CreateStudioOverridesOptions {
  /**
   * Optional partial field-type registry merged on top of the
   * defaults. A consumer that wants to swap one renderer can pass
   * `{ fieldTypes: { number: MyNumberField } }` instead of
   * cloning the entire registry.
   */
  readonly fieldTypes?: Partial<NonNullable<PuckOverrides["fieldTypes"]>>;
}

/**
 * The set of override slots the default preset populates. `puck`,
 * `drawer`, `drawerItem`, `fields`, `fieldLabel`, `iframe`,
 * `componentOverlay`, `actionBar`, `preview`, plus `fieldTypes` for
 * the field-type registry.
 *
 * Slots intentionally NOT covered by the default preset:
 * - `header` / `headerActions` — Phase 2's `<StudioHeader>` lives
 *   inside `StudioLayout` (mounted via `puck`), so the dedicated
 *   slots are left to consumers.
 * - `outline` — replacing it would recurse with `<Puck.Outline />`
 *   inside the sidebar; instead, the chrome wraps Puck's default.
 * - `components` / `componentItem` — Puck's default render is
 *   sufficient; the chrome styles around it via `drawer` and
 *   `drawerItem`.
 */
export type DefaultOverrideSlot =
  | "puck"
  | "drawer"
  | "drawerItem"
  | "fields"
  | "fieldLabel"
  | "iframe"
  | "componentOverlay"
  | "actionBar"
  | "preview"
  | "fieldTypes";
