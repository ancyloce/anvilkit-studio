import type { PageRootProps } from "@anvilkit/schema";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { ensureSchema } from "../../db/client";
import { SqlitePageStorageAdapter } from "../sqlite-page-storage-adapter";
import type { DemoPageData } from "../types";

/**
 * Parity coverage for the SQLite backend. It reuses the same `record-ops`
 * helpers as the memory/filesystem adapters, so these assertions mirror the
 * draft/publish/archive/version semantics those backends already guarantee —
 * here proven over a real (in-memory) SQLite connection.
 */
function makeData(over: Partial<PageRootProps> = {}): DemoPageData {
	return {
		root: {
			props: {
				title: "Title",
				slug: "page",
				status: "draft",
				version: "1.0.0",
				parentFolder: "/",
				seo: { noIndex: false },
				...over,
			},
		},
		content: [],
		zones: {},
	} as DemoPageData;
}

function makeAdapter() {
	const connection = new Database(":memory:");
	ensureSchema(connection);
	let counter = 0;
	return new SqlitePageStorageAdapter({
		db: drizzle(connection),
		now: () => new Date("2026-06-26T00:00:00.000Z"),
		idFactory: () => `id-${++counter}`,
	});
}

describe("SqlitePageStorageAdapter", () => {
	let adapter: SqlitePageStorageAdapter;

	beforeEach(() => {
		adapter = makeAdapter();
	});

	it("saves a draft and reads it back by id and slug", async () => {
		const saved = await adapter.saveDraft({
			slug: "home",
			title: "Home",
			data: makeData({ slug: "home", title: "Home" }),
		});
		expect(saved.status).toBe("draft");
		expect(saved.id).toBe("id-1");
		expect(await adapter.getById("id-1")).toMatchObject({ slug: "home" });
		expect(await adapter.getBySlug("home")).toMatchObject({ id: "id-1" });
	});

	it("publishes a page (status + published payload) and lists by status", async () => {
		await adapter.publish({
			slug: "live",
			data: makeData({ slug: "live", status: "published" }),
		});
		const record = await adapter.getBySlug("live");
		expect(record?.status).toBe("published");
		expect(record?.published).toBeDefined();
		expect(record?.publishedAt).toBeDefined();

		await adapter.saveDraft({ slug: "wip", data: makeData({ slug: "wip" }) });
		expect(await adapter.list({ status: "published" })).toHaveLength(1);
		expect(await adapter.list({ status: "draft" })).toHaveLength(1);
		expect(await adapter.list()).toHaveLength(2);
	});

	it("updateSettings patches root.props onto stored payloads", async () => {
		const draft = await adapter.saveDraft({
			slug: "a",
			data: makeData({ slug: "a", title: "A" }),
		});
		const updated = await adapter.updateSettings(draft.id, {
			title: "Renamed",
			slug: "a",
			status: "draft",
			version: "1.0.0",
			parentFolder: "/",
			seo: { noIndex: false },
		});
		expect(updated?.title).toBe("Renamed");
		expect(
			(updated?.draft?.root.props as PageRootProps | undefined)?.title,
		).toBe("Renamed");
		expect(
			await adapter.updateSettings(
				"missing",
				makeData().root.props as PageRootProps,
			),
		).toBeNull();
	});

	it("archives a record (hidden from published selection)", async () => {
		const rec = await adapter.publish({
			slug: "x",
			data: makeData({ slug: "x", status: "published" }),
		});
		const archived = await adapter.archive(rec.id);
		expect(archived?.status).toBe("archived");
		expect(archived?.archivedAt).toBeDefined();
		expect(await adapter.archive("missing")).toBeNull();
	});

	it("deletes a record", async () => {
		const rec = await adapter.saveDraft({
			slug: "d",
			data: makeData({ slug: "d" }),
		});
		await adapter.delete(rec.id);
		expect(await adapter.getById(rec.id)).toBeNull();
	});

	it("duplicates a record under a new id + slug", async () => {
		const rec = await adapter.saveDraft({
			slug: "src",
			title: "Src",
			data: makeData({ slug: "src", title: "Src" }),
		});
		const copy = await adapter.duplicate(rec.id);
		expect(copy?.id).not.toBe(rec.id);
		expect(copy?.slug).toBe("src-copy");
		expect(copy?.status).toBe("draft");
		expect(await adapter.duplicate("missing")).toBeNull();
	});

	it("getVersion returns the record only when the version matches", async () => {
		const rec = await adapter.publish({
			slug: "v",
			data: makeData({ slug: "v", status: "published", version: "2.1.0" }),
		});
		expect(await adapter.getVersion(rec.id, "2.1.0")).toMatchObject({
			id: rec.id,
		});
		expect(await adapter.getVersion(rec.id, "9.9.9")).toBeNull();
	});

	it("persists across adapter instances over the same connection", async () => {
		const connection = new Database(":memory:");
		ensureSchema(connection);
		const db = drizzle(connection);
		const a = new SqlitePageStorageAdapter({ db, idFactory: () => "fixed" });
		await a.publish({
			slug: "keep",
			data: makeData({ slug: "keep", status: "published" }),
		});
		const b = new SqlitePageStorageAdapter({ db });
		expect(await b.getBySlug("keep")).toMatchObject({ id: "fixed" });
	});
});
