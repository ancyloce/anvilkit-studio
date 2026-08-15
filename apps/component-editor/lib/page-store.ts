import { resolve } from "node:path";
import { FileSystemPageStorageAdapter } from "./page-storage/filesystem-page-storage-adapter";
import { MemoryPageStorageAdapter } from "./page-storage/memory-page-storage-adapter";
import type { PageStorageAdapter } from "./page-storage/types";

/**
 * Adapter selection for the component editor (design 0022 §1.5). Same
 * contract as `apps/studio/lib/page-store.ts`, with the prefix-free
 * `PAGE_STORAGE` variable this app owns.
 *
 * The memoized promise gives one adapter instance per module instance.
 * That is why the default is the durable filesystem backend rather than
 * `memory`: under `next dev` each route module carries its own instance,
 * so an in-memory store is NOT shared between `/api/pages/draft` and
 * `/api/pages` (verified — the list comes back empty). `PAGE_STORAGE=memory`
 * stays available for hermetic unit/E2E runs, matching the studio app's
 * durable-by-default choice.
 */

let storagePromise: Promise<PageStorageAdapter> | null = null;

export function getPageStorage(): Promise<PageStorageAdapter> {
	if (storagePromise === null) {
		storagePromise = Promise.resolve(createAdapter());
	}
	return storagePromise;
}

function createAdapter(): PageStorageAdapter {
	const backend = process.env.PAGE_STORAGE ?? "filesystem";
	if (backend === "memory") {
		return new MemoryPageStorageAdapter();
	}
	const dir = resolve(
		process.cwd(),
		process.env.PAGE_STORAGE_DIR ?? ".anvilkit/pages",
	);
	return new FileSystemPageStorageAdapter({ dir });
}
