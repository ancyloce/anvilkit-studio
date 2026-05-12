import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	type RegistryEntry,
	RegistryEntrySchema,
	RegistryFeedSchema,
} from "../../src/registry/feed.schema.ts";

const here = dirname(fileURLToPath(import.meta.url));
const FEED_PATH = join(here, "..", "..", "src", "registry", "feed.json");

function loadFeed(): unknown {
	if (!existsSync(FEED_PATH)) {
		throw new Error(
			`feed.json missing at ${FEED_PATH}. Run \`pnpm --filter @anvilkit/docs-site generate:registry\` first.`,
		);
	}
	return JSON.parse(readFileSync(FEED_PATH, "utf8"));
}

describe("registry feed", () => {
	const raw = loadFeed();

	it("parses against the canonical Zod schema", () => {
		const result = RegistryFeedSchema.safeParse(raw);
		if (!result.success) {
			throw new Error(`feed.json failed schema: ${result.error.message}`);
		}
		expect(result.data.feedVersion).toBe("1");
	});

	const feed = RegistryFeedSchema.parse(raw);

	// Templates are workspace-only (not published to npm) and are
	// intentionally excluded from the marketplace feed.
	it("contains 0 templates, 7 plugins, 11 components", () => {
		const counts = feed.entries.reduce(
			(acc, e) => {
				acc[e.kind]++;
				return acc;
			},
			{ template: 0, plugin: 0, component: 0 } as Record<
				RegistryEntry["kind"],
				number
			>,
		);
		expect(counts).toEqual({ template: 0, plugin: 7, component: 11 });
	});

	it("marks every first-party entry as verified", () => {
		for (const entry of feed.entries) {
			if (entry.publisher === "first-party") {
				expect(entry.verified, entry.slug).toBe(true);
			}
		}
	});

	it("uses unique (kind, slug) pairs", () => {
		const seen = new Set<string>();
		for (const entry of feed.entries) {
			const key = `${entry.kind}:${entry.slug}`;
			expect(seen.has(key), `duplicate ${key}`).toBe(false);
			seen.add(key);
		}
	});

	it("emits @anvilkit/* package names for first-party entries", () => {
		for (const entry of feed.entries) {
			if (entry.publisher !== "first-party") continue;
			expect(entry.packageName.startsWith("@anvilkit/"), entry.slug).toBe(true);
		}
	});

	it("re-parses every entry independently against the entry schema", () => {
		for (const entry of feed.entries) {
			const result = RegistryEntrySchema.safeParse(entry);
			if (!result.success) {
				throw new Error(
					`entry ${entry.slug} (${entry.kind}) failed: ${result.error.message}`,
				);
			}
		}
	});
});
