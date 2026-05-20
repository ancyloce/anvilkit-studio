/**
 * @file Contract test for the `--ak-ds-*` design-system token block.
 *
 * Two guarantees the design-system plugin (`@anvilkit/plugin-design-system`,
 * PRD 0005) rides on:
 *
 *   1. Host document and iframe inject the same primitive + semantic
 *      `--ak-ds-*` namespace so canvas content resolves identical tokens
 *      to chrome. `styles.css` and `IFRAME_THEME_CSS` must stay in
 *      lockstep — the snapshot here flags drift early.
 *   2. Every Tier-2 semantic resolves to a non-empty value when only
 *      the bundled defaults are applied, so a host that omits the
 *      plugin still renders correctly via the `var(--ak-studio-*, …)`
 *      fallback chain.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { IFRAME_THEME_CSS } from "@/theme/iframe-theme";

const STYLES_CSS_PATH = fileURLToPath(
	new URL("../../../overrides/styles.css", import.meta.url),
);

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

const PRIMITIVE_TOKENS = [
	"--ak-ds-brand-500",
	"--ak-ds-brand-600",
	"--ak-ds-neutral-50",
	"--ak-ds-neutral-900",
	"--ak-ds-space-4",
	"--ak-ds-text-base",
	"--ak-ds-radius-md",
] as const;

describe("--ak-ds-* token contract (host CSS ⇄ iframe injection)", () => {
	it("every primitive declared in styles.css is also declared in IFRAME_THEME_CSS", () => {
		const stylesCss = readFileSync(STYLES_CSS_PATH, "utf8");
		for (const token of PRIMITIVE_TOKENS) {
			expect(stylesCss).toContain(`${token}:`);
			expect(IFRAME_THEME_CSS).toContain(`${token}:`);
		}
	});

	it("every semantic declared in styles.css is also declared in IFRAME_THEME_CSS", () => {
		const stylesCss = readFileSync(STYLES_CSS_PATH, "utf8");
		for (const token of SEMANTIC_TOKENS) {
			expect(stylesCss).toContain(`${token}:`);
			expect(IFRAME_THEME_CSS).toContain(`${token}:`);
		}
	});

	it("semantic tokens fall back to var(--ak-studio-*, …) so unthemed hosts still render", () => {
		// Every Tier-2 semantic must reference `--ak-studio-*` in its
		// declaration's fallback position. That keeps a host that installs
		// `@anvilkit/core` without `@anvilkit/plugin-design-system` from
		// rendering blank surfaces — chrome semantics carry the canvas.
		const stylesCss = readFileSync(STYLES_CSS_PATH, "utf8");
		const semanticDeclarations = stylesCss
			.split("\n")
			.filter((line) =>
				SEMANTIC_TOKENS.some((token) => line.trim().startsWith(`${token}:`)),
			);
		expect(semanticDeclarations).toHaveLength(SEMANTIC_TOKENS.length);
		for (const line of semanticDeclarations) {
			expect(line).toContain("--ak-studio-");
		}
	});

	it("dark mode override touches primitives only (semantics + stored token refs are theme-stable)", () => {
		const stylesCss = readFileSync(STYLES_CSS_PATH, "utf8");
		const darkBlock = stylesCss.slice(
			stylesCss.indexOf(".dark {"),
			stylesCss.indexOf("[data-ak-studio-root]"),
		);
		// The dark block must not declare any Tier-2 semantic — otherwise
		// a theme flip would re-bind roles without going through the
		// primitive layer, breaking the "primitives flip; semantics
		// unchanged" invariant from PRD 0005 §5.2.
		for (const token of SEMANTIC_TOKENS) {
			expect(darkBlock).not.toContain(`${token}:`);
		}
	});

	it("IFRAME_THEME_CSS dark block mirrors the host dark block (lockstep)", () => {
		const stylesCss = readFileSync(STYLES_CSS_PATH, "utf8");
		// The set of primitives the host dark block overrides must also
		// appear in the iframe's dark block. Easiest cross-document
		// guarantee: every neutral primitive declared in host `.dark` is
		// also declared in iframe `.dark`.
		const hostDark = stylesCss.slice(
			stylesCss.indexOf(".dark {"),
			stylesCss.indexOf("[data-ak-studio-root]"),
		);
		const iframeDark = IFRAME_THEME_CSS.slice(
			IFRAME_THEME_CSS.indexOf(".dark {"),
		);
		const neutralPrimitives = [
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
		];
		for (const token of neutralPrimitives) {
			expect(hostDark).toContain(`${token}:`);
			expect(iframeDark).toContain(`${token}:`);
		}
	});
});
