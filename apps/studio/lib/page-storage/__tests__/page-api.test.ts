import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { describe, expect, it } from "vitest";
import { ensureSchema } from "../../db/client";
import { MemoryPageStorageAdapter } from "../memory-page-storage-adapter";
import {
	archivePage,
	deletePage,
	duplicatePage,
	getPage,
	listPages,
	publish,
	saveDraft,
	updateSettings,
} from "../page-api";
import { SqlitePageStorageAdapter } from "../sqlite-page-storage-adapter";
import { type DemoPageData, selectPublishedPayload } from "../types";
import {
	localLibrary,
	lockedPageData,
	pageData,
	remoteHeroLock,
} from "./adapter-contract";

let counter = 0;
function freshStorage(): MemoryPageStorageAdapter {
	counter = 0;
	return new MemoryPageStorageAdapter({ idFactory: () => `id-${++counter}` });
}

const validRootProps = (slug = "home", title = "Home") => ({
	title,
	slug,
	status: "published" as const,
	version: "1.0.0",
	parentFolder: "/",
	seo: { noIndex: false },
});

describe("page-api: saveDraft", () => {
	it("persists a valid draft and returns ok:true", async () => {
		const storage = freshStorage();
		const result = await saveDraft(storage, {
			slug: "home",
			title: "Home",
			data: pageData("home", "Home"),
		});
		expect(result.status).toBe(200);
		expect(result.body.ok).toBe(true);
		if (result.body.ok) expect(result.body.data.slug).toBe("home");
	});

	it("rejects an invalid root.props with a 400 and structured issues", async () => {
		const storage = freshStorage();
		const result = await saveDraft(storage, {
			slug: "home",
			data: pageData("Bad Slug", "Home"),
		});
		expect(result.status).toBe(400);
		expect(result.body.ok).toBe(false);
		if (!result.body.ok) {
			expect(result.body.code).toBe("E_VALIDATION");
			expect(result.body.issues?.length).toBeGreaterThan(0);
		}
		// Nothing was written.
		expect(await storage.getBySlug("Bad Slug")).toBeNull();
	});
});

/**
 * S1-T04 (development plan 2026-09-12): the page API is the server-side
 * authority for the expected page revision and the remote-component lock.
 * These run against the SQLite adapter on a real in-memory connection — the
 * default backend behind `POST /api/pages/draft` — so the conflict is decided
 * by the store's `BEGIN IMMEDIATE` transaction, not by the caller.
 */
function sqliteStorage(): SqlitePageStorageAdapter {
	const connection = new Database(":memory:");
	ensureSchema(connection);
	let n = 0;
	return new SqlitePageStorageAdapter({
		db: drizzle(connection),
		idFactory: () => `page-${++n}`,
	});
}

