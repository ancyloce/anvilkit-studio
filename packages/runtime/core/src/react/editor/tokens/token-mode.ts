"use client";

/**
 * @file The one place the editor decides which token mode it is
 * reading and writing (§15.1 modes).
 *
 * Three surfaces independently defaulted this and two of them
 * disagreed: the token picker and the design-system panel both wrote
 * new token values under `defaultTokenMode ?? "light"`, while the
 * canvas stylesheet resolved under `"default"`. A token authored
 * through the UI therefore had a value in `light` and was asked for in
 * `default`, resolved to `missing-value`, and the property silently
 * disappeared from the canvas.
 *
 * `defaultTokenMode` is host configuration, so it is the answer
 * whenever it is set; `"light"` is the fallback because that is what
 * the writing surfaces already shipped, and changing *those* would
 * strand every token already authored in a document.
 */

import type { StudioEditorConfig } from "@anvilkit/contracts/editor";

/** Mode used when the host configures none. */
export const FALLBACK_TOKEN_MODE = "light";

/**
 * The mode the editor reads and writes token values in.
 *
 * @param config the host's `StudioEditorConfig`, when the bridge has one
 */
export function activeTokenMode(
	config: StudioEditorConfig | null | undefined,
): string {
	return config?.defaultTokenMode ?? FALLBACK_TOKEN_MODE;
}
