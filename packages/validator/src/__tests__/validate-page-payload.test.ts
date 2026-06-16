import { describe, expect, it } from "vitest";
import { validatePagePayload } from "../validate-page-payload.js";

const validPayload = {
	title: "Home",
	slug: "home",
	status: "draft",
	version: "1",
	parentFolder: "/",
	seo: {},
};

describe("validatePagePayload", () => {
	// ----- Positive -----
	it("returns valid with no issues for a well-formed payload", () => {
		const result = validatePagePayload(validPayload);
		expect(result.valid).toBe(true);
		expect(result.issues).toHaveLength(0);
	});

	it("accepts a payload with full SEO metadata", () => {
		const result = validatePagePayload({
			...validPayload,
			seo: {
				title: "Home — Acme",
				description: "Welcome",
				ogImage: "https://example.com/og.png",
				canonical: "https://example.com/",
				noIndex: true,
			},
		});
		expect(result.valid).toBe(true);
		expect(result.issues).toHaveLength(0);
	});

	// ----- Field violations: each carries a populated path -----
	it("reports an error with path ['title'] for an empty title", () => {
		const result = validatePagePayload({ ...validPayload, title: "" });
		expect(result.valid).toBe(false);
		const issue = result.issues.find(
			(i) => i.path.length === 1 && i.path[0] === "title",
		);
		expect(issue).toBeDefined();
		expect(issue?.level).toBe("error");
		expect(issue?.code).toMatch(/^E_PAGE_/);
	});

	it("reports an error with path ['slug'] for an invalid slug", () => {
		const result = validatePagePayload({ ...validPayload, slug: "Not A Slug" });
		expect(result.valid).toBe(false);
		const issue = result.issues.find((i) => i.path[0] === "slug");
		expect(issue).toBeDefined();
		expect(issue?.code).toMatch(/^E_PAGE_/);
	});

	it("reports an error with path ['status'] for an unknown status", () => {
		const result = validatePagePayload({ ...validPayload, status: "live" });
		expect(result.valid).toBe(false);
		const issue = result.issues.find((i) => i.path[0] === "status");
		expect(issue).toBeDefined();
		expect(issue?.code).toMatch(/^E_PAGE_/);
	});

	it("reports a nested path ['seo','ogImage'] for a non-URL ogImage", () => {
		const result = validatePagePayload({
			...validPayload,
			seo: { ogImage: "not-a-url" },
		});
		expect(result.valid).toBe(false);
		const issue = result.issues.find((i) => i.path.join(".") === "seo.ogImage");
		expect(issue).toBeDefined();
		expect(issue?.code).toMatch(/^E_PAGE_/);
	});

	// ----- Multiple violations -----
	it("collects every violation in one pass", () => {
		const result = validatePagePayload({
			title: "",
			slug: "BAD SLUG",
			status: "nope",
			version: "1",
			parentFolder: "/",
			seo: {},
		});
		expect(result.valid).toBe(false);
		expect(result.issues.length).toBeGreaterThanOrEqual(3);
		for (const issue of result.issues) {
			expect(issue.level).toBe("error");
			expect(issue.path.length).toBeGreaterThan(0);
		}
	});

	// ----- Non-object input -----
	it("rejects a non-object payload", () => {
		expect(validatePagePayload(null).valid).toBe(false);
		expect(validatePagePayload("nope").valid).toBe(false);
		expect(validatePagePayload(undefined).valid).toBe(false);
	});
});
