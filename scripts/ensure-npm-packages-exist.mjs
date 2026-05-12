#!/usr/bin/env node
/**
 * Pre-publish guard: for every publishable workspace package, verify
 * an npm registry entry exists. If not (E404), create it by running
 * a first-time `pnpm publish` from the local build.
 *
 * Why this exists:
 *   `changesets/action` runs `changeset publish`, which calls
 *   `npm publish` per package. For a brand-new package name
 *   (e.g. a rename like `create-anvilkit-plugin` →
 *   `@anvilkit/create-plugin`, or a freshly added plugin),
 *   `npm publish` has to *create* the registry entry. That works
 *   when `publishConfig.access` is set, but other CI steps that
 *   probe with `npm view <name>` ahead of the publish race
 *   surface confusing `E404 undefined` errors. Pre-creating the
 *   registry entry removes the race and makes the publish job
 *   resilient to "package not yet on npm" state.
 *
 * Operation:
 *   1. Enumerate workspace packages via `pnpm -r ls --json --depth=-1`.
 *   2. Drop every package marked `private: true`.
 *   3. For each survivor, run `npm view <name> name`. E404 → missing.
 *   4. Resolve the dist-tag from `.changeset/pre.json` (beta if the
 *      file exists; latest otherwise).
 *   5. Publish missing packages with `pnpm --filter <name> publish
 *      --access public --no-git-checks --tag <tag>`. Provenance is
 *      added when the workflow runs in a GitHub Actions environment
 *      that exposes the OIDC token.
 *
 * Flags:
 *   --dry-run   Probe only — never publish. Prints what would happen.
 *   --filter    Restrict to packages matching this substring (debug).
 *
 * Env:
 *   NPM_TOKEN / NODE_AUTH_TOKEN must be set for the publish step.
 *
 * Idempotency:
 *   On a second run after a successful publish, every package
 *   resolves to "exists" and the script is a no-op. Safe to run
 *   on every push to main.
 */
import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const DRY_RUN = process.argv.includes("--dry-run");
const FILTER_ARG = process.argv.find((a) => a.startsWith("--filter="));
const FILTER = FILTER_ARG ? FILTER_ARG.slice("--filter=".length) : null;

function resolveDistTag() {
	const prePath = join(ROOT, ".changeset", "pre.json");
	if (!existsSync(prePath)) return "latest";
	try {
		const pre = JSON.parse(readFileSync(prePath, "utf8"));
		return typeof pre.tag === "string" && pre.tag.length > 0 ? pre.tag : "beta";
	} catch {
		return "beta";
	}
}

function enumerateWorkspacePackages() {
	const out = execSync("pnpm -r --json ls --depth=-1", {
		cwd: ROOT,
		encoding: "utf8",
		maxBuffer: 32 * 1024 * 1024,
	});
	const projects = JSON.parse(out);
	return projects
		.filter((p) => p && p.name && p.version && p.private !== true)
		.map((p) => ({ name: p.name, version: p.version, path: p.path }));
}

function npmExists(name) {
	const r = spawnSync("npm", ["view", name, "name"], {
		stdio: ["ignore", "pipe", "pipe"],
		encoding: "utf8",
	});
	if (r.status === 0) return { exists: true };
	const stderr = r.stderr || "";
	if (stderr.includes("E404") || stderr.includes("404 Not Found")) {
		return { exists: false };
	}
	// Distinguish "missing" from a registry outage / auth failure /
	// rate-limit so the workflow fails loud on transient errors
	// rather than masking them as "needs creating."
	throw new Error(
		`npm view ${name} failed with status ${r.status}: ${stderr.trim()}`,
	);
}

function publishMissing(pkg, tag) {
	const args = [
		"--filter",
		pkg.name,
		"publish",
		"--access",
		"public",
		"--no-git-checks",
		"--tag",
		tag,
	];
	// `--provenance` is supported on GitHub-hosted runners with
	// id-token: write. Skip it locally so dry-runs don't fail.
	if (process.env.GITHUB_ACTIONS === "true") {
		args.push("--provenance");
	}
	const r = spawnSync("pnpm", args, {
		cwd: ROOT,
		stdio: "inherit",
	});
	if (r.status !== 0) {
		throw new Error(`pnpm publish failed for ${pkg.name} (exit ${r.status}).`);
	}
}

function main() {
	const tag = resolveDistTag();
	const all = enumerateWorkspacePackages();
	const filtered = FILTER ? all.filter((p) => p.name.includes(FILTER)) : all;
	console.log(
		`Scanning ${filtered.length} publishable workspace package(s) ` +
			`(dist-tag=${tag}${DRY_RUN ? ", dry-run" : ""})...`,
	);

	const missing = [];
	for (const pkg of filtered) {
		const { exists } = npmExists(pkg.name);
		if (exists) {
			console.log(`  ok  ${pkg.name}`);
		} else {
			console.log(`  NEW ${pkg.name}@${pkg.version}  — will be created`);
			missing.push(pkg);
		}
	}

	if (missing.length === 0) {
		console.log("All publishable packages exist on npm.");
		return;
	}

	if (DRY_RUN) {
		console.log(
			`\nDry-run: would publish ${missing.length} package(s): ` +
				`${missing.map((p) => p.name).join(", ")}`,
		);
		return;
	}

	for (const pkg of missing) {
		console.log(`\nCreating ${pkg.name}@${pkg.version} on npm (tag=${tag})...`);
		publishMissing(pkg, tag);
	}
	console.log(`\nCreated ${missing.length} new npm package(s).`);
}

try {
	main();
} catch (err) {
	console.error(err instanceof Error ? err.message : String(err));
	process.exit(1);
}
