import { describe, expect, it } from "vitest";
import {
	type AnvilkitTemplate,
	isAnvilkitTemplate,
} from "./index.js";

function minimalTemplate(): AnvilkitTemplate {
	return {
		slug: "landing-saas",
		name: "Landing — SaaS",
		description: "A minimal SaaS landing page.",
		preview: {
			src: "./preview.png",
			width: 1200,
			height: 675,
			alt: "Landing — SaaS preview",
		},
		packages: [{ name: "@anvilkit/hero", version: "^1.0.0" }],
		pageIR: {
			version: "1",
			root: {
				id: "root",
				type: "Root",
				props: {},
				children: [
					{
						id: "hero-1",
						type: "Hero",
						props: { title: "Hello", subtitle: "World" },
					},
				],
			},
			assets: [],
			metadata: {
				title: "Landing",
				description: "A minimal SaaS landing page.",
			},
		},
	};
}

describe("isAnvilkitTemplate", () => {
	it("accepts a minimal well-formed template", () => {
		expect(isAnvilkitTemplate(minimalTemplate())).toBe(true);
	});

	it("rejects non-objects", () => {
		expect(isAnvilkitTemplate(null)).toBe(false);
		expect(isAnvilkitTemplate(undefined)).toBe(false);
		expect(isAnvilkitTemplate("landing-saas")).toBe(false);
		expect(isAnvilkitTemplate(42)).toBe(false);
	});

	it("rejects a template missing required string fields", () => {
		const t = minimalTemplate() as unknown as Record<string, unknown>;
		delete t.slug;
		expect(isAnvilkitTemplate(t)).toBe(false);
	});

	it("rejects a template whose preview is malformed", () => {
		const t = minimalTemplate();
		const broken = {
			...t,
			preview: { ...t.preview, alt: undefined },
		};
		expect(isAnvilkitTemplate(broken)).toBe(false);
	});

	it("rejects a template whose packages list contains malformed entries", () => {
		const t = minimalTemplate();
		const broken = {
			...t,
			packages: [{ name: "@anvilkit/hero" }],
		};
		expect(isAnvilkitTemplate(broken)).toBe(false);
	});

	it("rejects a template whose pageIR.version is not the literal \"1\"", () => {
		const t = minimalTemplate();
		const broken = {
			...t,
			pageIR: { ...t.pageIR, version: 1 as unknown as "1" },
		};
		expect(isAnvilkitTemplate(broken)).toBe(false);
	});
});
