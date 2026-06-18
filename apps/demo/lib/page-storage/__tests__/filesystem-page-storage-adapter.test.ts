import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileSystemPageStorageAdapter } from "../filesystem-page-storage-adapter";
import { pageData, runAdapterContractTests } from "./adapter-contract";

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "anvilkit-pages-"));
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

runAdapterContractTests(
	"FileSystemPageStorageAdapter",
	(opts) => new FileSystemPageStorageAdapter({ dir, ...opts }),
);

describe("FileSystemPageStorageAdapter — durability", () => {
	it("persists across a fresh adapter instance (server restart)", async () => {
		const first = new FileSystemPageStorageAdapter({ dir });
		const created = await first.publish({
			slug: "home",
			data: pageData("home", "Home", "published"),
		});

		// A brand-new instance over the same directory sees the persisted record.
		const second = new FileSystemPageStorageAdapter({ dir });
		const reread = await second.getBySlug("home");
		expect(reread?.id).toBe(created.id);
		expect(reread?.status).toBe("published");
	});

	it("writes one JSON file per record and removes it on delete", async () => {
		const adapter = new FileSystemPageStorageAdapter({ dir });
		const created = await adapter.saveDraft({
			slug: "home",
			data: pageData("home", "Home"),
		});
		const jsonFiles = () =>
			readdirSync(dir).filter(
				(f) => f.endsWith(".json") && !f.endsWith(".tmp"),
			);
		expect(jsonFiles()).toHaveLength(1);
		await adapter.delete(created.id);
		expect(jsonFiles()).toHaveLength(0);
	});

	it("returns an empty list when the directory does not yet exist", async () => {
		const adapter = new FileSystemPageStorageAdapter({
			dir: join(dir, "does-not-exist-yet"),
		});
		expect(await adapter.list()).toHaveLength(0);
		expect(await adapter.getBySlug("home")).toBeNull();
	});
});
