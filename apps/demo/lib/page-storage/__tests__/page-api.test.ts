import { describe, expect, it } from "vitest";
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
import { type DemoPageData, selectPublishedPayload } from "../types";
import { pageData } from "./adapter-contract";

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
