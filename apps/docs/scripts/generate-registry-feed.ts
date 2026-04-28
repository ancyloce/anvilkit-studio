#!/usr/bin/env node
/**
 * Generate the first-party registry feed at
 * `apps/docs/src/registry/feed.json`.
 *
 * Reads `package.json` for every:
 *   - template at `packages/templates/<slug>/`
 *   - plugin at `packages/plugins/plugin-<slug>/`
 *   - component at `packages/components/src/<slug>/`
 *
 * Produces a deterministic feed validated against
 * `apps/docs/src/registry/feed.schema.ts`. Re-runnable; preserves
 * `addedAt` for entries already present in the prior feed and only
 * stamps a fresh timestamp when a new entry appears.
 *
 * Hooked into the docs site's `prebuild` script so every Vercel
 * deploy publishes the feed at `/registry/feed.json` (plus the
 * companion JSON Schema at `/registry/feed.schema.json`).
 *
 * Phase 6 / M11 / `phase6-011`.
 */

import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
	type RegistryEntry,
	type RegistryEntryKind,
	type RegistryFeed,
	RegistryFeedSchema,
} from "../src/registry/feed.schema.ts";

const here = dirname(fileURLToPath(import.meta.url));
const DOCS_ROOT = join(here, "..");
const WORKSPACE_ROOT = join(DOCS_ROOT, "..", "..");
const TEMPLATES_ROOT = join(WORKSPACE_ROOT, "packages", "templates");
const PLUGINS_ROOT = join(WORKSPACE_ROOT, "packages", "plugins");
const COMPONENTS_ROOT = join(WORKSPACE_ROOT, "packages", "components", "src");

const FEED_OUT_DIR = join(DOCS_ROOT, "src", "registry");
const FEED_OUT_PATH = join(FEED_OUT_DIR, "feed.json");
const SCORECARDS_DIR = join(FEED_OUT_DIR, "scorecards");
const PUBLIC_REGISTRY_DIR = join(DOCS_ROOT, "public", "registry");
const PUBLIC_FEED_PATH = join(PUBLIC_REGISTRY_DIR, "feed.json");
const PUBLIC_SCHEMA_PATH = join(PUBLIC_REGISTRY_DIR, "feed.schema.json");

const SEED_DATE = process.env.GENERATE_FEED_NOW ?? new Date().toISOString();

type PackageJson = {
	name: string;
	version: string;
	description?: string;
	repository?: string | { url?: string };
	homepage?: string;
	keywords?: string[];
};

function readJson<T>(path: string): T {
	return JSON.parse(readFileSync(path, "utf8")) as T;
}

function listSubdirs(
	root: string,
	exclude: ReadonlyArray<string> = [],
): string[] {
	if (!existsSync(root)) return [];
	const blocked = new Set([...exclude, "scripts", "node_modules", "dist"]);
	return readdirSync(root, { withFileTypes: true })
		.filter(
			(d) => d.isDirectory() && !blocked.has(d.name) && !d.name.startsWith("."),
		)
		.map((d) => d.name)
		.sort();
}

function tagsFromKeywords(keywords?: string[]): string[] {
	if (!keywords || keywords.length === 0) return [];
	return Array.from(new Set(keywords))
		.filter((k) => /^[a-z0-9][a-z0-9-]{0,47}$/.test(k))
		.slice(0, 16);
}

function repoUrl(pkg: PackageJson): string | undefined {
	const raw = pkg.repository;
	if (!raw) return undefined;
	const url = typeof raw === "string" ? raw : raw.url;
	if (!url) return undefined;
	return url.replace(/^git\+/, "").replace(/\.git$/, "");
}

function templateCategory(slug: string): string {
	if (slug.startsWith("landing-")) return "landing";
	if (slug.startsWith("blog-")) return "blog";
	if (slug === "feature-overview" || slug === "pricing-comparison")
		return "marketing";
	return "system";
}

