/**
 * @file Type-safe i18n message keys (P0 frozen contracts §D).
 *
 * `keyof` for core (exact, zero-codegen) + module augmentation for plugin
 * namespaces. Re-exported from `@anvilkit/core/i18n`.
 */

import type { DEFAULT_MESSAGES } from "@/state/editor-i18n-context";

/**
 * Exact union of the core chrome message keys (`studio.*` plus the
 * transitional `assetManager.*`). Derived from `DEFAULT_MESSAGES` via
 * `keyof typeof`, so it updates automatically when keys change — provided
 * `DEFAULT_MESSAGES` keeps its `satisfies` (not `: Record`) typing.
 */
export type StudioMessageKey = keyof typeof DEFAULT_MESSAGES;

/**
 * Augmentable registry of message keys. Core seeds {@link StudioMessageKey};
 * each plugin merges its namespace keys via declaration merging so `useT`
 * autocompletes them:
 *
 * ```ts
 * declare module "@anvilkit/core/i18n" {
 *   interface AnvilkitMessages {
 *     "versionHistory.action.save": string;
 *   }
 * }
 * ```
 */
export interface AnvilkitMessages {}

/**
 * Every known message key plus a `(string & {})` escape hatch so callers
 * that have not augmented {@link AnvilkitMessages} still compile (no hard
 * break — `useMsg` stays permissive; only `useT` opts into the typed keys).
 */
export type AnvilkitMessageKey =
	| StudioMessageKey
	| keyof AnvilkitMessages
	| (string & {});
