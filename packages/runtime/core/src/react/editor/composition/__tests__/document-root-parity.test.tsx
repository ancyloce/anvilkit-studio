/**
 * @file Regression test for review 0036 L-6 — the editor and
 * production consumers must mark the document root identically.
 *
 * `AnvilKitRender` wrapped its output in `<div data-ak-document
 * data-ak-token-mode>` and the editor canvas emitted nothing
 * comparable. That asymmetry was invisible: no compiled selector is
 * document-scoped, so nothing broke — and nothing would have warned
 * when the first one appeared. `selector-scope-parity.test.ts` pins the
 * condition that made it safe; this file pins the parity itself, so the
 * two consumers agree on where a document begins and which token mode
 * it was compiled for.
 *
 * The fixture's design system declares `defaultTokenMode: "brand"`
 * precisely because the interesting value is the RESOLVED one: a
 * consumer that re-derived the mode as `tokenMode ?? "default"` would
 * pass a `"default"`-mode assertion and still misreport this document
 * (review 0036 L-5).
 */

import type { Config, Data } from "@puckeditor/core";
import { Puck } from "@puckeditor/core";
import { cleanup, render } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { AnvilKitRender } from "../../../render/AnvilKitRender.js";
import { AppearanceIframeOverride } from "../AppearanceIframeOverride.js";

const config: Config = {
	components: {
		Box: {
			fields: {},
			metadata: {
				anvilkit: {
					editor: {
						version: "2",
						styleTargets: {
							root: { label: "Box", properties: ["display"] },
						},
					},
				},
			},
			render: () => <div data-testid="box-render" />,
		},
	},
} as unknown as Config;

const data = {
	root: {
		props: {
			designSystem: {
				breakpoints: [],
				tokens: {},
				tokenModes: { brand: { id: "brand", name: "Brand" } },
				defaultTokenMode: "brand",
				styleDefinitions: {},
			},
		},
	},
	content: [
		{
			type: "Box",
			props: {
				id: "box-1",
				appearance: {
					targets: {
						root: { style: { base: { layout: { display: "flex" } } } },
					},
				},
			},
		},
	],
	zones: {},
} as unknown as Data;

/** Every element carrying the document-root marking, in DOM order. */
function documentRoots(scope: ParentNode): HTMLElement[] {
	return [...scope.querySelectorAll<HTMLElement>("[data-ak-document]")];
}

afterEach(cleanup);

describe("document-root parity (0036 L-6)", () => {
	it("production marks its page root with the RESOLVED token mode", () => {
		const { container } = render(
			<AnvilKitRender config={config} data={data} />,
		);
		const roots = documentRoots(container);
		expect(roots).toHaveLength(1);
		expect(roots[0]?.getAttribute("data-ak-token-mode")).toBe("brand");
	});

	it("the editor canvas marks its root with the same attributes and value", () => {
		const { container } = render(
			<Puck config={config} data={data} iframe={{ enabled: false }}>
				<AppearanceIframeOverride>
					<Puck.Preview />
				</AppearanceIframeOverride>
			</Puck>,
		);
		const roots = documentRoots(container);
		expect(roots).toHaveLength(1);
		expect(roots[0]?.getAttribute("data-ak-token-mode")).toBe("brand");
	});

	it("the editor's marked root actually contains the canvas content", () => {
		// A marking that does not contain the document is worse than none:
		// tooling would read it and find nothing beneath.
		const { container } = render(
			<Puck config={config} data={data} iframe={{ enabled: false }}>
				<AppearanceIframeOverride>
					<Puck.Preview />
				</AppearanceIframeOverride>
			</Puck>,
		);
		const root = documentRoots(container)[0];
		expect(root).toBeDefined();
		expect(root?.querySelector('[data-testid="box-render"]')).not.toBeNull();
		expect(
			root?.querySelector("style[data-anvilkit-appearance]"),
		).not.toBeNull();
	});

	it("the editor's carrier generates no box, so marking changed no layout", () => {
		const { container } = render(
			<Puck config={config} data={data} iframe={{ enabled: false }}>
				<AppearanceIframeOverride>
					<Puck.Preview />
				</AppearanceIframeOverride>
			</Puck>,
		);
		expect(documentRoots(container)[0]?.style.display).toBe("contents");
	});

	it("a pure style feed with nothing to contain marks no root", () => {
		// The iframe wiring mounts the feed as a sibling of the canvas
		// content. Emitting a wrapper there would mark an empty element.
		const { container } = render(
			<Puck config={config} data={data} iframe={{ enabled: false }}>
				<AppearanceIframeOverride />
				<Puck.Preview />
			</Puck>,
		);
		expect(documentRoots(container)).toHaveLength(0);
		expect(
			container.querySelector("style[data-anvilkit-appearance]"),
		).not.toBeNull();
	});
});

describe("document-root parity — iframe wiring (0036 L-6)", () => {
	function mountFrame(): {
		frameDoc: Document;
		unmount: () => void;
		cleanupFrame: () => void;
	} {
		const frame = document.createElement("iframe");
		document.body.appendChild(frame);
		const frameDoc = frame.contentDocument;
		if (frameDoc === null) throw new Error("no frame document");
		const { unmount } = render(
			<Puck config={config} data={data} iframe={{ enabled: false }}>
				<AppearanceIframeOverride frameDocument={frameDoc} />
			</Puck>,
		);
		return { frameDoc, unmount, cleanupFrame: () => frame.remove() };
	}

	it("marks the frame document's body rather than inventing a wrapper", () => {
		const { frameDoc, unmount, cleanupFrame } = mountFrame();
		expect(frameDoc.body.getAttribute("data-ak-document")).toBe("");
		expect(frameDoc.body.getAttribute("data-ak-token-mode")).toBe("brand");
		unmount();
		cleanupFrame();
	});

	it("removes the marking when the canvas unmounts", () => {
		const { frameDoc, unmount, cleanupFrame } = mountFrame();
		unmount();
		expect(frameDoc.body.hasAttribute("data-ak-document")).toBe(false);
		expect(frameDoc.body.hasAttribute("data-ak-token-mode")).toBe(false);
		cleanupFrame();
	});
});
