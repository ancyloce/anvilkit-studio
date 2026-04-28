import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
	runScorecardForEntry,
	type Scorecard,
} from "../../scripts/scorecard-runner.ts";

const here = dirname(fileURLToPath(import.meta.url));
const FEED_PATH = join(here, "..", "..", "src", "registry", "feed.json");

interface RawEntry {
	slug: string;
	kind: "plugin" | "template" | "component";
	name: string;
	packageName: string;
	version: string;
	publisher: "first-party" | "verified" | "community";
}

function loadFeedEntries(): RawEntry[] {
	const raw = JSON.parse(readFileSync(FEED_PATH, "utf8")) as {
		entries: RawEntry[];
	};
	return raw.entries;
}

describe("scorecard-runner — first-party entries", () => {
	const entries = loadFeedEntries();

	it("scores every first-party template against the local workspace", () => {
		const templates = entries.filter(
			(e) => e.kind === "template" && e.publisher === "first-party",
		);
		expect(templates.length).toBeGreaterThan(0);
		for (const entry of templates) {
			const card = runScorecardForEntry(entry, { skipBuild: true });
			expect(card.slug, entry.slug).toBe(entry.slug);
			expect(card.kind, entry.slug).toBe("template");
			expect(card.checks.semver, entry.slug).toBe(true);
			expect(card.checks.license, entry.slug).toBe(true);
			expect(card.checks.dependencies, entry.slug).toBe(true);
			expect(card.checks.noNetwork, entry.slug).toBe(true);
		}
	});

	it("scores every first-party plugin against the local workspace", () => {
		const plugins = entries.filter(
			(e) => e.kind === "plugin" && e.publisher === "first-party",
		);
		expect(plugins.length).toBeGreaterThan(0);
		for (const entry of plugins) {
			const card = runScorecardForEntry(entry, { skipBuild: true });
			expect(card.checks.semver, entry.slug).toBe(true);
			expect(card.checks.license, entry.slug).toBe(true);
			expect(card.checks.dependencies, entry.slug).toBe(true);
			expect(card.checks.noNetwork, entry.slug).toBe(true);
		}
	});

	it("rejects an entry whose package directory does not exist", () => {
		const fake: RawEntry = {
			slug: "definitely-not-real",
			kind: "component",
			name: "Fake",
			packageName: "@anvilkit/definitely-not-real",
			version: "0.0.1",
			publisher: "first-party",
		};
		const card: Scorecard = runScorecardForEntry(fake, { skipBuild: true });
		expect(card.passed).toBe(false);
		expect(card.notes).toBeDefined();
	});

	it("rejects an invalid semver version", () => {
		const bad: RawEntry = {
			slug: "hero",
			kind: "component",
			name: "@anvilkit/hero",
			packageName: "@anvilkit/hero",
			version: "not-a-semver",
			publisher: "first-party",
		};
		const card = runScorecardForEntry(bad, { skipBuild: true });
		expect(card.checks.semver).toBe(false);
		expect(card.passed).toBe(false);
	});

	it("emits an ISO-8601 ranAt timestamp", () => {
		const entry = entries.find(
			(e) => e.kind === "component" && e.publisher === "first-party",
		);
		if (entry === undefined)
			throw new Error("no first-party component in feed");
		const card = runScorecardForEntry(entry, { skipBuild: true });
		expect(card.ranAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
	});
});

describe("scorecard-runner — workflow integration shape", () => {
	const entries = loadFeedEntries();

	it("is callable with the same shape the workflow matrix passes", () => {
		const sample = entries[0];
		expect(sample).toBeDefined();
		const card = runScorecardForEntry(sample!, { skipBuild: true });
		// Required fields the workflow upload expects.
		expect(card.slug).toBeDefined();
		expect(card.kind).toBeDefined();
		expect(card.passed).toBeTypeOf("boolean");
		expect(card.checks).toBeDefined();
	});
});

describe("workflow file presence", () => {
	it("ships the scorecard workflow file", () => {
		const workflow = join(
			here,
			"..",
			"..",
			"..",
			"..",
			".github",
			"workflows",
			"marketplace-scorecard.yml",
		);
		expect(existsSync(workflow)).toBe(true);
	});
});
