/**
 * @file `useT` — typed, formatter-aware message resolver (P0 §D.5).
 *
 * Wraps the raw {@link useMsg} 5-step resolver and applies a
 * {@link MessageFormatter} (brace interpolation by default) so callers get
 * `{token}` substitution plus autocomplete on known keys
 * ({@link AnvilkitMessageKey}). `useMsg` itself stays string-typed to
 * protect its existing call sites.
 */

import { useCallback } from "react";
import { useMsg } from "@/state/editor-i18n-context";
import { useOptionalLocale } from "@/state/slices/LocaleStoreProvider";
import { braceFormatter, type MessageFormatter } from "./format";
import type { AnvilkitMessageKey } from "./keys";

/**
 * Reactive, typed message resolver. `useT()(key, vars)` resolves `key`
 * against the active catalog for the active locale and interpolates
 * `{token}` variables. Re-renders on `setLocale` like `useMsg`.
 *
 * @param formatter - Override the default brace interpolation (e.g. an
 * ICU-backed formatter injected by the host). Defaults to
 * {@link braceFormatter}.
 */
export function useT(
	formatter: MessageFormatter = braceFormatter,
): (
	key: AnvilkitMessageKey,
	vars?: Readonly<Record<string, string | number>>,
) => string {
	const msg = useMsg();
	const locale = useOptionalLocale();
	return useCallback(
		(key, vars) => formatter(msg(key), vars ?? {}, locale),
		[msg, locale, formatter],
	);
}
