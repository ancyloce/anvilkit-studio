/**
 * @file CORE-P1B-001 — `CanvasDomRegistry`: authoritative
 * `data-ak-node` over the `[data-puck-component]` fallback, explicit
 * primary targets for multi-root renders, element→id resolution,
 * mutation-driven rebuilds, clean re-bind on document replacement,
 * and missing targets resolving to `null` (Layers-only selection).
 */

import { describe, expect, it, vi } from "vitest";
import { createCanvasDomRegistry } from "../canvas/dom-registry.js";

function docWith(html: string): Document {
	const doc = document.implementation.createHTMLDocument();
	doc.body.innerHTML = html;
	return doc;
}

describe("CanvasDomRegistry (CORE-P1B-001)", () => {
	it("indexes ak-stamped and puck-fallback elements", () => {
		const registry = createCanvasDomRegistry();
		registry.register(
			docWith(`
				<div data-ak-node="n-1">declared</div>
				<div data-puck-component="n-2">legacy</div>
			`),
		);
		expect(registry.getPrimaryElement("n-1")?.textContent).toBe("declared");
		expect(registry.getPrimaryElement("n-2")?.textContent).toBe("legacy");
		expect([...registry.listNodeIds()].sort()).toEqual(["n-1", "n-2"]);
	});

	it("prefers the ak-stamped element when both attributes exist for one id", () => {
		const registry = createCanvasDomRegistry();
		registry.register(
			docWith(`
				<div data-puck-component="n-1">outer</div>
				<div data-ak-node="n-1">inner</div>
			`),
		);
		expect(registry.getPrimaryElement("n-1")?.textContent).toBe("inner");
		expect(registry.getElements("n-1")).toHaveLength(2);
	});

	it("honors an explicit data-ak-primary target for multi-root renders", () => {
		const registry = createCanvasDomRegistry();
		registry.register(
			docWith(`
				<span data-ak-node="frag-1">first</span>
				<span data-ak-node="frag-1" data-ak-primary>second</span>
			`),
		);
		expect(registry.getPrimaryElement("frag-1")?.textContent).toBe("second");
	});

	it("resolves event targets to node ids by walking up", () => {
		const registry = createCanvasDomRegistry();
		const doc = docWith(
			`<div data-ak-node="n-1"><button id="deep">x</button></div><p id="outside">y</p>`,
		);
		registry.register(doc);
		const deep = doc.getElementById("deep") as Element;
		expect(registry.getNodeId(deep)).toBe("n-1");
		expect(registry.getNodeId(doc.getElementById("outside") as Element)).toBe(
			null,
		);
	});

	it("returns null / empty for missing targets (Layers-only selection)", () => {
		const registry = createCanvasDomRegistry();
		registry.register(docWith(`<div data-ak-node="n-1">a</div>`));
		expect(registry.getPrimaryElement("never-mounted")).toBeNull();
		expect(registry.getElements("never-mounted")).toEqual([]);
	});

	it("rebuilds after DOM mutations and notifies observers", async () => {
		const registry = createCanvasDomRegistry();
		const doc = docWith(`<div id="host"></div>`);
		registry.register(doc);
		const listener = vi.fn();
		registry.observe(listener);

		const el = doc.createElement("div");
		el.setAttribute("data-ak-node", "n-9");
		(doc.getElementById("host") as Element).appendChild(el);
		// MutationObserver delivery is microtask-based in jsdom.
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(listener).toHaveBeenCalled();
		expect(registry.getPrimaryElement("n-9")).toBe(el);

		el.remove();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(registry.getPrimaryElement("n-9")).toBeNull();
	});

	it("rebuilds cleanly on iframe document replacement", () => {
		const registry = createCanvasDomRegistry();
		registry.register(docWith(`<div data-ak-node="old-1">old</div>`));
		expect(registry.getPrimaryElement("old-1")).not.toBeNull();

		registry.register(docWith(`<div data-ak-node="new-1">new</div>`));
		expect(registry.getPrimaryElement("old-1")).toBeNull();
		expect(registry.getPrimaryElement("new-1")?.textContent).toBe("new");
	});

	it("goes inert after dispose", () => {
		const registry = createCanvasDomRegistry();
		registry.register(docWith(`<div data-ak-node="n-1">a</div>`));
		registry.dispose();
		expect(registry.getPrimaryElement("n-1")).toBeNull();
		expect(registry.listNodeIds()).toEqual([]);
	});
});