describe("page-api: expected page revision and remote component lock", () => {
	it("returns the page revision with every write", async () => {
		const storage = sqliteStorage();
		const created = await saveDraft(storage, {
			slug: "home",
			data: lockedPageData("home"),
		});
		expect(created.status).toBe(200);
		if (created.body.ok) expect(created.body.data.pageRevision).toBe(1);
	});

	it("commits exactly one of two concurrent saves from the same revision and answers the other with a recoverable 409", async () => {
		const storage = sqliteStorage();
		const created = await saveDraft(storage, {
			slug: "home",
			data: lockedPageData("home"),
		});
		if (!created.body.ok) throw new Error("setup failed");
		const id = created.body.data.id;
		const attempt = (headline: string) =>
			saveDraft(storage, {
				id,
				slug: "home",
				data: {
					...lockedPageData("home"),
					content: [{ type: "RemoteHero", props: { id: "r", headline } }],
				},
				expectedPageRevision: 1,
			});
		const results = await Promise.all([
			attempt("editor A"),
			attempt("editor B"),
		]);
		const statuses = results.map((r) => r.status).sort();
		expect(statuses).toEqual([200, 409]);
		const conflict = results.find((r) => r.status === 409);
		expect(conflict?.body.ok).toBe(false);
		if (conflict && !conflict.body.ok) {
			expect(conflict.body.code).toBe("E_CONFLICT");
			expect(conflict.body.issues?.[0]).toMatchObject({
				code: "E_PAGE_REVISION_CONFLICT",
				expectedPageRevision: 1,
				currentPageRevision: 2,
			});
		}
		// Recovery: reload at the current revision and save again.
		const reloaded = await getPage(storage, id);
		if (!reloaded.body.ok) throw new Error("reload failed");
		expect(reloaded.body.data.pageRevision).toBe(2);
		const retry = await attempt("editor B, merged");
		expect(retry.status).toBe(409);
		const merged = await saveDraft(storage, {
			id,
			slug: "home",
			data: lockedPageData("home"),
			expectedPageRevision: reloaded.body.data.pageRevision,
		});
		expect(merged.status).toBe(200);
	});

	it("rejects an expectedPageRevision that is not a non-negative integer", async () => {
		const storage = sqliteStorage();
		for (const expectedPageRevision of [
			"1",
			-1,
			1.5,
			Number.MAX_SAFE_INTEGER + 1,
		]) {
			const result = await saveDraft(storage, {
				slug: "home",
				data: pageData("home", "Home"),
				expectedPageRevision,
			});
			expect(result.status).toBe(400);
			if (!result.body.ok) {
				expect(result.body.issues?.[0]).toMatchObject({
					path: ["expectedPageRevision"],
				});
			}
		}
		expect(await storage.getBySlug("home")).toBeNull();
	});

	it("never writes a remoteComponentLock the host cannot read", async () => {
		const storage = sqliteStorage();
		const cases: unknown[] = [
			{ schemaVersion: 2, entries: [] },
			{ schemaVersion: 1, entries: [], extra: true },
			{
				schemaVersion: 1,
				entries: [{ ...remoteHeroLock.entries[0], packageVersion: "^0.2.2" }],
			},
			{
				schemaVersion: 1,
				entries: [
					{
						...remoteHeroLock.entries[0],
						releaseManifestDigest: "sha256:short",
					},
				],
			},
			{
				schemaVersion: 1,
				entries: [remoteHeroLock.entries[0], remoteHeroLock.entries[0]],
			},
			"a string",
		];
		for (const [index, lock] of cases.entries()) {
			const result = await saveDraft(storage, {
				slug: `bad-${index}`,
				data: lockedPageData(`bad-${index}`, lock),
			});
			expect(result.status).toBe(400);
			if (!result.body.ok) {
				expect(result.body.code).toBe("E_VALIDATION");
				expect(result.body.issues?.[0]).toMatchObject({
					code: "E_PAGE_REMOTE_LOCK_INVALID",
					path: ["data", "root", "props", "remoteComponentLock"],
				});
			}
			expect(await storage.getBySlug(`bad-${index}`)).toBeNull();
		}
		// The publish path applies the same guard.
		const published = await publish(storage, {
			slug: "bad-publish",
			data: lockedPageData("bad-publish", cases[0]),
		});
		expect(published.status).toBe(400);
	});

	it("saves and reopens the exact lock, local definitions and an unresolvable node", async () => {
		const storage = sqliteStorage();
		const data = lockedPageData("locked");
		const created = await saveDraft(storage, { slug: "locked", data });
		expect(created.status).toBe(200);
		if (!created.body.ok) throw new Error("save failed");
		expect(created.body.warnings).toBeUndefined();
		const reopened = await getPage(storage, created.body.data.id);
		if (!reopened.body.ok) throw new Error("reopen failed");
		const props = reopened.body.data.draft?.root.props as Record<
			string,
			unknown
		>;
		expect(props.remoteComponentLock).toEqual(remoteHeroLock);
		expect(props.componentLibrary).toEqual(localLibrary);
		expect(reopened.body.data.draft?.content).toEqual(data.content);
	});

	it("preserves a stored lock it cannot read, reports it, and keeps the unresolvable node", async () => {
		const storage = sqliteStorage();
		// Legacy data reaches storage below the API, exactly as a row written
		// by an earlier build would; the API itself refuses to write it.
		const malformed = {
			schemaVersion: 1,
			entries: [{ puckType: "RemoteHero" }],
		};
		const legacy = await storage.saveDraft({
			slug: "legacy",
			data: lockedPageData("legacy", malformed),
		});
		const result = await saveDraft(storage, {
			id: legacy.id,
			slug: "legacy",
			data: lockedPageData("legacy"),
			expectedPageRevision: legacy.pageRevision,
		});
		expect(result.status).toBe(200);
		if (!result.body.ok) throw new Error("save failed");
		expect(result.body.warnings).toEqual([
			expect.objectContaining({
				code: "E_PAGE_REMOTE_LOCK_UNREADABLE",
				path: ["draft", "root", "props", "remoteComponentLock"],
			}),
		]);
		const props = result.body.data.draft?.root.props as Record<string, unknown>;
		expect(props.remoteComponentLock).toEqual(malformed);
		expect(props.componentLibrary).toEqual(localLibrary);
		expect(result.body.data.draft?.content).toEqual(
			lockedPageData("legacy").content,
		);
		// A plain settings edit (PATCH) leaves the lock and the nodes alone too.
		const settings = await updateSettings(storage, legacy.id, {
			...validRootProps("legacy", "Renamed"),
			status: "draft",
		});
		expect(settings.status).toBe(200);
		if (settings.body.ok) {
			const after = settings.body.data.draft?.root.props as Record<
				string,
				unknown
			>;
			expect(after.remoteComponentLock).toEqual(malformed);
			expect(after.componentLibrary).toEqual(localLibrary);
			expect(after.title).toBe("Renamed");
			expect(settings.body.data.pageRevision).toBe(3);
		}
	});
});

