"use client";

/**
 * @file `useCompiledAppearance` — the composition editor's live style
 * feed (PLAN-0025 §8.4/§7.5, P2-06). Subscribes to Puck Data through
 * `createUsePuck` selectors and runs the ONE unified compiler over it;
 * the legacy live stylesheet resolver
 * (`react/editor/responsive/stylesheet.ts`) is not imported anywhere
 * on this path — same Config, same Data, same compiler as preview,
 * production, and export (§1 condition 3).
 *
 * Asynchronous-commit fallback (the P2-00 decision, §8.3): the
 * document is read through `useDeferredValue`, so at 500+ nodes —
 * where dispatch + compile exceed a frame — typing and dragging stay
 * responsive while the canvas stylesheet lags at most one deferred
 * render behind. Never a second resolver.
 *
 * One §7.5 fragment cache per hook instance; the cache is
 * output-transparent (P1-07), so a cache bug can change performance
 * but never CSS.
 */

import { useDeferredValue, useMemo, useRef } from "react";
import type { AppearanceCompilerCache } from "../../../style-compiler/cache.js";
import { createAppearanceCompilerCache } from "../../../style-compiler/cache.js";
import type { CompiledAppearance } from "../../../style-compiler/compile.js";
import { compileDocumentAppearance } from "../../../style-compiler/compile.js";
import { useReactivePuck } from "../../utils/use-reactive-puck.js";

export interface UseCompiledAppearanceOptions {
	/** Active token mode; defaults to the design system's default. */
	readonly tokenMode?: string;
}

/** Compile the live document; re-renders once per (deferred) change. */
export function useCompiledAppearance(
	options?: UseCompiledAppearanceOptions,
): CompiledAppearance {
	const data = useReactivePuck((state) => state.appState.data);
	const config = useReactivePuck((state) => state.config);
	const deferredData = useDeferredValue(data);
	const cacheRef = useRef<AppearanceCompilerCache | null>(null);
	cacheRef.current ??= createAppearanceCompilerCache();
	const tokenMode = options?.tokenMode;
	return useMemo(
		() =>
			compileDocumentAppearance({
				data: deferredData,
				config,
				tokenMode,
				cache: cacheRef.current ?? undefined,
			}),
		[deferredData, config, tokenMode],
	);
}
