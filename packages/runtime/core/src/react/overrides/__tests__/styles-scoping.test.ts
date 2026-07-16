/**
 * @file Guards against unscoped global CSS leaking into host apps
 * (DESIGN.md §2.3 / task Phase 2.3 "no global CSS leakage").
 *
 * `styles.src.css` is the source Tailwind compiles into the published
 * `dist/react/overrides/styles.css` a host app imports directly, so any
 * bare element/universal selector here would restyle the host page.
 * This is a lightweight source-text guard, not a full CSS parse — it
 * pins the specific selectors previously found unscoped (scrollbar
 * rules) rather than attempting to validate arbitrary future CSS.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const cssSource = readFileSync(resolve(here, "../styles.src.css"), "utf-8");

/** Strip CSS comments so `/* … *\/` text doesn't produce false matches. */
function withoutComments(css: string): string {
	return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("styles.src.css scoping", () => {
	const code = withoutComments(cssSource);

	it("never styles ::-webkit-scrollbar outside the Studio root or portal scope", () => {
		const bareScrollbarRule = /(^|[};])\s*::-webkit-scrollbar[^{]*\{/m;
		expect(bareScrollbarRule.test(code)).toBe(false);
	});

	it("scopes every ::-webkit-scrollbar rule under [data-ak-studio-root] or [data-ak-studio-theme]", () => {
		const scrollbarSelectors = code.match(
			/[^{}]*::-webkit-scrollbar[a-z-]*\s*\{/g,
		);
		expect(scrollbarSelectors).not.toBeNull();
		for (const selector of scrollbarSelectors ?? []) {
			expect(selector).toMatch(/data-ak-studio-(root|theme)/);
		}
	});

	it("never sets scrollbar-color/scrollbar-width on a bare universal selector", () => {
		const bareUniversalScrollbar =
			/(^|[};])\s*\*\s*\{[^}]*scrollbar-(color|width)/m;
		expect(bareUniversalScrollbar.test(code)).toBe(false);
	});

	it("scopes every drawer-item drag/focus rule under [data-ak-studio-root]", () => {
		const drawerRules = code.match(/[^{}]*data-puck-drawer-item[^{]*\{/g);
		expect(drawerRules).not.toBeNull();
		for (const selector of drawerRules ?? []) {
			expect(selector).toMatch(/data-ak-studio-root/);
		}
	});

	it("reserves the brand outline for the dragging state, not hover", () => {
		// The dragging rule uses the brand selection token…
		const draggingRule = code.match(/\[data-dnd-dragging\][^{]*\{[^}]*\}/g);
		expect(
			draggingRule?.some((rule) => rule.includes("--editor-selection")),
		).toBe(true);
		// …and no :hover rule in this stylesheet paints a brand token.
		const hoverRules = code.match(/[^{}]*:hover[^{]*\{[^}]*\}/g) ?? [];
		for (const rule of hoverRules) {
			expect(rule).not.toMatch(/--brand|--editor-selection/);
		}
	});
});
