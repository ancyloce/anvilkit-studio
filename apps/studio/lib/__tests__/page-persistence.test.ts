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
import {
	persistPage,
	readStoredPage,
	storedPageRevision,
} from "../page-persistence";
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

describe("persistPage — page revision guard (S1-T04 wiring)", () => {
	const sentBody = (): Record<string, unknown> => {
		const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
		return JSON.parse(String(init?.body));
	};

	it("sends the record id and the expected revision on a draft and returns the new revision", async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ ok: true, data: { pageRevision: 4 } }), {
				status: 200,
			}),
		);

		const result = await persistPage("draft", docWith({}), {
			id: "home",
			expectedPageRevision: 3,
		});

		expect(result).toEqual({ ok: true, pageRevision: 4 });
		expect(sentBody()).toMatchObject({
			id: "home",
			expectedPageRevision: 3,
			slug: "my-new-page",
		});
	});

	it("sends the expected revision on a publish", async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ ok: true, data: { pageRevision: 1 } }), {
				status: 200,
			}),
		);

		const result = await persistPage("publish", docWith({}), {
			id: "home",
			expectedPageRevision: 0,
		});

		expect(result).toEqual({ ok: true, pageRevision: 1 });
		expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/pages/publish");
		expect(sentBody()).toMatchObject({ id: "home", expectedPageRevision: 0 });
	});

	it("never sends an id or an expected revision for a preview", async () => {
		await persistPage("preview", docWith({}), {
			id: "home",
			expectedPageRevision: 3,
		});

		const body = sentBody();
		expect(body).not.toHaveProperty("id");
		expect(body).not.toHaveProperty("expectedPageRevision");
	});

	it("makes no claim when the caller has no revision (legacy last-writer-wins)", async () => {
		await persistPage("draft", docWith({}));

		expect(sentBody()).not.toHaveProperty("expectedPageRevision");
	});

	it("reports a 409 revision conflict with both revisions and writes nothing else", async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					ok: false,
					code: "E_CONFLICT",
					message: "Page revision conflict: expected 3, stored 4.",
					issues: [
						{
							level: "error",
							code: "E_PAGE_REVISION_CONFLICT",
							message: "Page revision conflict: expected 3, stored 4.",
							path: ["expectedPageRevision"],
							expectedPageRevision: 3,
							currentPageRevision: 4,
						},
					],
				}),
				{ status: 409 },
			),
		);

		const result = await persistPage("draft", docWith({}), {
			id: "home",
			expectedPageRevision: 3,
		});

		expect(result).toEqual({
			ok: false,
			issue: "Page revision conflict: expected 3, stored 4.",
			conflict: { expectedPageRevision: 3, currentPageRevision: 4 },
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("treats another 409 (no revision issue) as a plain rejection", async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({ ok: false, code: "E_CONFLICT", message: "taken" }),
				{ status: 409 },
			),
		);

		const result = await persistPage("draft", docWith({}), {
			expectedPageRevision: 3,
		});

		expect(result).toEqual({ ok: false, issue: "taken" });
	});
});

describe("readStoredPage — what an opened page reads and must present", () => {
	it("reads the stored record and its pageRevision", async () => {
		const record = { id: "home", pageRevision: 7, draft: docWith({}) };
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ ok: true, data: record }), { status: 200 }),
		);

		const page = await readStoredPage("home");

		expect(page.status).toBe("found");
		expect(page.status === "found" && page.record.draft).toEqual(record.draft);
		expect(storedPageRevision(page)).toBe(7);
		expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/pages/home");
	});

	it("reads a legacy record without the field as revision 0", async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ ok: true, data: { schemaRevision: 2 } }), {
				status: 200,
			}),
		);

		expect(storedPageRevision(await readStoredPage("legacy"))).toBe(0);
	});

	it("reads a page with no record yet as absent, revision 0", async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ ok: false, code: "E_NOT_FOUND" }), {
				status: 404,
			}),
		);

		const page = await readStoredPage("page-new");

		expect(page).toEqual({ status: "absent" });
		expect(storedPageRevision(page)).toBe(0);
	});

	it("reports a failed read as unavailable (revision null), never a guess", async () => {
		fetchMock.mockResolvedValueOnce(new Response("nope", { status: 500 }));
		expect(await readStoredPage("home")).toEqual({ status: "unavailable" });

		fetchMock.mockRejectedValueOnce(new Error("offline"));
		const page = await readStoredPage("home");
		expect(page).toEqual({ status: "unavailable" });
		expect(storedPageRevision(page)).toBeNull();
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
