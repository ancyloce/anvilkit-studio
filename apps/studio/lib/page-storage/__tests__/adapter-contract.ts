import { describe, expect, it } from "vitest";
import {
	type DemoPageData,
	PageRevisionConflictError,
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

/** A valid `RemoteComponentLockV1` pinning one remote Hero release. */
export const remoteHeroLock = {
	schemaVersion: 1,
	entries: [
		{
			componentId: "cmp-hero-fixture",
			puckType: "RemoteHero",
			releaseId: "release-hero-0.2.2",
			packageVersion: "0.2.2",
			releaseManifestDigest: `sha256:${"a".repeat(64)}`,
			hostProfileId: "studio-host-v1",
		},
	],
} as const;

/** A document-local reusable definition beside the lock (`componentLibrary`). */
export const localLibrary = {
	schemaVersion: 1,
	definitions: [{ id: "def-1", name: "Local card", root: { type: "Text" } }],
} as const;

/**
 * The S1-T04 save/reopen fixture (DD-05 §6.5.2): a remote component pinned by
 * the lock, a local reusable definition, a node of a type the host cannot
 * resolve (with private props), and, when `lock` is overridden, whatever lock
 * value the caller wants stored.
 */
export function lockedPageData(
	slug: string,
	lock: unknown = remoteHeroLock,
): DemoPageData {
	const data = pageData(slug, "Locked") as unknown as {
		root: { props: Record<string, unknown> };
		content: unknown[];
	};
	data.root.props.componentLibrary = structuredClone(localLibrary);
	data.root.props.remoteComponentLock = structuredClone(lock);
	data.content = [
		{ type: "RemoteHero", props: { id: `${slug}-remote`, headline: "Pinned" } },
		{
			type: "NotInstalledAnywhere",
			props: { id: `${slug}-orphan`, keep: { exact: [42, "bytes"] } },
		},
	];
	return data as unknown as DemoPageData;
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
			expect(
				(updated?.published as DemoPageData | undefined)?.root.props?.seo
					?.title,
			).toBe("Renamed SEO");
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
			expect((copy?.draft as DemoPageData | undefined)?.root.props?.slug).toBe(
				"home-copy",
			);
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

		it("stamps pageRevision 1 on create and advances it on every write", async () => {
			const storage = await createAdapter(freshOpts());
			const created = await storage.saveDraft({
				slug: "home",
				data: pageData("home", "Home"),
			});
			expect(created.pageRevision).toBe(1);
			const saved = await storage.saveDraft({
				id: created.id,
				slug: "home",
				data: pageData("home", "Home again"),
			});
			expect(saved.pageRevision).toBe(2);
			const published = await storage.publish({
				id: created.id,
				data: pageData("home", "Home", "published"),
			});
			expect(published.pageRevision).toBe(3);
			expect((await storage.getById(created.id))?.pageRevision).toBe(3);
		});

		it("commits exactly one of two saves made from the same page revision", async () => {
			const storage = await createAdapter(freshOpts());
			const created = await storage.saveDraft({
				slug: "home",
				data: lockedPageData("home"),
			});
			const attempt = (headline: string) =>
				storage
					.saveDraft({
						id: created.id,
						slug: "home",
						data: {
							...lockedPageData("home"),
							content: [{ type: "RemoteHero", props: { id: "x", headline } }],
						} as unknown as DemoPageData,
						expectedPageRevision: created.pageRevision,
					})
					.then(
						(record) => ({ ok: true as const, record }),
						(error: unknown) => ({ ok: false as const, error }),
					);
			const [first, second] = await Promise.all([
				attempt("editor A"),
				attempt("editor B"),
			]);
			const outcomes = [first, second];
			const wins = outcomes.filter((o) => o.ok);
			const losses = outcomes.filter((o) => !o.ok);
			expect(wins).toHaveLength(1);
			expect(losses).toHaveLength(1);
			const loss = losses[0];
			if (loss !== undefined && !loss.ok) {
				expect(loss.error).toBeInstanceOf(PageRevisionConflictError);
				const conflict = loss.error as PageRevisionConflictError;
				expect(conflict.expectedPageRevision).toBe(1);
				expect(conflict.currentPageRevision).toBe(2);
			}
			// The stored page is the winner's, at revision 2, and nothing of the
			// loser landed.
			const stored = await storage.getById(created.id);
			expect(stored?.pageRevision).toBe(2);
			const win = wins[0];
			if (win?.ok) {
				expect(stored?.draft).toEqual(win.record.draft);
			}
			// The loser recovers by reloading at the current revision.
			const retry = await storage.saveDraft({
				id: created.id,
				slug: "home",
				data: lockedPageData("home"),
				expectedPageRevision: 2,
			});
			expect(retry.pageRevision).toBe(3);
		});

		it("refuses a stale expected revision on publish without writing", async () => {
			const storage = await createAdapter(freshOpts());
			const created = await storage.saveDraft({
				slug: "home",
				data: pageData("home", "Home"),
			});
			await expect(
				storage.publish({
					id: created.id,
					data: pageData("home", "Home", "published"),
					expectedPageRevision: 7,
				}),
			).rejects.toBeInstanceOf(PageRevisionConflictError);
			const stored = await storage.getById(created.id);
			expect(stored?.status).toBe("draft");
			expect(stored?.pageRevision).toBe(1);
		});

		it("treats a record that does not exist yet as revision 0", async () => {
			const storage = await createAdapter(freshOpts());
			await expect(
				storage.saveDraft({
					slug: "new",
					data: pageData("new", "New"),
					expectedPageRevision: 1,
				}),
			).rejects.toBeInstanceOf(PageRevisionConflictError);
			expect(await storage.getBySlug("new")).toBeNull();
			const created = await storage.saveDraft({
				slug: "new",
				data: pageData("new", "New"),
				expectedPageRevision: 0,
			});
			expect(created.pageRevision).toBe(1);
		});

		it("saves and reopens the exact lock, local definitions and unresolvable nodes", async () => {
			const storage = await createAdapter(freshOpts());
			const data = lockedPageData("locked");
			const created = await storage.saveDraft({ slug: "locked", data });
			const reopened = await storage.getById(created.id);
			const props = reopened?.draft?.root.props as
				| Record<string, unknown>
				| undefined;
			expect(props?.remoteComponentLock).toEqual(remoteHeroLock);
			expect(props?.componentLibrary).toEqual(localLibrary);
			expect(reopened?.draft?.content).toEqual(data.content);
			// Publishing carries the same document into the live payload.
			const published = await storage.publish({
				id: created.id,
				data: {
					...data,
					root: { props: { ...data.root.props, status: "published" } },
				} as DemoPageData,
				expectedPageRevision: created.pageRevision,
			});
			const live = selectPublishedPayload(published);
			expect(live).not.toBeNull();
			if (live === null) return;
			expect(
				(live.root.props as Record<string, unknown>).remoteComponentLock,
			).toEqual(remoteHeroLock);
			expect(live.content).toEqual(data.content);
		});

		it("preserves a stored lock it cannot read instead of replacing it", async () => {
			const storage = await createAdapter(freshOpts());
			const malformed = { schemaVersion: 2, entries: "not-an-array" };
			// The malformed value reaches storage the way legacy data would: the
			// adapter itself does not validate the lock (the page API does).
			const created = await storage.saveDraft({
				slug: "legacy",
				data: lockedPageData("legacy", malformed),
			});
			const saved = await storage.saveDraft({
				id: created.id,
				slug: "legacy",
				data: lockedPageData("legacy"),
				expectedPageRevision: created.pageRevision,
			});
			const props = saved.draft?.root.props as
				| Record<string, unknown>
				| undefined;
			expect(props?.remoteComponentLock).toEqual(malformed);
			expect(props?.componentLibrary).toEqual(localLibrary);
			expect(saved.draft?.content).toEqual(lockedPageData("legacy").content);
			const reopened = await storage.getById(created.id);
			const reopenedProps = reopened?.draft?.root.props as
				| Record<string, unknown>
				| undefined;
			expect(reopenedProps?.remoteComponentLock).toEqual(malformed);
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
			expect(
				(reread?.draft as DemoPageData | undefined)?.root.props?.title,
			).toBe("Home");
		});
	});
}
