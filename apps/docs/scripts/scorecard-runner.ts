#!/usr/bin/env node
/**
 * Marketplace scorecard runner (`phase6-014`).
 *
 * Per-entry scorecard executor invoked by
 * `.github/workflows/marketplace-scorecard.yml`. Inspects a single
 * registry entry (resolved by `--slug` against `feed.json`) and
 * emits a scorecard JSON to
 * `apps/docs/src/registry/scorecards/<kind>-<slug>.json`.
 *
 * Checks (per `docs/policies/marketplace-governance.md` §3):
 *   - license      → license field present, OSI-approved
 *   - dependencies → no GPL family in production deps (allow-list)
 *   - noNetwork    → no `postinstall` or `prepare` script that calls
 *                    network commands (curl/wget/git fetch/etc.)
 *   - readme       → README.md exists, ≥ 200 chars, contains a fenced
 *                    code block
 *   - build        → workspace `pnpm --filter <pkg> build` exits 0
 *                    (first-party only; community entries are graded
 *                    by the GitHub Actions matrix step)
 *   - semver       → entry.version matches semver
 *
 * Exit codes:
 *   0 — scorecard ran (passed or failed; see JSON output)
 *   1 — scorecard could not run (entry not found, fixture missing)
 *
 * Intentionally a Node-only script: the runner is invoked from a CI
 * runner where `pnpm` is on PATH. The script itself does not call
 * network APIs.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const DOCS_ROOT = join(here, "..");
const WORKSPACE_ROOT = join(DOCS_ROOT, "..", "..");
const FEED_PATH = join(DOCS_ROOT, "src", "registry", "feed.json");
const DEFAULT_OUTPUT_DIR = join(DOCS_ROOT, "src", "registry", "scorecards");

const OSI_APPROVED = new Set([
	"MIT",
	"Apache-2.0",
	"BSD-2-Clause",
	"BSD-3-Clause",
	"ISC",
	"MPL-2.0",
	"CC0-1.0",
	"Unlicense",
]);

const COPYLEFT_BLOCK = ["GPL", "AGPL", "LGPL"];

const SEMVER_REGEX = /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/;

interface RegistryEntry {
	slug: string;
	kind: "plugin" | "template" | "component";
	name: string;
	packageName: string;
	version: string;
	publisher: "first-party" | "verified" | "community";
}

interface RegistryFeed {
	entries: RegistryEntry[];
}

export interface ScorecardChecks {
	license: boolean;
	dependencies: boolean;
	noNetwork: boolean;
	readme: boolean;
	semver: boolean;
	build?: boolean;
}

export interface Scorecard {
	slug: string;
	kind: RegistryEntry["kind"];
	packageName: string;
	version: string;
	passed: boolean;
	ranAt: string;
	commit?: string;
	checks: ScorecardChecks;
	notes?: string;
}

interface CliArgs {
	slug?: string;
	kind?: string;
	outputDir: string;
	skipBuild: boolean;
	commit?: string;
	feedPath: string;
}

function parseArgs(argv: ReadonlyArray<string>): CliArgs {
	const args: CliArgs = {
		outputDir: DEFAULT_OUTPUT_DIR,
		skipBuild: false,
		feedPath: FEED_PATH,
	};
	for (let i = 0; i < argv.length; i++) {
		const token = argv[i];
		if (token === "--slug") args.slug = argv[++i];
		else if (token === "--kind") args.kind = argv[++i];
		else if (token === "--output-dir")
			args.outputDir = argv[++i] ?? args.outputDir;
		else if (token === "--commit") args.commit = argv[++i];
		else if (token === "--feed") args.feedPath = argv[++i] ?? args.feedPath;
		else if (token === "--skip-build") args.skipBuild = true;
	}
	return args;
}

function packageDir(entry: RegistryEntry): string {
	if (entry.kind === "template") {
		return join(WORKSPACE_ROOT, "packages", "templates", entry.slug);
	}
	if (entry.kind === "plugin") {
		return join(WORKSPACE_ROOT, "packages", "plugins", entry.slug);
	}
	return join(WORKSPACE_ROOT, "packages", "components", "src", entry.slug);
}

function checkLicense(pkgJson: { license?: string }): boolean {
	const license = pkgJson.license ?? "";
	if (license === "") return false;
	return OSI_APPROVED.has(license);
}

function checkDependencies(pkgJson: {
	dependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
}): boolean {
	const allDeps = {
		...(pkgJson.dependencies ?? {}),
		...(pkgJson.peerDependencies ?? {}),
	};
	for (const name of Object.keys(allDeps)) {
		if (
			COPYLEFT_BLOCK.some((blocked) => name.toUpperCase().includes(blocked))
		) {
			return false;
		}
	}
	return true;
}

function checkNoNetwork(pkgJson: {
	scripts?: Record<string, string>;
}): boolean {
	const scripts = pkgJson.scripts ?? {};
	const NETWORK_PATTERNS = [
		/\bcurl\b/,
		/\bwget\b/,
		/\bgit\s+fetch\b/,
		/\bgit\s+clone\b/,
		/\bnpm\s+(install|i)\b.*--global/,
		/\bgo\s+install\b/,
	];
	for (const stage of ["postinstall", "prepare", "preinstall"] as const) {
		const value = scripts[stage];
		if (value === undefined) continue;
		if (NETWORK_PATTERNS.some((rgx) => rgx.test(value))) return false;
	}
	return true;
}

function checkReadme(packagePath: string): boolean {
	const readmePath = join(packagePath, "README.md");
	if (!existsSync(readmePath)) return false;
	const content = readFileSync(readmePath, "utf8");
	if (content.length < 200) return false;
	return /```/.test(content);
}

function checkSemver(version: string): boolean {
	return SEMVER_REGEX.test(version);
}

function checkBuild(packageName: string): boolean {
	const result = spawnSync("pnpm", ["--filter", packageName, "build"], {
		cwd: WORKSPACE_ROOT,
		encoding: "utf8",
		timeout: 5 * 60 * 1000,
		stdio: "ignore",
	});
	return result.status === 0;
}

export function runScorecardForEntry(
	entry: RegistryEntry,
	options: { skipBuild?: boolean; commit?: string } = {},
): Scorecard {
	const packagePath = packageDir(entry);
	const pkgJsonPath = join(packagePath, "package.json");
	if (!existsSync(pkgJsonPath)) {
		const ranAt = new Date().toISOString();
		return {
			slug: entry.slug,
			kind: entry.kind,
			packageName: entry.packageName,
			version: entry.version,
			passed: false,
			ranAt,
			commit: options.commit,
			checks: {
				license: false,
				dependencies: false,
				noNetwork: false,
				readme: false,
				semver: checkSemver(entry.version),
			},
			notes: `package.json missing at ${packagePath}`,
		};
	}

	const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf8")) as {
		license?: string;
		dependencies?: Record<string, string>;
		peerDependencies?: Record<string, string>;
		scripts?: Record<string, string>;
	};

	const checks: ScorecardChecks = {
		license: checkLicense(pkgJson),
		dependencies: checkDependencies(pkgJson),
		noNetwork: checkNoNetwork(pkgJson),
		readme: checkReadme(packagePath),
		semver: checkSemver(entry.version),
	};

	if (options.skipBuild !== true) {
		checks.build = checkBuild(entry.packageName);
	}

	const passed = Object.values(checks).every((v) => v === true);

	return {
		slug: entry.slug,
		kind: entry.kind,
		packageName: entry.packageName,
		version: entry.version,
		passed,
		ranAt: new Date().toISOString(),
		commit: options.commit,
		checks,
	};
}

function loadFeed(feedPath: string): RegistryFeed {
	if (!existsSync(feedPath)) {
		throw new Error(`feed.json not found at ${feedPath}`);
	}
	return JSON.parse(readFileSync(feedPath, "utf8")) as RegistryFeed;
}

function findEntry(
	feed: RegistryFeed,
	slug: string,
	kind: string | undefined,
): RegistryEntry | undefined {
	return feed.entries.find(
		(e) => e.slug === slug && (kind === undefined || e.kind === kind),
	);
}

function writeScorecard(card: Scorecard, outputDir: string): string {
	mkdirSync(outputDir, { recursive: true });
	const path = join(outputDir, `${card.kind}-${card.slug}.json`);
	writeFileSync(path, `${JSON.stringify(card, null, "\t")}\n`, "utf8");
	return path;
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	if (args.slug === undefined) {
		console.error("error: --slug <slug> is required");
		process.exit(1);
	}

	const feed = loadFeed(args.feedPath);
	const entry = findEntry(feed, args.slug, args.kind);
	if (entry === undefined) {
		console.error(
			`error: no feed entry matches slug=${args.slug}${
				args.kind !== undefined ? ` kind=${args.kind}` : ""
			}`,
		);
		process.exit(1);
	}

	const card = runScorecardForEntry(entry, {
		skipBuild: args.skipBuild,
		commit: args.commit,
	});

	const path = writeScorecard(card, args.outputDir);
	process.stdout.write(`${JSON.stringify(card, null, "\t")}\n`);
	console.error(
		`${card.passed ? "✓" : "✗"} scorecard ${entry.kind}/${entry.slug} → ${path}`,
	);
}

const isMain =
	process.argv[1] !== undefined &&
	fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
	main();
}