function pluginCategory(slug: string): string {
	if (slug === "plugin-ai-copilot") return "ai";
	if (slug === "plugin-asset-manager") return "assets";
	if (slug.startsWith("plugin-export-")) return "export";
	if (slug === "plugin-version-history") return "history";
	return "studio";
}

function componentCategory(slug: string): string {
	if (slug === "button" || slug === "input") return "primitives";
	if (slug === "hero" || slug === "navbar" || slug === "section")
		return "layout";
	return "content";
}

function templateInstallSpec(): RegistryEntry["installSpec"] {
	return {
		mutates: ["lib/puck-config.ts", "next.config.js"],
		scaffoldOnly: false,
		peerInstalls: [],
	};
}

function pluginInstallSpec(): RegistryEntry["installSpec"] {
	return {
		mutates: ["lib/puck-config.ts"],
		scaffoldOnly: false,
		peerInstalls: [],
	};
}

function componentInstallSpec(): RegistryEntry["installSpec"] {
	return {
		mutates: ["lib/puck-config.ts", "next.config.js"],
		scaffoldOnly: false,
		peerInstalls: [],
	};
}

function pluginEntries(prior: Map<string, RegistryEntry>): RegistryEntry[] {
	const entries: RegistryEntry[] = [];
	for (const slug of listSubdirs(PLUGINS_ROOT)) {
		const pkgPath = join(PLUGINS_ROOT, slug, "package.json");
		if (!existsSync(pkgPath)) continue;
		const pkg = readJson<PackageJson>(pkgPath);
		const key = `plugin:${slug}`;
		entries.push({
			slug,
			kind: "plugin",
			name: pkg.name,
			description:
				pkg.description ?? `Anvilkit ${slug.replace(/^plugin-/, "")} plugin.`,
			packageName: pkg.name,
			version: pkg.version,
			category: pluginCategory(slug),
			tags: tagsFromKeywords(pkg.keywords),
			publisher: "first-party",
			verified: true,
			scorecard: undefined,
			repository: repoUrl(pkg),
			homepage: pkg.homepage,
			preview: undefined,
			addedAt: prior.get(key)?.addedAt ?? SEED_DATE,
			installSpec: pluginInstallSpec(),
		});
	}
	return entries;
}

function templateEntries(prior: Map<string, RegistryEntry>): RegistryEntry[] {
	const entries: RegistryEntry[] = [];
	for (const slug of listSubdirs(TEMPLATES_ROOT)) {
		const pkgPath = join(TEMPLATES_ROOT, slug, "package.json");
		if (!existsSync(pkgPath)) continue;
		const pkg = readJson<PackageJson>(pkgPath);
		const key = `template:${slug}`;
		const previewPath = join(TEMPLATES_ROOT, slug, "preview.png");
		entries.push({
			slug,
			kind: "template",
			name: pkg.description?.split("—")[0]?.trim() || pkg.name,
			description: pkg.description ?? pkg.name,
			packageName: pkg.name,
			version: pkg.version,
			category: templateCategory(slug),
			tags: tagsFromKeywords(pkg.keywords),
			publisher: "first-party",
			verified: true,
			scorecard: undefined,
			repository: repoUrl(pkg),
			homepage: pkg.homepage,
			preview: existsSync(previewPath)
				? `/templates/${slug}/preview.png`
				: undefined,
			addedAt: prior.get(key)?.addedAt ?? SEED_DATE,
			installSpec: templateInstallSpec(),
		});
	}
	return entries;
}

function componentEntries(prior: Map<string, RegistryEntry>): RegistryEntry[] {
	const entries: RegistryEntry[] = [];
	for (const slug of listSubdirs(COMPONENTS_ROOT)) {
		const pkgPath = join(COMPONENTS_ROOT, slug, "package.json");
		if (!existsSync(pkgPath)) continue;
		const pkg = readJson<PackageJson>(pkgPath);
		const key = `component:${slug}`;
		entries.push({
			slug,
			kind: "component",
			name: pkg.name,
			description: pkg.description ?? `Anvilkit ${slug} component.`,
			packageName: pkg.name,
			version: pkg.version,
			category: componentCategory(slug),
			tags: tagsFromKeywords(pkg.keywords),
			publisher: "first-party",
			verified: true,
			scorecard: undefined,
			repository: repoUrl(pkg),
			homepage: pkg.homepage,
			preview: undefined,
			addedAt: prior.get(key)?.addedAt ?? SEED_DATE,
			installSpec: componentInstallSpec(),
		});
	}
	return entries;
}

