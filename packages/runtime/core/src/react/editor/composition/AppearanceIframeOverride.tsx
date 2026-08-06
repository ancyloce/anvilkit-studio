"use client";

/**
 * @file `AppearanceIframeOverride` — the ready-made canvas style feed
 * for composition hosts (P2-06): live compile
 * (`useCompiledAppearance`) piped into the encapsulated
 * `PuckIframeAppearanceBridge`.
 *
 * Two wirings, ONE component, one compiler, one style element:
 *
 * - **Iframe canvas** (the editor's production mode): pass it as the
 *   iframe override —
 *   `overrides={{ iframe: ({ children }) => (<AppearanceIframeOverride nonce={n}>{children}</AppearanceIframeOverride>) }}`
 *   — the style element then lands inside the frame document.
 *   Verified against the 0.22.4 source: the override renders ONLY in
 *   the enabled-iframe `AutoFrame` branch (`autoFrameContext`
 *   consumer), so this wiring is inert when `iframe.enabled` is
 *   false, and AutoFrame never reaches ready under jsdom — its
 *   runtime invocation is covered by the true-browser (Playwright)
 *   pass, while the component contract is locked in jsdom via the
 *   composition wiring below.
 * - **Host-document canvas** (`iframe: { enabled: false }`, also every
 *   jsdom test): mount it directly around the preview —
 *   `<AppearanceIframeOverride><Puck.Preview /></AppearanceIframeOverride>`
 *   — the same style element lands in the host document, where the
 *   canvas actually renders in that mode.
 *
 * Either way the §8.4 rule holds: exactly one injection path per
 * canvas document, one adapter to retest on a Puck upgrade.
 */

import type { ReactNode } from "react";
import { PuckIframeAppearanceBridge } from "../PuckIframeAppearanceBridge.js";
import {
	type UseCompiledAppearanceOptions,
	useCompiledAppearance,
} from "./use-compiled-appearance.js";

export interface AppearanceIframeOverrideProps
	extends UseCompiledAppearanceOptions {
	/** CSP nonce propagated onto the style element (§7.4). */
	readonly nonce?: string;
	readonly children?: ReactNode;
}

/** Compile the live document and bridge it into the canvas frame. */
export function AppearanceIframeOverride({
	nonce,
	tokenMode,
	children,
}: AppearanceIframeOverrideProps): ReactNode {
	const compiled = useCompiledAppearance({ tokenMode });
	return (
		<PuckIframeAppearanceBridge css={compiled.css} nonce={nonce}>
			{children}
		</PuckIframeAppearanceBridge>
	);
}
