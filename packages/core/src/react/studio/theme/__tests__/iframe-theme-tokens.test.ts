/**
 * @file Contract test for the `--ak-ds-*` design-system token block
 * injected by the canvas iframe theme.
 *
 * Two guarantees the design-system plugin (`@anvilkit/plugin-design-system`,
 * PRD 0005) rides on:
 *
 *   1. The iframe injection declares the full primitive + semantic
 *      `--ak-ds-*` namespace so canvas content resolves the same
 *      tokens chrome does. The host-CSS ⇄ iframe lockstep is enforced
 *      by the plugin's `emit-css` snapshot in A5; this file pins the
 *      iframe side of the contract.
 *   2. Every Tier-2 semantic falls back through `var(--ak-studio-*, …)`
 *      so a host that omits the plugin still renders correctly.
 *   3. The iframe `.dark` block touches primitives only (semantics +
 *      stored token refs are theme-stable across a mode flip).
 */

import { describe, expect, it } from "vitest";

import { IFRAME_THEME_CSS } from "@/theme/iframe-theme";

const SEMANTIC_TOKENS = [
	"--ak-ds-bg",
	"--ak-ds-surface",
	"--ak-ds-fg",
	"--ak-ds-fg-muted",
	"--ak-ds-accent",
	"--ak-ds-accent-fg",
	"--ak-ds-border",
	"--ak-ds-focus-ring",
] as const;

const PRIMITIVE_BRAND = [
	"--ak-ds-brand-50",
	"--ak-ds-brand-100",
	"--ak-ds-brand-200",
	"--ak-ds-brand-300",
	"--ak-ds-brand-400",
	"--ak-ds-brand-500",
	"--ak-ds-brand-600",
	"--ak-ds-brand-700",
	"--ak-ds-brand-800",
	"--ak-ds-brand-900",
] as const;

const PRIMITIVE_NEUTRAL = [
	"--ak-ds-neutral-50",
	"--ak-ds-neutral-100",
	"--ak-ds-neutral-200",
	"--ak-ds-neutral-300",
	"--ak-ds-neutral-400",
	"--ak-ds-neutral-500",
	"--ak-ds-neutral-600",
	"--ak-ds-neutral-700",
	"--ak-ds-neutral-800",
	"--ak-ds-neutral-900",
] as const;

const PRIMITIVE_SCALE = [
	"--ak-ds-space-0",
	"--ak-ds-space-1",
	"--ak-ds-space-4",
	"--ak-ds-space-24",
	"--ak-ds-text-xs",
	"--ak-ds-text-base",
	"--ak-ds-text-3xl",
	"--ak-ds-radius-sm",
	"--ak-ds-radius-md",
	"--ak-ds-radius-lg",
] as const;

describe("--ak-ds-* iframe token contract", () => {
	it("declares every brand primitive in IFRAME_THEME_CSS", () => {
		for (const token of PRIMITIVE_BRAND) {
			expect(IFRAME_THEME_CSS).toContain(`${token}:`);
		}
	});

	it("declares every neutral primitive in IFRAME_THEME_CSS", () => {
		for (const token of PRIMITIVE_NEUTRAL) {
			expect(IFRAME_THEME_CSS).toContain(`${token}:`);
		}
	});

	it("declares spacing/text/radius primitives in IFRAME_THEME_CSS", () => {
		for (const token of PRIMITIVE_SCALE) {
			expect(IFRAME_THEME_CSS).toContain(`${token}:`);
		}
	});

	it("declares every semantic in IFRAME_THEME_CSS with a --ak-studio-* fallback", () => {
		// Every Tier-2 semantic must reference `--ak-studio-*` in its
		// fallback position so a host that omits the plugin still renders
		// correctly via chrome semantics.
		for (const token of SEMANTIC_TOKENS) {
			expect(IFRAME_THEME_CSS).toContain(`${token}:`);
			const linePattern = new RegExp(
				`${token.replace(/-/g, "\\-")}:\\s*var\\([^)]*?--ak-studio-`,
			);
			expect(IFRAME_THEME_CSS).toMatch(linePattern);
		}
	});

	it("dark block flips neutral primitives only — no semantics, no brand", () => {
		const darkBlockStart = IFRAME_THEME_CSS.indexOf(".dark {");
		expect(darkBlockStart).toBeGreaterThan(-1);
		const darkBlock = IFRAME_THEME_CSS.slice(darkBlockStart);

		for (const token of PRIMITIVE_NEUTRAL) {
			expect(darkBlock).toContain(`${token}:`);
		}

		// Brand stays the same across themes (brand color is brand color).
		for (const token of PRIMITIVE_BRAND) {
			expect(darkBlock).not.toContain(`${token}:`);
		}

		// Semantics resolve through primitives — flipping them directly
		// would break the "stored token refs are theme-stable" invariant.
		for (const token of SEMANTIC_TOKENS) {
			expect(darkBlock).not.toContain(`${token}:`);
		}
	});
});
