import { describe, expect, it } from "vitest";
import {
	validatePagePayload,
	validatePageRootProps,
	validatePublishRequest,
	validatePuckPageData,
	validateSaveDraftRequest,
} from "../validate-page-payload.js";

const validRootProps = {
	title: "Home",
	slug: "home",
	status: "published",
	version: "1.0.0",
	parentFolder: "/",
	seo: { noIndex: false },
};

const validPageData = {
	root: { props: validRootProps },
	content: [{ type: "Hero", props: { id: "hero-1", heading: "Hi" } }],
};

describe("validatePuckPageData", () => {
	it("accepts a complete, well-formed page document", () => {
		const result = validatePuckPageData(validPageData);
		expect(result.valid).toBe(true);
		expect(result.issues).toHaveLength(0);
	});

	it("accepts an empty content array", () => {
		const result = validatePuckPageData({ ...validPageData, content: [] });
		expect(result.valid).toBe(true);
	});

	it("accepts optional legacy zones", () => {
		const result = validatePuckPageData({
			...validPageData,
			zones: { "node-1:zone": [{ type: "Button", props: { id: "b1" } }] },
		});
		expect(result.valid).toBe(true);
	});

	it("rejects a document whose root.props is invalid", () => {
		const result = validatePuckPageData({
			...validPageData,
			root: { props: { ...validRootProps, slug: "Not A Slug" } },
		});
		expect(result.valid).toBe(false);
		const issue = result.issues.find(
			(i) => i.path.join(".") === "root.props.slug",
		);
		expect(issue).toBeDefined();
		expect(issue?.code).toMatch(/^E_PAGE_/);
	});

	it("rejects a document with non-array content", () => {
		const result = validatePuckPageData({ ...validPageData, content: {} });
		expect(result.valid).toBe(false);
		const issue = result.issues.find((i) => i.path[0] === "content");
		expect(issue).toBeDefined();
	});

	it("rejects a content node missing its type", () => {
		const result = validatePuckPageData({
			...validPageData,
			content: [{ props: { id: "x" } }],
		});
		expect(result.valid).toBe(false);
		const issue = result.issues.find(
			(i) => i.path[0] === "content" && i.path.includes("type"),
		);
		expect(issue).toBeDefined();
	});

	it("rejects a non-object payload", () => {
		expect(validatePuckPageData(null).valid).toBe(false);
		expect(validatePuckPageData("nope").valid).toBe(false);
		expect(validatePuckPageData(undefined).valid).toBe(false);
	});
});

describe("validateSaveDraftRequest", () => {
	it("accepts a draft request whose data.root.props is valid", () => {
		const result = validateSaveDraftRequest({
			slug: "home",
			title: "Home",
			data: { root: { props: validRootProps } },
		});
		expect(result.valid).toBe(true);
	});

	it("rejects a draft request with invalid root.props", () => {
		const result = validateSaveDraftRequest({
			slug: "home",
			data: { root: { props: { ...validRootProps, title: "" } } },
		});
		expect(result.valid).toBe(false);
		const issue = result.issues.find(
			(i) => i.path.join(".") === "data.root.props.title",
		);
		expect(issue).toBeDefined();
	});

	it("rejects a draft request missing data", () => {
		expect(validateSaveDraftRequest({ slug: "home" }).valid).toBe(false);
	});
});

describe("validatePublishRequest", () => {
	it("accepts a publish request with a complete document", () => {
		const result = validatePublishRequest({
			slug: "home",
			data: validPageData,
		});
		expect(result.valid).toBe(true);
	});

	it("rejects a publish request with malformed content", () => {
		const result = validatePublishRequest({
			slug: "home",
			data: { ...validPageData, content: "nope" },
		});
		expect(result.valid).toBe(false);
		const issue = result.issues.find((i) => i.path.includes("content"));
		expect(issue).toBeDefined();
	});

	it("rejects a publish request missing data", () => {
		expect(validatePublishRequest({ slug: "home" }).valid).toBe(false);
	});
});

describe("validatePagePayload naming compatibility", () => {
	it("remains a working alias of validatePageRootProps", () => {
		const a = validatePagePayload(validRootProps);
		const b = validatePageRootProps(validRootProps);
		expect(a).toEqual(b);
		expect(a.valid).toBe(true);
	});

	it("reports the same issues as validatePageRootProps for invalid input", () => {
		const bad = { ...validRootProps, status: "live" };
		expect(validatePagePayload(bad)).toEqual(validatePageRootProps(bad));
		expect(validatePagePayload(bad).valid).toBe(false);
	});
});
