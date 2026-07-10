import { describe, expect, it } from "vitest";
import {
	pageRootSeoToStudioPageSeo,
	pageRootToStudioPageFields,
	studioPageSeoToPageRootSeo,
} from "./page-root-seo.js";

describe("pageRootSeoToStudioPageSeo", () => {
	it("renames schema fields onto StudioPageSeo (title→metaTitle, etc.)", () => {
		expect(
			pageRootSeoToStudioPageSeo({
				title: "Home — Acme",
				description: "Welcome",
				ogImage: "https://example.com/og.png",
				noIndex: true,
				canonical: "https://example.com/",
			}),
		).toEqual({
			metaTitle: "Home — Acme",
			metaDescription: "Welcome",
			ogImage: "https://example.com/og.png",
			noindex: true,
			canonical: "https://example.com/",
		});
	});

	it("carries canonical through to StudioPageSeo", () => {
		expect(
			pageRootSeoToStudioPageSeo({ canonical: "https://example.com/" }),
		).toEqual({ canonical: "https://example.com/" });
	});

	it("returns undefined for an empty or absent seo block", () => {
		expect(pageRootSeoToStudioPageSeo(undefined)).toBeUndefined();
		expect(pageRootSeoToStudioPageSeo({})).toBeUndefined();
	});

	it("preserves noIndex: false rather than collapsing it", () => {
		expect(pageRootSeoToStudioPageSeo({ noIndex: false })).toEqual({
			noindex: false,
		});
	});
});

describe("studioPageSeoToPageRootSeo (write-back inverse)", () => {
	it("maps StudioPageSeo back onto schema field names", () => {
		expect(
			studioPageSeoToPageRootSeo({
				metaTitle: "T",
				metaDescription: "D",
				ogImage: "https://example.com/o.png",
				noindex: true,
				canonical: "https://example.com/",
			}),
		).toEqual({
			title: "T",
			description: "D",
			ogImage: "https://example.com/o.png",
			noIndex: true,
			canonical: "https://example.com/",
		});
	});

	it("round-trips through both directions losslessly (incl. canonical)", () => {
		const original = {
			title: "T",
			description: "D",
			ogImage: "https://example.com/o.png",
			noIndex: false,
			canonical: "https://example.com/",
		};
		const studio = pageRootSeoToStudioPageSeo(original);
		expect(studioPageSeoToPageRootSeo(studio)).toEqual(original);
	});

	it("returns an empty object for undefined input", () => {
		expect(studioPageSeoToPageRootSeo(undefined)).toEqual({});
	});
});

describe("pageRootToStudioPageFields", () => {
	it("projects title + seo from root.props", () => {
		expect(
			pageRootToStudioPageFields({
				title: "Home",
				seo: { title: "Home — Acme", noIndex: false },
			}),
		).toEqual({
			title: "Home",
			seo: { metaTitle: "Home — Acme", noindex: false },
		});
	});

	it("omits seo when no SEO field is set", () => {
		expect(pageRootToStudioPageFields({ title: "Home", seo: {} })).toEqual({
			title: "Home",
		});
	});

	it("returns an empty slice for absent root props", () => {
		expect(pageRootToStudioPageFields(undefined)).toEqual({});
	});
});
