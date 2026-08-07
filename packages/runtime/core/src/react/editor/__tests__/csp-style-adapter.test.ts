/**
 * @file PLAN-0020 CORE-P4-004 — the strict-CSP authoring-style adapter
 * integration test that DD-0019 §29 requires by name ("Hosts with
 * strict CSP may provide a nonce or constructable-stylesheet adapter
 * for authoring styles; **this path requires integration tests**").
 *
 * The tests drive the real injection function against a real jsdom
 * document, because the whole point of the adapter is what ends up in
 * the DOM — a mock would assert the call, not the outcome.
 */

import type {
	EditorStyleAdapter,
} from "@anvilkit/contracts/editor";
import type {
	AuthoringStateV1,
} from "../../../editor/legacy/index.js";
import { describe, expect, it, vi } from "vitest";
import { createEmptyAuthoringState } from "../../../editor/index.js";
import {
	AUTHORING_STYLE_ELEMENT_ID,
	applyAuthoringStylesheet,
	buildAuthoringStylesheet,
} from "../responsive/stylesheet.js";

function seeded(): AuthoringStateV1 {
	return {
		...createEmptyAuthoringState(),
		nodes: {
			"node-a": { version: "1", style: { base: { opacity: 0.5 } } },
		},
	};
}

function freshDoc(): Document {
	return document.implementation.createHTMLDocument("canvas");
}

function css(): string {
	return buildAuthoringStylesheet(seeded(), []);
}

describe("no adapter — the default path is unchanged", () => {
	it("creates a scoped <style> element with no nonce", () => {
		const doc = freshDoc();
		const element = applyAuthoringStylesheet(doc, css());
		expect(element).not.toBeNull();
		expect(element?.id).toBe(AUTHORING_STYLE_ELEMENT_ID);
		expect(element?.hasAttribute("nonce")).toBe(false);
		expect(doc.head.querySelectorAll("style")).toHaveLength(1);
	});
});

describe("nonce adapter (§29 strict-CSP host)", () => {
	it("stamps the nonce on the element it creates", () => {
		const doc = freshDoc();
		const element = applyAuthoringStylesheet(doc, css(), {
			nonce: "r4nd0m-per-request",
		});
		// The property is what the browser checks against `style-src
		// 'nonce-…'`; the attribute keeps the element inspectable.
		expect(element?.nonce).toBe("r4nd0m-per-request");
		expect(element?.getAttribute("nonce")).toBe("r4nd0m-per-request");
	});

	it("still writes the CSS itself", () => {
		const doc = freshDoc();
		const text = css();
		const element = applyAuthoringStylesheet(doc, text, { nonce: "abc" });
		expect(element?.textContent).toBe(text);
	});

	it("does not re-stamp or duplicate on the next authoring change", () => {
		const doc = freshDoc();
		const adapter: EditorStyleAdapter = { nonce: "abc" };
		applyAuthoringStylesheet(doc, css(), adapter);
		applyAuthoringStylesheet(doc, `${css()}\n/* changed */`, adapter);
		expect(doc.head.querySelectorAll("style")).toHaveLength(1);
		expect(doc.getElementById(AUTHORING_STYLE_ELEMENT_ID)?.nonce).toBe("abc");
	});
});

describe("adopt adapter (constructable stylesheet)", () => {
	it("hands the CSS to the host and creates NO style element", () => {
		// This is the load-bearing assertion: a host that forbids inline
		// <style> entirely gets nothing injected. If Core also created an
		// element "just in case", the adapter would be pointless — the
		// CSP violation it exists to avoid would still fire.
		const doc = freshDoc();
		const adopt = vi.fn();
		const element = applyAuthoringStylesheet(doc, css(), { adopt });
		expect(element).toBeNull();
		expect(doc.head.querySelectorAll("style")).toHaveLength(0);
		expect(doc.getElementById(AUTHORING_STYLE_ELEMENT_ID)).toBeNull();
		expect(adopt).toHaveBeenCalledTimes(1);
		expect(adopt).toHaveBeenCalledWith(doc, css());
	});

	it("is called again on every authoring change", () => {
		const doc = freshDoc();
		const adopt = vi.fn();
		applyAuthoringStylesheet(doc, "a{}", { adopt });
		applyAuthoringStylesheet(doc, "b{}", { adopt });
		expect(adopt.mock.calls.map((call) => call[1])).toEqual(["a{}", "b{}"]);
	});

	it("wins over nonce when a host supplies both", () => {
		// They are alternatives, not layers: with `adopt` there is no
		// element for a nonce to apply to, so silently doing both would
		// inject the inline style the host was trying to avoid.
		const doc = freshDoc();
		const adopt = vi.fn();
		expect(
			applyAuthoringStylesheet(doc, css(), { adopt, nonce: "abc" }),
		).toBeNull();
		expect(doc.head.querySelectorAll("style")).toHaveLength(0);
	});

	it("supports a real constructable-stylesheet host implementation", () => {
		// End-to-end shape of the documented host recipe, using a stand-in
		// for `CSSStyleSheet` (jsdom implements neither `replaceSync` nor
		// `adoptedStyleSheets`). What is under test is that Core hands the
		// host everything it needs — the document and the full text —
		// exactly once per change.
		const doc = freshDoc();
		const sheets: string[] = [];
		const adapter: EditorStyleAdapter = {
			adopt(targetDoc, cssText) {
				expect(targetDoc).toBe(doc);
				sheets.length = 0;
				sheets.push(cssText);
			},
		};
		applyAuthoringStylesheet(doc, css(), adapter);
		expect(sheets).toEqual([css()]);
	});
});
