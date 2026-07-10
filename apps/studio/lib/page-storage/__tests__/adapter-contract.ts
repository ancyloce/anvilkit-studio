import { describe, expect, it } from "vitest";
import {
	type DemoPageData,
	type PageStatus,
	type PageStorageAdapter,
	selectPublishedPayload,
} from "../types";

export interface ContractAdapterOptions {
	now: () => Date;
	idFactory: () => string;
}

type CreateAdapter = (
	opts: ContractAdapterOptions,
) => PageStorageAdapter | Promise<PageStorageAdapter>;

/** Deterministic clock + id factory, fresh per test. */
function freshOpts(): ContractAdapterOptions {
	let tick = 0;
	let n = 0;
	const base = Date.UTC(2026, 0, 1);
	return {
		now: () => new Date(base + tick++ * 1000),
		idFactory: () => `id-${++n}`,
	};
}

export function pageData(
	slug: string,
	title: string,
	status: PageStatus = "draft",
): DemoPageData {
	return {
		root: {
			props: {
				title,
				slug,
				status,
				version: "1.0.0",
				parentFolder: "/",
				seo: { noIndex: false },
			},
		},
		content: [{ type: "Hero", props: { id: `${slug}-hero` } }],
	} as unknown as DemoPageData;
}

/**
 * Shared behavioral contract every {@link PageStorageAdapter} must satisfy. Run
 * against both the memory and filesystem adapters so they can never diverge.
 */
