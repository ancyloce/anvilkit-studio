import { resolve } from "node:path";
import { FileSystemPageStorageAdapter } from "./page-storage/filesystem-page-storage-adapter";
import { MemoryPageStorageAdapter } from "./page-storage/memory-page-storage-adapter";
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
 * - `ANVILKIT_PAGE_STORAGE=memory` (default) — ephemeral
 *   {@link MemoryPageStorageAdapter}; preserves the demo's prior behavior.
 * - `ANVILKIT_PAGE_STORAGE=filesystem` — durable
 *   {@link FileSystemPageStorageAdapter} under `ANVILKIT_PAGE_STORAGE_DIR`
 *   (default `.anvilkit/pages`); survives server restarts.
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
	const backend = process.env.ANVILKIT_PAGE_STORAGE ?? "memory";
	if (backend === "filesystem") {
		const dir = resolve(
			process.cwd(),
			process.env.ANVILKIT_PAGE_STORAGE_DIR ?? ".anvilkit/pages",
		);
		return new FileSystemPageStorageAdapter({ dir });
	}
	return new MemoryPageStorageAdapter();
}

async function createAndSeed(): Promise<PageStorageAdapter> {
	const storage = createAdapter();
	await seedIfEmpty(storage);
	return storage;
}

/**
 * Seed the demo's example pages (as published records) only when the store is
 * empty. Memory starts empty every process; the filesystem backend seeds just
 * once, then persists. Keeps the existing `/home`, `/about`, … demo routes
 * working under both backends.
 */
async function seedIfEmpty(storage: PageStorageAdapter): Promise<void> {
	const existing = await storage.list();
	if (existing.length > 0) return;
	for (const data of Object.values(createDemoPagesData())) {
		const slug = data.root.props?.slug;
		if (slug === undefined || slug.length === 0) continue;
		await storage.publish({ slug, data });
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
	const storage = await getPageStorage();
	const record = await storage.getBySlug(slug);
	if (opts?.preview === true) {
		return record?.draft ?? selectPublishedPayload(record);
	}
	return selectPublishedPayload(record);
}