describe("page-api: publish", () => {
	it("publishes a valid complete document", async () => {
		const storage = freshStorage();
		const result = await publish(storage, {
			slug: "home",
			data: pageData("home", "Home", "published"),
		});
		expect(result.status).toBe(200);
		expect(result.body.ok).toBe(true);
		if (result.body.ok) expect(result.body.data.status).toBe("published");
	});

	it("rejects a malformed document before writing", async () => {
		const storage = freshStorage();
		const bad = { root: { props: validRootProps() }, content: "nope" };
		const result = await publish(storage, { slug: "home", data: bad });
		expect(result.status).toBe(400);
		expect(result.body.ok).toBe(false);
		expect(await storage.getBySlug("home")).toBeNull();
	});
});

describe("page-api: published-render lookup", () => {
	it("serves nothing for a draft, the payload once published, nothing once archived", async () => {
		const storage = freshStorage();
		const draft = await storage.saveDraft({
			slug: "home",
			data: pageData("home", "Home"),
		});
		expect(selectPublishedPayload(draft)).toBeNull();

		await publish(storage, {
			slug: "home",
			data: pageData("home", "Home", "published"),
		});
		const published = await storage.getBySlug("home");
		expect(selectPublishedPayload(published)).not.toBeNull();

		await archivePage(storage, published?.id ?? "");
		const archived = await storage.getBySlug("home");
		expect(selectPublishedPayload(archived)).toBeNull();
	});
});

describe("page-api: list & get", () => {
	it("lists summaries without heavy payloads", async () => {
		const storage = freshStorage();
		await publish(storage, {
			slug: "home",
			data: pageData("home", "Home", "published"),
		});
		const result = await listPages(storage, {});
		expect(result.body.ok).toBe(true);
		if (result.body.ok) {
			expect(result.body.data).toHaveLength(1);
			expect(result.body.data[0]).not.toHaveProperty("published");
			expect(result.body.data[0]).not.toHaveProperty("draft");
		}
	});

	it("resolves a page by slug and 404s when missing", async () => {
		const storage = freshStorage();
		await publish(storage, {
			slug: "home",
			data: pageData("home", "Home", "published"),
		});
		const bySlug = await getPage(storage, "home");
		expect(bySlug.status).toBe(200);
		const missing = await getPage(storage, "ghost");
		expect(missing.status).toBe(404);
		expect(missing.body.ok).toBe(false);
		if (!missing.body.ok) expect(missing.body.code).toBe("E_NOT_FOUND");
	});
});

describe("page-api: settings", () => {
	it("applies valid settings and patches the published payload", async () => {
		const storage = freshStorage();
		const created = await storage.publish({
			slug: "home",
			data: pageData("home", "Home", "published"),
		});
		const result = await updateSettings(storage, created.id, {
			...validRootProps("home", "Renamed"),
			seo: { noIndex: false, title: "Renamed SEO" },
		});
		expect(result.status).toBe(200);
		if (result.body.ok) {
			expect(result.body.data.title).toBe("Renamed");
			expect(
				(result.body.data.published as DemoPageData).root.props?.seo?.title,
			).toBe("Renamed SEO");
		}
	});

	it("rejects invalid settings and 404s on an unknown id", async () => {
		const storage = freshStorage();
		const bad = await updateSettings(storage, "id-1", {
			...validRootProps(),
			status: "live",
		});
		expect(bad.status).toBe(400);
		const missing = await updateSettings(storage, "ghost", validRootProps());
		expect(missing.status).toBe(404);
	});
});

describe("page-api: duplicate / archive / delete", () => {
	it("duplicates, then 409s on a slug clash", async () => {
		const storage = freshStorage();
		const created = await storage.publish({
			slug: "home",
			data: pageData("home", "Home", "published"),
		});
		const copy = await duplicatePage(storage, created.id);
		expect(copy.status).toBe(201);
		if (copy.body.ok) expect(copy.body.data.slug).toBe("home-copy");
		const clash = await duplicatePage(storage, created.id);
		expect(clash.status).toBe(409);
		if (!clash.body.ok) expect(clash.body.code).toBe("E_CONFLICT");
	});

	it("archives and deletes, 404ing on unknown ids", async () => {
		const storage = freshStorage();
		const created = await storage.publish({
			slug: "home",
			data: pageData("home", "Home", "published"),
		});
		expect((await archivePage(storage, created.id)).status).toBe(200);
		expect((await archivePage(storage, "ghost")).status).toBe(404);

		const del = await deletePage(storage, created.id);
		expect(del.status).toBe(200);
		expect(del.body.ok).toBe(true);
		expect((await deletePage(storage, created.id)).status).toBe(404);
	});
});
