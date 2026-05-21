import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { CliError } from "./errors.js";
import {
	type RegistryEntry,
	type RegistryEntryKind,
	type RegistryFeed,
	RegistryFeedParser,
} from "./registry-schema.js";

const PRODUCTION_FEED_URL = "https://docs.anvilkit.dev/registry/feed.json";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface ResolveOptions {
	readonly cwd: string;
	readonly feedSource?: string;
	readonly allowUnverified?: boolean;
	readonly fetchImpl?: typeof fetch;
	readonly now?: () => number;
}

interface CacheEntry {
	fetchedAt: number;
	feed: RegistryFeed;
}

interface FeedSourceResult {
	feed: RegistryFeed;
	origin: string;
}

function feedCachePath(): string {
	return join(homedir(), ".anvilkit", "cache", "registry-feed.json");
}

function readCachedFeed(now: number): CacheEntry | undefined {
	const cachePath = feedCachePath();
	if (!existsSync(cachePath)) return undefined;
	try {
		const raw = JSON.parse(readFileSync(cachePath, "utf8")) as CacheEntry;
		if (now - raw.fetchedAt > CACHE_TTL_MS) return undefined;
		const parsed = RegistryFeedParser.safeParse(raw.feed);
		if (!parsed.success) return undefined;
		return { fetchedAt: raw.fetchedAt, feed: parsed.data };
	} catch {
		return undefined;
	}
}

function writeCachedFeed(entry: CacheEntry): void {
	const cachePath = feedCachePath();
	mkdirSync(dirname(cachePath), { recursive: true });
	writeFileSync(cachePath, JSON.stringify(entry, null, "\t"), "utf8");
}

function findWorkspaceFeed(cwd: string): string | undefined {
	let dir = resolve(cwd);
	for (let i = 0; i < 12; i++) {
		const candidate = join(dir, "apps", "docs", "src", "registry", "feed.json");
		if (existsSync(candidate) && existsSync(join(dir, "pnpm-workspace.yaml"))) {
			return candidate;
		}
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return undefined;
}

async function loadFeedFromSource(
	source: string,
	fetchImpl: typeof fetch,
): Promise<RegistryFeed> {
	let raw: unknown;
	if (source.startsWith("http://") || source.startsWith("https://")) {
		const response = await fetchImpl(source);
		if (!response.ok) {
			throw new CliError({
				code: "REGISTRY_FETCH_FAILED",
				exitCode: 1,
				message: `Could not fetch registry feed from ${source}: HTTP ${response.status}`,
			});
		}
		raw = (await response.json()) as unknown;
	} else {
		const path = source.startsWith("file://") ? source.slice(7) : source;
		if (!existsSync(path)) {
			throw new CliError({
				code: "REGISTRY_FETCH_FAILED",
				exitCode: 1,
				message: `Registry feed not found at ${path}`,
			});
		}
		raw = JSON.parse(readFileSync(path, "utf8"));
	}

	const parsed = RegistryFeedParser.safeParse(raw);
	if (!parsed.success) {
		throw new CliError({
			code: "REGISTRY_INVALID",
			exitCode: 1,
			message: `Registry feed at ${source} is not a valid feed (v1).`,
		});
	}
	return parsed.data;
}

async function loadFeed(options: ResolveOptions): Promise<FeedSourceResult> {
	const fetchImpl = options.fetchImpl ?? globalThis.fetch;
	const now = options.now?.() ?? Date.now();

	const explicit = options.feedSource ?? process.env.ANVILKIT_FEED_PATH;
	if (explicit !== undefined && explicit !== "") {
		const feed = await loadFeedFromSource(explicit, fetchImpl);
		return { feed, origin: explicit };
	}

	const workspaceFeed = findWorkspaceFeed(options.cwd);
	if (workspaceFeed !== undefined) {
		const feed = await loadFeedFromSource(workspaceFeed, fetchImpl);
		return { feed, origin: workspaceFeed };
	}

	const cached = readCachedFeed(now);
	if (cached !== undefined) {
		return { feed: cached.feed, origin: `${PRODUCTION_FEED_URL} (cached)` };
	}

	const feed = await loadFeedFromSource(PRODUCTION_FEED_URL, fetchImpl);
	writeCachedFeed({ fetchedAt: now, feed });
	return { feed, origin: PRODUCTION_FEED_URL };
}

export interface ResolutionFailure {
	readonly ok: false;
	readonly code: "ENTRY_NOT_FOUND" | "ENTRY_UNVERIFIED" | "ENTRY_SCAFFOLD_ONLY";
	readonly message: string;
}

export interface ResolutionSuccess {
	readonly ok: true;
	readonly entry: RegistryEntry;
	readonly origin: string;
}

export type ResolutionResult = ResolutionSuccess | ResolutionFailure;

export async function resolveSlug(
	requested: string,
	options: ResolveOptions,
): Promise<ResolutionResult> {
	const { feed, origin } = await loadFeed(options);
	const matches = findMatches(feed, requested);
	if (matches.length === 0) {
		return {
			ok: false,
			code: "ENTRY_NOT_FOUND",
			message: `No registry entry matches "${requested}". Use --unsafe to bypass the registry.`,
		};
	}
	if (matches.length > 1) {
		const summary = matches
			.map((m) => `${m.kind}/${m.slug} (${m.packageName})`)
			.join(", ");
		return {
			ok: false,
			code: "ENTRY_NOT_FOUND",
			message: `Multiple entries match "${requested}": ${summary}. Disambiguate with --kind <plugin|template|component>.`,
		};
	}
	const entry = matches[0];
	if (entry === undefined) {
		throw new Error("unreachable: matches.length === 1 but no entry");
	}
	if (!entry.verified && options.allowUnverified !== true) {
		return {
			ok: false,
			code: "ENTRY_UNVERIFIED",
			message: `Entry "${entry.packageName}" is not verified. Re-run with --unsafe to install anyway.`,
		};
	}
	if (entry.installSpec.scaffoldOnly) {
		return {
			ok: false,
			code: "ENTRY_SCAFFOLD_ONLY",
			message: `Entry "${entry.packageName}" is scaffold-only. Use \`anvilkit init --template ${entry.slug}\` instead.`,
		};
	}
	return { ok: true, entry, origin };
}

function findMatches(feed: RegistryFeed, requested: string): RegistryEntry[] {
	const trimmed = requested.trim();
	if (trimmed === "") return [];
	return feed.entries.filter(
		(e) => e.slug === trimmed || e.packageName === trimmed,
	);
}

export function filterByKind(
	entry: RegistryEntry,
	kind: RegistryEntryKind | undefined,
): boolean {
	return kind === undefined || entry.kind === kind;
}
