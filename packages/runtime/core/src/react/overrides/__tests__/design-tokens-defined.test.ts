/**
 * @file Guards that every studio-owned CSS custom property the source
 * REFERENCES is actually DEFINED — in the host stylesheet, and (for the
 * components that paint inside the Puck canvas iframe) in the iframe token
 * snapshot too.
 *
 * This exists because three tokens shipped undefined and failed silently:
 *
 *   - `--ak-studio-hover` — referenced at 7 call sites, defined nowhere. An
 *     undefined custom property with no fallback makes the declaration
 *     invalid at computed-value time, so `background-color` fell back to
 *     `transparent`: the token picker's attached row, the page navigator's
 *     active page and the component canvas's selected tab all rendered
 *     identically to their unselected siblings.
 *   - `--editor-text` — `SelectionToolbar` asked for it with a `#111`
 *     fallback, so toolbar labels were pinned to near-black and computed to
 *     1.00:1 against the dark `--editor-panel` surface: invisible.
 *   - `--editor-snap-guide` — same shape, so the gap labels were pinned to a
 *     hardcoded pink that fails contrast for their 10px white text.
 *
 * A `var()` FALLBACK does not make a token defined. Every case above had one;
 * the fallback is exactly what made the bug silent instead of loud. So the
 * check below deliberately ignores fallbacks and asserts on the token itself.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { IFRAME_THEME_CSS } from "../../../studio/theme/iframe-theme.js";

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(here, "../../..");
const cssSource = readFileSync(resolve(here, "../styles.src.css"), "utf-8");

/**
 * Namespaces this repo owns and defines itself. shadcn primitives
 * (`--muted`, `--border`, …) and Tailwind-generated vars are out of scope —
 * they come from the theme bridge, not from us.
 */
// The trailing `(?!\$)` skips template interpolation — `theme/tokens.ts`
// builds names dynamically as `var(--ak-studio-${token})`, which is a helper,
// not a reference to a token literally called `--ak-studio-`.
const OWNED =
	/var\(\s*(--(?:ak-studio-|ak-ds-|editor-|brand|shadow-)[\w-]*)(?!\$)/g;

/** `--x: value` declarations, ignoring `var(--x)` references. */
const DEFINITION = /^\s*(--[\w-]+)\s*:/gm;

/**
 * Components portaled into the Puck canvas iframe (`EditorRoot` mounts these
 * under `AuthoringOverlayRoot`, which appends to the iframe's `document.body`).
 * The iframe is a separate document: it sees ONLY the token snapshot in
 * `theme/iframe-theme.ts`, never the host stylesheet. Anything these files
 * reference must therefore be defined in BOTH places.
 */
const IFRAME_PORTALED = [
	"react/editor/canvas/overlay-root.tsx",
	"react/editor/canvas/handles/CanvasHandles.tsx",
	"react/editor/canvas/marquee.tsx",
	"react/editor/canvas/SelectionToolbar.tsx",
	"react/editor/inline/rich-text.tsx",
	"react/overrides/canvas/ComponentOverlay.tsx",
];

function withoutComments(text: string): string {
	return text.replace(/\/\*[\s\S]*?\*\//g, "");
}

function collect(text: string, pattern: RegExp): Set<string> {
	const found = new Set<string>();
	for (const [, name] of withoutComments(text).matchAll(pattern)) {
		if (name !== undefined) found.add(name);
	}
	return found;
}

function definedIn(text: string): Set<string> {
	return collect(text, DEFINITION);
}

function referencedIn(text: string): Set<string> {
	return collect(text, OWNED);
}

function sourceFiles(): string[] {
	return readdirSync(srcRoot, { recursive: true, encoding: "utf-8" })
		.filter((entry) => /\.(tsx|ts|css)$/.test(entry))
		.filter((entry) => !entry.includes("__tests__"))
		.filter((entry) => !entry.includes(".test."))
		.map((entry) => resolve(srcRoot, entry));
}

const hostDefined = definedIn(cssSource);
const iframeDefined = definedIn(IFRAME_THEME_CSS);

describe("studio design tokens are defined, not just referenced", () => {
	it("defines every owned token referenced anywhere in src/", () => {
		const undefinedTokens = new Map<string, string[]>();

		for (const file of sourceFiles()) {
			for (const token of referencedIn(readFileSync(file, "utf-8"))) {
				if (hostDefined.has(token)) continue;
				const where = undefinedTokens.get(token) ?? [];
				where.push(relative(srcRoot, file));
				undefinedTokens.set(token, where);
			}
		}

		expect(Object.fromEntries(undefinedTokens)).toEqual({});
	});

	it("mirrors every token used inside the canvas iframe into the iframe snapshot", () => {
		const missing = new Map<string, string[]>();

		for (const rel of IFRAME_PORTALED) {
			const text = readFileSync(resolve(srcRoot, rel), "utf-8");
			for (const token of referencedIn(text)) {
				if (iframeDefined.has(token)) continue;
				const where = missing.get(token) ?? [];
				where.push(rel);
				missing.set(token, where);
			}
		}

		expect(Object.fromEntries(missing)).toEqual({});
	});

	it("keeps the three previously-undefined tokens defined in both documents", () => {
		// Explicit pins so a future refactor cannot quietly drop them again.
		for (const token of ["--ak-studio-hover", "--editor-snap-guide"]) {
			expect(hostDefined, `${token} missing from styles.src.css`).toContain(
				token,
			);
			expect(iframeDefined, `${token} missing from iframe-theme`).toContain(
				token,
			);
		}
		// `--editor-text` was removed rather than defined: SelectionToolbar now
		// uses the `--ak-studio-*` bridge, which the iframe already carries.
		expect(cssSource).not.toContain("--editor-text");
	});
});