function loadPriorEntries(): Map<string, RegistryEntry> {
	if (!existsSync(FEED_OUT_PATH)) return new Map();
	try {
		const raw = readJson<unknown>(FEED_OUT_PATH);
		const parsed = RegistryFeedSchema.safeParse(raw);
		if (!parsed.success) return new Map();
		return new Map(parsed.data.entries.map((e) => [`${e.kind}:${e.slug}`, e]));
	} catch {
		return new Map();
	}
}

function loadScorecard(
	kind: RegistryEntryKind,
	slug: string,
): RegistryEntry["scorecard"] {
	if (!existsSync(SCORECARDS_DIR)) return undefined;
	const path = join(SCORECARDS_DIR, `${kind}-${slug}.json`);
	if (!existsSync(path)) return undefined;
	try {
		const raw = readJson<{
			passed: boolean;
			ranAt?: string;
			commit?: string;
			checks?: Record<string, boolean>;
			notes?: string;
		}>(path);
		return {
			passed: raw.passed,
			ranAt: raw.ranAt,
			commit: raw.commit,
			checks: raw.checks,
			notes: raw.notes,
		};
	} catch {
		return undefined;
	}
}

function mergeScorecards(entries: RegistryEntry[]): RegistryEntry[] {
	return entries.map((entry) => {
		const scorecard = loadScorecard(entry.kind, entry.slug);
		if (scorecard === undefined) return entry;
		const verified =
			entry.publisher === "first-party" || scorecard.passed === true;
		return { ...entry, scorecard, verified };
	});
}

function sortEntries(entries: RegistryEntry[]): RegistryEntry[] {
	const kindOrder: Record<RegistryEntryKind, number> = {
		template: 0,
		plugin: 1,
		component: 2,
	};
	return [...entries].sort((a, b) => {
		const k = kindOrder[a.kind] - kindOrder[b.kind];
		if (k !== 0) return k;
		const c = a.category.localeCompare(b.category);
		if (c !== 0) return c;
		return a.slug.localeCompare(b.slug);
	});
}

function main(): void {
	const prior = loadPriorEntries();
	const entries = sortEntries(
		mergeScorecards([
			...templateEntries(prior),
			...pluginEntries(prior),
			...componentEntries(prior),
		]),
	);

	const feed: RegistryFeed = {
		$schema: "/registry/feed.schema.json",
		feedVersion: "1",
		generatedAt: SEED_DATE,
		entries,
	};

	const validated = RegistryFeedSchema.parse(feed);

	mkdirSync(FEED_OUT_DIR, { recursive: true });
	mkdirSync(PUBLIC_REGISTRY_DIR, { recursive: true });

	const serialized = `${JSON.stringify(validated, null, "\t")}\n`;
	writeFileSync(FEED_OUT_PATH, serialized);
	writeFileSync(PUBLIC_FEED_PATH, serialized);

	const jsonSchema = z.toJSONSchema(RegistryFeedSchema);
	writeFileSync(
		PUBLIC_SCHEMA_PATH,
		`${JSON.stringify(jsonSchema, null, "\t")}\n`,
	);

	const counts = entries.reduce(
		(acc, e) => {
			acc[e.kind]++;
			return acc;
		},
		{ template: 0, plugin: 0, component: 0 } satisfies Record<
			RegistryEntryKind,
			number
		>,
	);
	console.log(
		`wrote registry feed: ${entries.length} entries (${counts.template} templates, ${counts.plugin} plugins, ${counts.component} components)`,
	);
}

main();
