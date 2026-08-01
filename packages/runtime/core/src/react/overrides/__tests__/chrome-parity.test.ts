/**
 * @file Guards that the selection chrome painted in the HOST document and the
 * copy painted inside the Puck canvas iframe stay identical.
 *
 * The same rules are declared twice by necessity — `styles.src.css` is a
 * Tailwind build input for the host document, `theme/iframe-theme.ts` is a
 * runtime-injected string for the iframe document — and they silently drifted:
 * the selection ring was 1px in one and 2px in the other, the label radius 4px
 * vs 6px, and the iframe copy painted its 11px/500 white label on `--brand`
 * rather than `--brand-deep`, breaking the ≥15px/600 contrast rule that the
 * host copy carries a comment explaining.
 *
 * Since the canvas is iframed by default, the diverged copy was the one users
 * actually saw. This test compares the declaration bodies of every selector
 * present in both sources.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { IFRAME_THEME_CSS } from "../../../studio/theme/iframe-theme.js";

const here = dirname(fileURLToPath(import.meta.url));
const cssSource = readFileSync(resolve(here, "../styles.src.css"), "utf-8");

/** Selectors that must render identically in both documents. */
const SHARED_SELECTORS = [
	'[class*="_DraggableComponent-overlay_"]',
	"[data-ak-overlay]",
	'[data-ak-overlay][data-overlay-state="hover"]',
	'[data-ak-overlay][data-overlay-state="selected"]',
	"[data-ak-overlay-label]",
	'[data-ak-overlay][data-label-position="inside"] [data-ak-overlay-label]',
	"[data-ak-selection-toolbar]",
	"[data-ak-toolbar-action]",
	"[data-ak-toolbar-action]:hover:not(:disabled)",
	"[data-ak-toolbar-action]:disabled",
	"[data-ak-selection-toolbar] [data-ak-toolbar-separator]",
];

function withoutComments(css: string): string {
	return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Read one flat rule's declarations. Matches the selector only at a rule
 * boundary so `[data-ak-overlay]` cannot match the longer
 * `[data-ak-overlay][data-overlay-state="hover"]`.
 */
function declarationsFor(css: string, selector: string): string | null {
	const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const rule = new RegExp(`(?:^|[};])\\s*${escaped}\\s*\\{([^}]*)\\}`, "m");
	const match = rule.exec(withoutComments(css));
	if (match === null) return null;
	return (
		match[1]
			?.split(";")
			.map((decl) =>
				decl
					.trim()
					.replace(/\s+/g, " ")
					// Biome formats the .css file's shorthand as `10px / 1.6`
					// while the .ts template literal keeps `10px/1.6`. Same CSS,
					// different formatter — normalize so this compares meaning.
					.replace(/\s*\/\s*/g, "/"),
			)
			.filter((decl) => decl.length > 0)
			.sort()
			.join("; ") ?? ""
	);
}

describe("host / iframe selection-chrome parity", () => {
	it.each(SHARED_SELECTORS)("declares %s identically in both", (selector) => {
		const host = declarationsFor(cssSource, selector);
		const iframe = declarationsFor(IFRAME_THEME_CSS, selector);

		expect(host, `${selector} missing from styles.src.css`).not.toBeNull();
		expect(iframe, `${selector} missing from iframe-theme`).not.toBeNull();
		expect(iframe).toBe(host);
	});

	it("paints the overlay label on --brand-deep in both documents", () => {
		// DESIGN.md §3.2: white-on-`--brand` needs ≥15px/600; this label is
		// 11px/500 in both modes, so it must use the deeper fill. Pinned
		// explicitly because this is the divergence that reached users.
		for (const css of [cssSource, IFRAME_THEME_CSS]) {
			const label = declarationsFor(css, "[data-ak-overlay-label]");
			expect(label).toContain("background-color: var(--brand-deep)");
			expect(label).not.toContain("var(--ak-studio-accent)");
		}
	});

	it("keeps the selection ring at 1px in both documents", () => {
		for (const css of [cssSource, IFRAME_THEME_CSS]) {
			const selected = declarationsFor(
				css,
				'[data-ak-overlay][data-overlay-state="selected"]',
			);
			expect(selected).toContain("outline-width: 1px");
			expect(selected).toContain("outline-offset: -1px");
		}
	});
});
