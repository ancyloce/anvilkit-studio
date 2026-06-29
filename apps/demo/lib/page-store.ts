import { resolve } from "node:path";
import { FileSystemPageStorageAdapter } from "./page-storage/filesystem-page-storage-adapter";
import { MemoryPageStorageAdapter } from "./page-storage/memory-page-storage-adapter";
import { SqlitePageStorageAdapter } from "./page-storage/sqlite-page-storage-adapter";
import {
	type DemoPageData,
	type PageStorageAdapter,
	selectPublishedPayload,
} from "./page-storage/types";
import { createDemoPagesData } from "./puck-demo";

export type { DemoPageData } from "./page-storage/types";

/**
 * Composition root for the demo's durable page pipeline (PRD 0004 F6/F7). The
 * MVP's module-level `Map` is gone: storage now sits behind a
 * {@link PageStorageAdapter}, selected at runtime so the same API routes and
 * render path work against either backend.
 *
 * - `ANVILKIT_PAGE_STORAGE=sqlite` (default) — durable
 *   {@link SqlitePageStorageAdapter} (Drizzle + better-sqlite3) at
 *   `ANVILKIT_PAGE_STORAGE_SQLITE_PATH` (default `.anvilkit/pages.sqlite`).
 * - `ANVILKIT_PAGE_STORAGE=filesystem` — durable
 *   {@link FileSystemPageStorageAdapter} under `ANVILKIT_PAGE_STORAGE_DIR`
 *   (default `.anvilkit/pages`); survives server restarts.
 * - `ANVILKIT_PAGE_STORAGE=memory` — ephemeral
 *   {@link MemoryPageStorageAdapter}; resets every process (used by tests).
 *
 * The adapter is created and seeded once per process; `getPageStorage()` returns
 * the memoized promise so every route and the public route share one instance.
 */
let storagePromise: Promise<PageStorageAdapter> | null = null;

export function getPageStorage(): Promise<PageStorageAdapter> {
	if (storagePromise === null) {
		storagePromise = createAndSeed();
	}
	return storagePromise;
}

function createAdapter(): PageStorageAdapter {
	const backend = process.env.ANVILKIT_PAGE_STORAGE ?? "sqlite";
	if (backend === "memory") {
		return new MemoryPageStorageAdapter();
	}
	if (backend === "filesystem") {
		const dir = resolve(
			process.cwd(),
			process.env.ANVILKIT_PAGE_STORAGE_DIR ?? ".anvilkit/pages",
		);
		return new FileSystemPageStorageAdapter({ dir });
	}
	return new SqlitePageStorageAdapter();
}

async function createAndSeed(): Promise<PageStorageAdapter> {
	const storage = createAdapter();
	await seedIfEmpty(storage);
	return storage;
}

/**
 * Seed the demo's example pages (as published records) only when the store is
 * empty. Memory starts empty every process; the sqlite/filesystem backends seed
 * just once, then persist. Keeps the existing `/home`, `/about`, … demo routes
 * working under every backend.
 *
 * Records are seeded with their `createDemoPagesData()` key as the record `id`
 * (`home`, `list`, `team`, …) so the editor's page rail — keyed by those same
 * stable ids — round-trips create/rename/delete/settings straight to storage
 * (the `ak-layer-page-row-<id>` contract the E2E suite asserts on).
 */
async function seedIfEmpty(storage: PageStorageAdapter): Promise<void> {
	const existing = await storage.list();
	if (existing.length > 0) return;
	for (const [id, data] of Object.entries(createDemoPagesData())) {
		const slug = data.root.props?.slug;
		if (slug === undefined || slug.length === 0) continue;
		await storage.publish({ id, slug, data });
	}
}

/**
 * The published document to render for `slug`, or `null` when nothing should be
 * served (no record, never published, or archived). `opts.preview` is the seam
 * for a future preview mode — it serves the in-progress draft and is never set
 * by the public render route.
 */
export async function getPublishedPage(
	slug: string,
	opts?: { preview?: boolean },
): Promise<DemoPageData | null> {
	return (await getPublishedPageWithId(slug, opts))?.data ?? null;
}

/**
 * Like {@link getPublishedPage}, but also surfaces the stored record `id` so
 * callers (e.g. the published render path) can attribute analytics by `pageId`
 * in addition to slug. Returns `null` on the same conditions as
 * {@link getPublishedPage} (no record, never published, or archived).
 */
export async function getPublishedPageWithId(
	slug: string,
	opts?: { preview?: boolean },
): Promise<{ id: string; data: DemoPageData } | null> {
	const storage = await getPageStorage();
	const record = await storage.getBySlug(slug);
	const data =
		opts?.preview === true
			? (record?.draft ?? selectPublishedPayload(record))
			: selectPublishedPayload(record);
	if (record === null || data === null || data === undefined) return null;
	return { id: record.id, data };
}
