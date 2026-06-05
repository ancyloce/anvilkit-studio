/**
 * @file Message formatter seam (P0 frozen contracts §B.5).
 *
 * The default {@link braceFormatter} is zero-dependency `{token}`
 * interpolation. A host that needs ICU plurals/gender may inject its own
 * {@link MessageFormatter} (e.g. backed by `@formatjs/intl-messageformat`)
 * via `studioConfig.i18n` — those bytes land in the host bundle, never in
 * `@anvilkit/core`'s measured surface. React-free.
 */

import type { Locale } from "./registry";

/**
 * Formats a resolved message with `{token}` variables for a locale.
 *
 * The default leaves **unknown tokens literal** (no throw), matching the
 * existing manual `msg(...).replace("{minutes}", …)` style so migrating
 * those call sites to `useT` is behavior-preserving. `useMsg` does NOT
 * format — it stays a raw-string resolver for the legacy call sites.
 */
export type MessageFormatter = (
	message: string,
	vars: Readonly<Record<string, string | number>>,
	locale: Locale,
) => string;

/** Default zero-dependency `{token}` interpolation; unknown tokens stay literal. */
export const braceFormatter: MessageFormatter = (message, vars) =>
	message.replace(/\{(\w+)\}/g, (_match, key: string) => {
		const value = (vars as Record<string, string | number>)[key];
		return value === undefined ? `{${key}}` : String(value);
	});