export function runAdapterContractTests(
	label: string,
	createAdapter: CreateAdapter,
): void {
	describe(`${label} — PageStorageAdapter contract`, () => {
		it("saves a new draft (status draft, no published payload)", async () => {
			const storage = await createAdapter(freshOpts());
			const record = await storage.saveDraft({
				slug: "home",
				title: "Home",
				data: pageData("home", "Home"),
			});
			expect(record.id).toBeTruthy();
			expect(record.slug).toBe("home");
			expect(record.status).toBe("draft");
			expect(record.draft).toBeDefined();
			expect(record.published).toBeUndefined();
			expect(record.createdAt).toBeTruthy();
		});

		it("looks up by id and by slug", async () => {
			const storage = await createAdapter(freshOpts());
			const created = await storage.saveDraft({
				slug: "about",
				data: pageData("about", "About"),
			});
			expect((await storage.getById(created.id))?.slug).toBe("about");
			expect((await storage.getBySlug("about"))?.id).toBe(created.id);
			expect(await storage.getById("missing")).toBeNull();
			expect(await storage.getBySlug("missing")).toBeNull();
		});

		it("publishes a draft into the published payload", async () => {
			const storage = await createAdapter(freshOpts());
			const record = await storage.publish({
				slug: "home",
				data: pageData("home", "Home", "published"),
			});
			expect(record.status).toBe("published");
			expect(record.published).toBeDefined();
			expect(record.publishedAt).toBeTruthy();
			expect(record.version).toBe("1.0.0");
			expect(selectPublishedPayload(record)).not.toBeNull();
		});

		it("keeps draft and published payloads separate", async () => {
			const storage = await createAdapter(freshOpts());
			const published = await storage.publish({
				slug: "home",
				data: pageData("home", "Published Title", "published"),
			});
			// Save a draft with a different title — published must not change.
			const draft = pageData("home", "Draft Title");
			const updated = await storage.saveDraft({ slug: "home", data: draft });
			expect(updated.status).toBe("published");
			const publishedTitle = (updated.published as DemoPageData).root.props
				?.title;
			const draftTitle = (updated.draft as DemoPageData).root.props?.title;
			expect(publishedTitle).toBe("Published Title");
			expect(draftTitle).toBe("Draft Title");
			// The render selector still serves the old published payload.
			const serve = selectPublishedPayload(updated) as DemoPageData;
			expect(serve.root.props?.title).toBe("Published Title");
			expect(published.id).toBe(updated.id);
		});

		it("lists records and filters by status", async () => {
			const storage = await createAdapter(freshOpts());
			await storage.publish({
				slug: "live",
				data: pageData("live", "Live", "published"),
			});
			await storage.saveDraft({ slug: "wip", data: pageData("wip", "WIP") });
			expect(await storage.list()).toHaveLength(2);
			const published = await storage.list({ status: "published" });
			expect(published).toHaveLength(1);
			expect(published[0]?.slug).toBe("live");
			expect(await storage.list({ status: "draft" })).toHaveLength(1);
		});

		it("updates settings and patches existing payloads", async () => {
			const storage = await createAdapter(freshOpts());
			const created = await storage.publish({
				slug: "home",
				data: pageData("home", "Home", "published"),
			});
			const updated = await storage.updateSettings(created.id, {
				title: "Renamed",
				slug: "home",
				status: "published",
				version: "2.0.0",
				parentFolder: "/",
				seo: { noIndex: false, title: "Renamed SEO" },
			});
			expect(updated?.title).toBe("Renamed");
			expect(updated?.version).toBe("2.0.0");
			expect((updated?.published as DemoPageData).root.props?.seo?.title).toBe(
				"Renamed SEO",
			);
			expect(
				await storage.updateSettings("missing", {
					title: "x",
					slug: "x",
					status: "draft",
					version: "1",
					parentFolder: "/",
					seo: { noIndex: false },
				}),
			).toBeNull();
		});

		it("archives a page so it stops being served", async () => {
			const storage = await createAdapter(freshOpts());
			const created = await storage.publish({
				slug: "home",
				data: pageData("home", "Home", "published"),
			});
			const archived = await storage.archive(created.id);
			expect(archived?.status).toBe("archived");
			expect(archived?.archivedAt).toBeTruthy();
			expect(archived?.published).toBeDefined();
			expect(selectPublishedPayload(archived)).toBeNull();
			expect(await storage.archive("missing")).toBeNull();
		});

		it("deletes a record", async () => {
			const storage = await createAdapter(freshOpts());
			const created = await storage.saveDraft({
				slug: "home",
				data: pageData("home", "Home"),
			});
			await storage.delete(created.id);
			expect(await storage.getById(created.id)).toBeNull();
			// Deleting a missing record is a no-op.
			await expect(storage.delete("missing")).resolves.toBeUndefined();
		});

		it("duplicates into a new draft under a derived slug", async () => {
			const storage = await createAdapter(freshOpts());
			const source = await storage.publish({
				slug: "home",
				data: pageData("home", "Home", "published"),
			});
			const copy = await storage.duplicate(source.id);
			expect(copy?.id).not.toBe(source.id);
			expect(copy?.slug).toBe("home-copy");
			expect(copy?.status).toBe("draft");
			expect((copy?.draft as DemoPageData).root.props?.slug).toBe("home-copy");
			const custom = await storage.duplicate(source.id, {
				slug: "home-2",
				title: "Home Two",
			});
			expect(custom?.slug).toBe("home-2");
			expect(custom?.title).toBe("Home Two");
			expect(await storage.duplicate("missing")).toBeNull();
		});

		it("returns a record by version only on an exact match", async () => {
			const storage = await createAdapter(freshOpts());
			const created = await storage.publish({
				slug: "home",
				data: pageData("home", "Home", "published"),
			});
			expect((await storage.getVersion(created.id, "1.0.0"))?.id).toBe(
				created.id,
			);
			expect(await storage.getVersion(created.id, "9.9.9")).toBeNull();
			expect(await storage.getVersion("missing", "1.0.0")).toBeNull();
		});

		it("isolates internal state from returned records", async () => {
			const storage = await createAdapter(freshOpts());
			const created = await storage.saveDraft({
				slug: "home",
				data: pageData("home", "Home"),
			});
			created.title = "MUTATED";
			const draftRoot = (created.draft as DemoPageData).root;
			if (draftRoot.props !== undefined) draftRoot.props.title = "MUTATED";
			const reread = await storage.getById(created.id);
			expect(reread?.title).toBe("Home");
			expect((reread?.draft as DemoPageData).root.props?.title).toBe("Home");
		});
	});
}
