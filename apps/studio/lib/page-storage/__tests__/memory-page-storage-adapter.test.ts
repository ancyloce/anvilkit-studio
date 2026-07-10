import { describe, expect, it } from "vitest";
import { MemoryPageStorageAdapter } from "../memory-page-storage-adapter";
import type { PageRecord } from "../types";
import { pageData, runAdapterContractTests } from "./adapter-contract";

runAdapterContractTests(
	"MemoryPageStorageAdapter",
	(opts) => new MemoryPageStorageAdapter(opts),
);

describe("MemoryPageStorageAdapter — seeding", () => {
	it("serves records passed to the constructor seed", async () => {
		const seed: PageRecord = {
			id: "seed-1",
			slug: "seeded",
			title: "Seeded",
			status: "published",
			version: "1.0.0",
			published: pageData("seeded", "Seeded", "published"),
			draft: pageData("seeded", "Seeded", "published"),
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
			publishedAt: "2026-01-01T00:00:00.000Z",
		};
		const adapter = new MemoryPageStorageAdapter({ seed: [seed] });
		expect((await adapter.getBySlug("seeded"))?.id).toBe("seed-1");
		expect(await adapter.list()).toHaveLength(1);
	});

	it("does not alias the seed array's records", async () => {
		const seed: PageRecord = {
			id: "seed-1",
			slug: "seeded",
			title: "Seeded",
			status: "draft",
			version: "1.0.0",
			draft: pageData("seeded", "Seeded"),
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		};
		const adapter = new MemoryPageStorageAdapter({ seed: [seed] });
		seed.title = "MUTATED";
		expect((await adapter.getById("seed-1"))?.title).toBe("Seeded");
	});
});
