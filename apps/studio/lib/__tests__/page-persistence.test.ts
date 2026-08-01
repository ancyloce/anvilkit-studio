/**
 * `persistPage` gateway regression coverage.
 *
 * The gateway is the single seam the editor's Save Draft / Publish / Preview
 * actions share, and the three kinds do NOT agree on validation: draft and
 * publish are gated on the canonical `PageRootSchema`, preview deliberately is
 * not. That asymmetry is load-bearing — a preview renders the LIVE document,
 * which is routinely mid-authoring — so it is pinned here.
 *
 * Regression: previewing a slugged page used to run through
 * `persistPage("draft", …)`, so a Slug root field typed but not yet slugified
 * ("My New Page") failed validation and the header Preview action aborted with
 * "[demo] preview blocked — could not store the document".
 */

import type { PageRootProps } from "@anvilkit/schema";
import type { Data } from "@puckeditor/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { persistPage } from "../page-persistence";
import type { DemoComponents } from "../puck-demo";

type Doc = Data<DemoComponents, PageRootProps>;

const docWith = (props: Partial<PageRootProps>): Doc =>
	({
		root: {
			props: {
				title: "My New Page",
				slug: "my-new-page",
				status: "draft",
				version: "1.0.0",
				parentFolder: "/",
				seo: { noIndex: false },
				...props,
			},
		},
		content: [],
		zones: {},
	}) as unknown as Doc;

const okResponse = (): Response =>
	new Response(JSON.stringify({ ok: true, data: null }), { status: 200 });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
	fetchMock = vi.fn(async () => okResponse());
	vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("persistPage — validation gate", () => {
	it("rejects a draft whose slug is still human-typed, without hitting the API", async () => {
		const result = await persistPage("draft", docWith({ slug: "My New Page" }));

		expect(result.ok).toBe(false);
		expect(result.issue).toBe("Invalid slug format");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("stores a preview of that same in-progress document", async () => {
		const result = await persistPage(
			"preview",
			docWith({ slug: "My New Page" }),
		);

		expect(result.ok).toBe(true);
		expect(result.issue).toBeUndefined();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/pages/preview");
	});

	it("stores a preview of a document with no slug at all", async () => {
		const result = await persistPage("preview", docWith({ slug: "" }));

		expect(result.ok).toBe(true);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("stores a preview of a document with an empty title", async () => {
		const result = await persistPage("preview", docWith({ title: "" }));

		expect(result.ok).toBe(true);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("still validates publishes", async () => {
		const result = await persistPage("publish", docWith({ title: "" }));

		expect(result.ok).toBe(false);
		expect(result.issue).toBe("Page title is required");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("posts a valid draft to its own route", async () => {
		const result = await persistPage("draft", docWith({}));

		expect(result.ok).toBe(true);
		expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/pages/draft");
	});
});

describe("persistPage — transport failures surface a reason", () => {
	it("reports the server message on a rejected write", async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({ ok: false, message: "Missing preview document." }),
				{ status: 400 },
			),
		);

		const result = await persistPage("preview", docWith({}));

		expect(result).toEqual({ ok: false, issue: "Missing preview document." });
	});

	it("reports the status when the body carries no message", async () => {
		fetchMock.mockResolvedValueOnce(new Response("nope", { status: 500 }));

		const result = await persistPage("preview", docWith({}));

		expect(result).toEqual({ ok: false, issue: "Persist failed (500)" });
	});

	it("reports a thrown network error", async () => {
		fetchMock.mockRejectedValueOnce(new Error("offline"));

		const result = await persistPage("preview", docWith({}));

		expect(result).toEqual({ ok: false, issue: "offline" });
	});
});
