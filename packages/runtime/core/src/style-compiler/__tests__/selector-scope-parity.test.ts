/**
 * @file Enforcement test for review 0036 L-6 — compiled CSS must not
 * depend on the document wrapper.
 *
 * The two live consumers of the appearance compiler render DIFFERENT
 * roots. `AnvilKitRender` wraps its output in
 * `<div data-ak-document data-ak-token-mode>`; `PuckIframeAppearanceBridge`
 * emits only the `<style>` and the canvas children, because the editor
 * canvas root is Puck's own frame. That asymmetry is harmless *only*
 * while no compiled rule is scoped to the wrapper — and nothing enforced
 * it, so the first document-scoped selector would have broken
 * editor/production parity silently.
 *
 * The Puck contract's §1 condition 3 ("editor, preview, production and
 * export use the same pure rendering/style pipeline") is what makes that
 * a correctness rule rather than a preference, so it is asserted rather
 * than commented.
 */

import type { Config, Data } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import { compileDocumentAppearance } from "../compile.js";

const config = {
	components: {
		Box: {
			fields: {},
			metadata: {
				anvilkit: {
					editor: {
						version: "2",
						styleTargets: {
							root: {
								label: "Box",
								properties: ["display", "opacity", "padding"],
							},
						},
					},
				},
			},
			render: () => null,
		},
	},
} as unknown as Config;

/** A document exercising base rules and a responsive (media) layer. */
const data = {
	root: {
		props: {
			designSystem: {
				breakpoints: [{ id: "md", label: "md", minWidth: 768 }],
			},
		},
	},
	content: [
		{
			type: "Box",
			props: {
				id: "box-1",
				appearance: {
					version: "1",
					targets: {
						root: {
							style: {
								base: {
									layout: { display: "flex" },
									visual: { opacity: 0.5 },
								},
								md: { layout: { display: "block" } },
							},
						},
					},
				},
			},
		},
	],
	zones: {},
} as unknown as Data;

describe("compiled selectors are wrapper-independent (0036 L-6)", () => {
	const { css } = compileDocumentAppearance({ data, config });

	it("emits rules for the document", () => {
		// Guards the assertions below from passing on empty output.
		expect(css).toContain("data-ak-style-node");
		expect(css.length).toBeGreaterThan(0);
	});

	it("never scopes a rule to the production-only page wrapper", () => {
		// `AnvilKitRender` emits these; the editor iframe bridge does not.
		// A rule depending on either would apply in production and not in
		// the editor.
		expect(css).not.toContain("data-ak-document");
		expect(css).not.toContain("data-ak-token-mode");
	});

	it("addresses only the node/target attribute pair components emit", () => {
		// Every selector must be the §6.2 pair, which each component
		// renders itself — so it is present in both consumers by
		// construction.
		const selectors = css
			.split("}")
			.map((block) => block.split("{")[0]?.trim() ?? "")
			.filter((selector) => selector.length > 0 && !selector.startsWith("@"));
		expect(selectors.length).toBeGreaterThan(0);
		for (const selector of selectors) {
			expect(selector).toMatch(
				/^\[data-ak-style-node="[^"]+"\]\[data-ak-style-target="[^"]+"\]$/,
			);
		}
	});

	it("uses no descendant combinator", () => {
		// Plan §6.2 prohibits them: a descendant selector can reach into a
		// NESTED Puck component's targets, which is both a correctness bug
		// and a wrapper dependency.
		const selectors = css
			.split("}")
			.map((block) => block.split("{")[0]?.trim() ?? "")
			.filter((selector) => selector.startsWith("["));
		for (const selector of selectors) {
			expect(selector).not.toMatch(/\]\s+\[/);
			expect(selector).not.toContain(">");
		}
	});
});
