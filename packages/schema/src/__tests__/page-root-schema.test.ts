import { describe, expect, it } from "vitest";
import { PageRootSchema, PageSeoSchema } from "../page-root-schema.js";

const validPayload = {
	title: "Home",
	slug: "home",
	status: "draft" as const,
	version: "1",
	parentFolder: "/",
	seo: {},
};

describe("PageRootSchema", () => {
	// ----- Happy path -----
	it("accepts a well-formed payload", () => {
		const result = PageRootSchema.safeParse(validPayload);
		expect(result.success).toBe(true);
	});

	it("accepts a nested slug-shaped slug", () => {
		expect(
			PageRootSchema.safeParse({ ...validPayload, slug: "about-us-team" })
				.success,
		).toBe(true);
	});

	// ----- title -----
	it("rejects an empty title", () => {
		const result = PageRootSchema.safeParse({ ...validPayload, title: "" });
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.path).toEqual(["title"]);
		}
	});

	// ----- slug -----
	it("rejects an invalid slug format", () => {
		for (const slug of ["Home", "has space", "trailing-", "-leading", "a--b"]) {
			const result = PageRootSchema.safeParse({ ...validPayload, slug });
			expect(result.success, `slug "${slug}" should be rejected`).toBe(false);
		}
	});

	// ----- status -----
	it("rejects an unknown status", () => {
		const result = PageRootSchema.safeParse({
			...validPayload,
			status: "live",
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.path).toEqual(["status"]);
		}
	});

	it("accepts every documented status", () => {
		for (const status of ["draft", "published", "archived"]) {
			expect(
				PageRootSchema.safeParse({ ...validPayload, status }).success,
			).toBe(true);
		}
	});

	// ----- defaults / prefault -----
	it("defaults parentFolder to '/' when omitted", () => {
		const { parentFolder, ...rest } = validPayload;
		const result = PageRootSchema.safeParse(rest);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.parentFolder).toBe("/");
		}
	});

	it("resolves an omitted seo block to { noIndex: false } via prefault", () => {
		const { seo, ...rest } = validPayload;
		const result = PageRootSchema.safeParse(rest);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.seo).toEqual({ noIndex: false });
		}
	});

	// ----- loose object -----
	it("strips Puck-internal keys rather than rejecting them", () => {
		const result = PageRootSchema.safeParse({
			...validPayload,
			id: "root-1234",
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).not.toHaveProperty("id");
		}
	});
});

describe("PageSeoSchema", () => {
	it("defaults noIndex to false on an empty object", () => {
		const result = PageSeoSchema.safeParse({});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.noIndex).toBe(false);
		}
	});

	it("accepts valid ogImage and canonical URLs", () => {
		const result = PageSeoSchema.safeParse({
			ogImage: "https://example.com/og.png",
			canonical: "https://example.com/home",
		});
		expect(result.success).toBe(true);
	});

	it("rejects a non-URL ogImage", () => {
		const result = PageSeoSchema.safeParse({ ogImage: "not-a-url" });
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.path).toEqual(["ogImage"]);
		}
	});

	it("rejects a non-URL canonical", () => {
		const result = PageSeoSchema.safeParse({ canonical: "/relative" });
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.path).toEqual(["canonical"]);
		}
	});
});
