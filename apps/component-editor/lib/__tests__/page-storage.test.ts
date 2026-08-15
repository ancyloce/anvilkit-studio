/**
 * P0-03 acceptance (plan 0036): draft / publish / list / duplicate work on
 * the selected adapter. Exercises the pure handlers the route modules call,
 * against both adapters this app ships (design 0022 §1.5).
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { FileSystemPageStorageAdapter } from "../page-storage/filesystem-page-storage-adapter";
import { MemoryPageStorageAdapter } from "../page-storage/memory-page-storage-adapter";
import {
	duplicatePage,
	listPages,
	publish,
	saveDraft,
} from "../page-storage/page-api";
import type { EditorPageData, PageStorageAdapter } from "../page-storage/types";

const documentOf = (title: string): EditorPageData =>
	({
		root: {
			props: {
				title,
				slug: "sample",
				description: "",
				status: "draft",
				version: "1",
			},
		},
		content: [
			{
				type: "Badge",
				props: { id: "badge-1", label: title, variant: "default" },
			},
		],
		zones: {},
	}) as unknown as EditorPageData;

const tempDirs: string[] = [];

async function makeFilesystemAdapter(): Promise<PageStorageAdapter> {
	const dir = await mkdtemp(join(tmpdir(), "ce-pages-"));
	tempDirs.push(dir);
	return new FileSystemPageStorageAdapter({ dir });
}

afterAll(async () => {
	await Promise.all(
		tempDirs.map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

const backends: [string, () => Promise<PageStorageAdapter>][] = [
	["memory", async () => new MemoryPageStorageAdapter()],
	["filesystem", makeFilesystemAdapter],
];

describe.each(backends)("page storage — %s adapter (P0-03)", (_name, make) => {
	it("saves a draft, lists it, publishes it, and duplicates it", async () => {
		const storage = await make();

		const draft = await saveDraft(storage, {
			slug: "sample",
			data: documentOf("Draft title"),
		});
		expect(draft.status).toBe(200);
		const draftRecord = (draft.body as { data: { id: string; status: string } })
			.data;
		expect(draftRecord.status).toBe("draft");

		const listed = await listPages(storage, {});
		expect(listed.status).toBe(200);
		expect((listed.body as { data: unknown[] }).data).toHaveLength(1);

		const published = await publish(storage, {
			id: draftRecord.id,
			slug: "sample",
			data: documentOf("Published title"),
		});
		expect(published.status).toBe(200);
		expect((published.body as { data: { status: string } }).data.status).toBe(
			"published",
		);

		// 201: duplicate creates a new record (the other handlers return 200).
		const duplicated = await duplicatePage(storage, draftRecord.id, {});
		expect(duplicated.status).toBe(201);
		const copy = (duplicated.body as { data: { id: string; slug: string } })
			.data;
		expect(copy.id).not.toBe(draftRecord.id);
		expect(copy.slug).not.toBe("sample");

		const afterCopy = await listPages(storage, {});
		expect((afterCopy.body as { data: unknown[] }).data).toHaveLength(2);
	});

	it("round-trips the stored document through the adapter", async () => {
		const storage = await make();
		await saveDraft(storage, {
			slug: "round-trip",
			data: documentOf("Round trip"),
		});
		// A record keeps the draft and published documents apart — an
		// unpublished save lands in `draft` and leaves `published` unset.
		const record = await storage.getBySlug("round-trip");
		expect(record).not.toBeNull();
		expect(record?.published).toBeUndefined();
		expect(record?.draft?.content).toHaveLength(1);
		expect(record?.draft?.content[0]?.props.label).toBe("Round trip");
	});
});
