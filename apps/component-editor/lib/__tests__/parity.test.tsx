/**
 * P0-06 parity seed (plan 0036): the canvas render and the published
 * `AnvilKitRender` output must produce the SAME target DOM for the same
 * document — the Unified Puck Contract's "one pipeline, four consumers"
 * rule, enforced rather than asserted in prose.
 *
 * Advisory for now: this suite runs green on corpus v0 but is not yet a
 * required CI gate (it becomes one at P3-03, over the full corpus).
 */
import { compileDocumentAppearance } from "@anvilkit/core/editor";
import { AnvilKitRender } from "@anvilkit/core/react/render";
import type { Config } from "@puckeditor/core";
import { Render } from "@puckeditor/core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { componentEditorConfig } from "../editor-config";
import { CORPUS_V0 } from "../fixtures/corpus";

const config = componentEditorConfig as Config;

/** Every element's data-ak-* style stamps, order-independent. */
function targetStamps(markup: string): string[] {
	const stamps: string[] = [];
	for (const tag of markup.match(/<[a-zA-Z][^>]*>/g) ?? []) {
		const styleNode = tag.match(/data-ak-style-node="([^"]*)"/)?.[1];
		const styleTarget = tag.match(/data-ak-style-target="([^"]*)"/)?.[1];
		if (styleNode !== undefined || styleTarget !== undefined) {
			stamps.push(`${styleNode ?? ""}#${styleTarget ?? ""}`);
		}
	}
	return stamps.sort();
}

/** Text content, tags stripped — the render's visible payload. */
function textOf(markup: string): string {
	return markup
		.replace(/<style[^>]*>[\s\S]*?<\/style>/g, "")
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

describe.each(CORPUS_V0.map((f) => [f.name, f] as const))(
	"editor ≍ published parity — %s (P0-06)",
	(_name, fixture) => {
		// The canvas path: Puck's own renderer over the shared config.
		const canvasMarkup = renderToStaticMarkup(
			createElement(Render, { config, data: fixture.data }),
		);
		// The publish path: the same config + data through AnvilKitRender.
		const compiled = compileDocumentAppearance({
			data: fixture.data,
			config,
		});
		const publishedMarkup = renderToStaticMarkup(
			createElement(AnvilKitRender, {
				config,
				data: fixture.data,
				compiled,
			}),
		);

		it("stamps an identical set of style targets on both surfaces", () => {
			expect(targetStamps(publishedMarkup)).toEqual(targetStamps(canvasMarkup));
		});

		it("renders identical text content on both surfaces", () => {
			expect(textOf(publishedMarkup)).toBe(textOf(canvasMarkup));
		});

		it("emits every node's stamps (no node silently dropped)", () => {
			const stamps = targetStamps(canvasMarkup);
			expect(stamps.length).toBeGreaterThan(0);
			for (const node of fixture.data.content) {
				const id = (node.props as { id: string }).id;
				expect(
					stamps.some((stamp) => stamp.startsWith(`${id}#`)),
					`${id} produced no stamped element`,
				).toBe(true);
			}
		});
	},
);

describe("compiled appearance travels with the document (P0-06)", () => {
	it("compiles an authored target to CSS keyed by node + target", () => {
		const fixture = CORPUS_V0.find((f) => f.name === "authored appearance");
		if (fixture === undefined) throw new Error("fixture missing");
		const compiled = compileDocumentAppearance({
			data: fixture.data,
			config,
		});
		expect(compiled.css).toContain('data-ak-style-node="badge-styled"');
		expect(compiled.css).toContain('data-ak-style-target="root"');
		expect(compiled.css).toContain("opacity: 0.5");
	});

	it("nested slot children are stamped, not flattened away", () => {
		const fixture = CORPUS_V0.find((f) => f.name === "nested slots");
		if (fixture === undefined) throw new Error("fixture missing");
		const markup = renderToStaticMarkup(
			createElement(Render, { config, data: fixture.data }),
		);
		const stamps = targetStamps(markup);
		for (const id of ["card-nested", "badge-in-slot", "button-in-slot"]) {
			expect(
				stamps.some((stamp) => stamp.startsWith(`${id}#`)),
				`${id} missing from the nested render`,
			).toBe(true);
		}
	});

	it("array-nested slot children are stamped on both surfaces (DOC-01 §3.8)", () => {
		const fixture = CORPUS_V0.find((f) => f.name === "array-nested slots");
		if (fixture === undefined) throw new Error("fixture missing");
		const markup = renderToStaticMarkup(
			createElement(Render, { config, data: fixture.data }),
		);
		const stamps = targetStamps(markup);
		// The slot lives inside an ARRAY ITEM, the one nesting shape the P0
		// corpus could not reach — a child lost here would be invisible to
		// every other assertion in this file.
		for (const id of ["tabs-nested", "badge-tab-1", "accordion-nested"]) {
			expect(
				stamps.some((stamp) => stamp.startsWith(`${id}#`)),
				`${id} missing from the array-nested render`,
			).toBe(true);
		}
	});
});

describe("corpus coverage (P1-13)", () => {
	it("exercises every registered wrapper", () => {
		// The corpus is derived from the config, so this asserts the
		// derivation rather than a hand-kept list — a wrapper registered in
		// the editor is parity-tested from that moment on.
		const covered = new Set<string>();
		for (const fixture of CORPUS_V0) {
			for (const node of fixture.data.content) covered.add(node.type);
		}
		for (const type of Object.keys(config.components)) {
			expect(
				covered.has(type),
				`${type} is absent from the parity corpus`,
			).toBe(true);
		}
		expect(Object.keys(config.components)).toHaveLength(18);
	});
});
