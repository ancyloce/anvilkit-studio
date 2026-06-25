#!/usr/bin/env node
/**
 * Generate the first-party registry feed at `src/registry/feed.json` (and the
 * public copies `public/registry/feed.json` + `feed.schema.json`).
 *
 * Reads package.json for every plugin (`packages/plugins/plugin-<slug>`) and
 * component (`packages/components/src/<slug>`). Templates are workspace-only
 * (not published) so they are intentionally absent. Preserves `addedAt` for
 * existing entries; only stamps a fresh timestamp for new ones.
 *
 * Plain-JS port of apps/docs/scripts/generate-registry-feed.ts. Wired via
 * `generate:registry`.
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
import { RegistryFeedSchema } from "../src/registry/feed.schema.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const DOCS_ROOT = join(here, "..");
const WORKSPACE_ROOT = join(DOCS_ROOT, "..", "..");
const PLUGINS_ROOT = join(WORKSPACE_ROOT, "packages", "plugins");
const COMPONENTS_ROOT = join(WORKSPACE_ROOT, "packages", "components", "src");

const FEED_OUT_DIR = join(DOCS_ROOT, "src", "registry");
const FEED_OUT_PATH = join(FEED_OUT_DIR, "feed.json");
const SCORECARDS_DIR = join(FEED_OUT_DIR, "scorecards");
const PUBLIC_REGISTRY_DIR = join(DOCS_ROOT, "public", "registry");
const PUBLIC_FEED_PATH = join(PUBLIC_REGISTRY_DIR, "feed.json");
const PUBLIC_SCHEMA_PATH = join(PUBLIC_REGISTRY_DIR, "feed.schema.json");

const SEED_DATE = process.env.GENERATE_FEED_NOW ?? new Date().toISOString();

function readJson(path) {
	return JSON.parse(readFileSync(path, "utf8"));
}

function listSubdirs(root, exclude = []) {
	if (!existsSync(root)) return [];
	const blocked = new Set([...exclude, "scripts", "node_modules", "dist"]);
	return readdirSync(root, { withFileTypes: true })
		.filter(
			(d) => d.isDirectory() && !blocked.has(d.name) && !d.name.startsWith("."),
		)
		.map((d) => d.name)
		.sort();
}

function tagsFromKeywords(keywords) {
	if (!keywords || keywords.length === 0) return [];
	return Array.from(new Set(keywords))
		.filter((k) => /^[a-z0-9][a-z0-9-]{0,47}$/.test(k))
		.slice(0, 16);
}

function repoUrl(pkg) {
	const raw = pkg.repository;
	if (!raw) return undefined;
	const url = typeof raw === "string" ? raw : raw.url;
	if (!url) return undefined;
	return url.replace(/^git\+/, "").replace(/\.git$/, "");
}

function pluginCategory(slug) {
	if (slug === "plugin-ai-copilot") return "ai";
	if (slug === "plugin-asset-manager") return "assets";
	if (slug.startsWith("plugin-export-")) return "export";
	if (slug === "plugin-version-history") return "history";
	return "studio";
}

function componentCategory(slug) {
	if (slug === "button" || slug === "input") return "primitives";
	if (slug === "hero" || slug === "navbar" || slug === "section")
		return "layout";
	return "content";
}

const pluginInstallSpec = () => ({
	mutates: ["lib/puck-config.ts"],
	scaffoldOnly: false,
	peerInstalls: [],
});
const componentInstallSpec = () => ({
	mutates: ["lib/puck-config.ts", "next.config.js"],
	scaffoldOnly: false,
	peerInstalls: [],
});

function pluginEntries(prior) {
	const entries = [];
	for (const slug of listSubdirs(PLUGINS_ROOT)) {
		const pkgPath = join(PLUGINS_ROOT, slug, "package.json");
		if (!existsSync(pkgPath)) continue;
		const pkg = readJson(pkgPath);
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

function componentEntries(prior) {
	const entries = [];
	for (const slug of listSubdirs(COMPONENTS_ROOT)) {
		const pkgPath = join(COMPONENTS_ROOT, slug, "package.json");
		if (!existsSync(pkgPath)) continue;
		const pkg = readJson(pkgPath);
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

function loadPriorEntries() {
	if (!existsSync(FEED_OUT_PATH)) return new Map();
	try {
		const parsed = RegistryFeedSchema.safeParse(readJson(FEED_OUT_PATH));
		if (!parsed.success) return new Map();
		return new Map(parsed.data.entries.map((e) => [`${e.kind}:${e.slug}`, e]));
	} catch {
		return new Map();
	}
}

function loadScorecard(kind, slug) {
	if (!existsSync(SCORECARDS_DIR)) return undefined;
	const path = join(SCORECARDS_DIR, `${kind}-${slug}.json`);
	if (!existsSync(path)) return undefined;
	try {
		const raw = readJson(path);
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

function mergeScorecards(entries) {
	return entries.map((entry) => {
		const scorecard = loadScorecard(entry.kind, entry.slug);
		if (scorecard === undefined) return entry;
		const verified =
			entry.publisher === "first-party" || scorecard.passed === true;
		return { ...entry, scorecard, verified };
	});
}

function sortEntries(entries) {
	const kindOrder = { template: 0, plugin: 1, component: 2 };
	return [...entries].sort((a, b) => {
		const k = kindOrder[a.kind] - kindOrder[b.kind];
		if (k !== 0) return k;
		const c = a.category.localeCompare(b.category);
		if (c !== 0) return c;
		return a.slug.localeCompare(b.slug);
	});
}

function main() {
	const prior = loadPriorEntries();
	const entries = sortEntries(
		mergeScorecards([...pluginEntries(prior), ...componentEntries(prior)]),
	);

	const feed = {
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
	writeFileSync(
		PUBLIC_SCHEMA_PATH,
		`${JSON.stringify(z.toJSONSchema(RegistryFeedSchema), null, "\t")}\n`,
	);

	const counts = entries.reduce(
		(acc, e) => {
			acc[e.kind]++;
			return acc;
		},
		{ template: 0, plugin: 0, component: 0 },
	);
	console.log(
		`wrote registry feed: ${entries.length} entries (${counts.plugin} plugins, ${counts.component} components)`,
	);
}

main();
