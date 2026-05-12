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

// Names the workflow's NPM_TOKEN is authorized to write. The token is
// a granular automation token scoped to `@anvilkit/*` (see the header
// of `.github/workflows/publish.yml`), so any unscoped or out-of-scope
// publishable workspace package — one that would need its own
// owner-level token or a separate publish flow — is silently skipped
// here. Attempting it would PUT against the registry and get
// `404 Not Found`, which npm returns for both "missing" and
// "you don't have permission to write here".
const PUBLISHABLE_SCOPE_PREFIX = "@anvilkit/";

function isInTokenScope(name) {
	return name.startsWith(PUBLISHABLE_SCOPE_PREFIX);
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

// Best-effort preflight: surface what we can about the configured
// auth credential before burning publish attempts that will 404
// because the token lacks scope-create permission. Intentionally
// non-fatal: granular automation tokens scoped to packages/scopes
// can publish but often cannot call `/-/whoami` (which represents
// a user identity these tokens don't carry), so a `whoami` failure
// is NOT proof the token is broken. The actual publish below is the
// source of truth; this just adds context to the logs.
function preflightAuth() {
	const ping = spawnSync("npm", ["ping"], {
		stdio: ["ignore", "pipe", "pipe"],
		encoding: "utf8",
	});
	if (ping.status === 0) {
		console.log("  npm ping: ok");
	} else {
		console.warn(
			`  WARN: npm ping returned ${ping.status} — registry may be unreachable.`,
		);
	}

	const who = spawnSync("npm", ["whoami"], {
		stdio: ["ignore", "pipe", "pipe"],
		encoding: "utf8",
	});
	if (who.status === 0) {
		console.log(`  npm whoami: ${(who.stdout || "").trim()}`);
	} else {
		// Granular tokens scoped to specific packages/scopes commonly
		// 401 here even when publish works fine. Note it and move on.
		console.log(
			"  npm whoami: not available (expected for granular scope tokens)",
		);
	}

	// Best-effort scope-write probe. `npm access list packages` returns
	// the packages this token can write to; if @anvilkit/* shows up at
	// all, the token has scope membership. If nothing shows up under
	// @anvilkit, we still let the run continue (the token might have
	// implicit scope-create permission via org membership), but we
	// warn loudly so the first 404 is interpretable.
	const access = spawnSync(
		"npm",
		["access", "list", "packages", "--json", "@anvilkit"],
		{ stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" },
	);
	if (access.status === 0) {
		try {
			const pkgs = JSON.parse(access.stdout || "{}");
			const writeable = Object.entries(pkgs)
				.filter(([, perm]) => perm === "read-write")
				.map(([name]) => name);
			if (writeable.length === 0) {
				console.warn(
					"  WARN: npm token has no read-write entries under @anvilkit/*.\n" +
						'        If a bootstrap publish below fails with "404 Not Found - PUT",\n' +
						"        the token needs scope-create permission. Fix on npmjs.com:\n" +
						"          1. Ensure the npm account owns the @anvilkit org or scope.\n" +
						"          2. Issue a Granular Access Token with\n" +
						'             "Packages and scopes > @anvilkit > Read and write"\n' +
						'             AND check "Allow creation of new packages".\n' +
						"          3. Replace the NPM_TOKEN secret in GitHub repo settings.",
				);
			} else {
				console.log(
					`  token has read-write on ${writeable.length} @anvilkit/* package(s).`,
				);
			}
		} catch {
			// non-JSON output (older npm) — skip the probe quietly.
		}
	}
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
	// Intentionally NO `--provenance` here. This script only creates
	// the npm registry entry so the real release flow (`changeset
	// publish`) can later upload versioned tarballs. Sigstore / Rekor
	// outages have surfaced as `TLOG_CREATE_ENTRY_ERROR` and blocked
	// the entire pipeline on bootstrap publishes that don't need
	// attestation. Set `ENSURE_PROVENANCE=1` to opt back in if
	// Sigstore is healthy and you specifically want the bootstrap
	// tarball attested.
	if (
		process.env.GITHUB_ACTIONS === "true" &&
		process.env.ENSURE_PROVENANCE === "1"
	) {
		args.push("--provenance");
	}
	const r = spawnSync("pnpm", args, {
		cwd: ROOT,
		stdio: "inherit",
	});
	if (r.status !== 0) {
		throw new Error(
			`pnpm publish failed for ${pkg.name} (exit ${r.status}).\n\n` +
				`  If the failure above was "404 Not Found - PUT ${pkg.name}",\n` +
				`  the npm token cannot create new packages under @anvilkit.\n` +
				`  npm returns 404 (not 403) for "no write permission to scope".\n\n` +
				`  Fix on npmjs.com:\n` +
				`    1. Log in as the user/org that owns the @anvilkit scope\n` +
				`       (claim it once via \`npm init --scope=anvilkit\` from a\n` +
				`       maintainer machine, or create an @anvilkit org).\n` +
				`    2. Issue a Granular Access Token with\n` +
				`       "Packages and scopes > @anvilkit > Read and write"\n` +
				`       AND check "Allow creation of new packages".\n` +
				`    3. Replace the NPM_TOKEN secret in GitHub repo settings.\n\n` +
				`  Workaround: publish ${pkg.name} once manually from a\n` +
				`  maintainer machine, then re-run this workflow:\n` +
				`    npm login\n` +
				`    pnpm --filter ${pkg.name} publish --access public --no-git-checks\n\n` +
				`  Bypass: set ENSURE_SKIP="${pkg.name}" to skip this package in\n` +
				`  the bootstrap and let the real \`changeset publish\` decide.`,
		);
	}
}

// Comma-separated package names to skip bootstrapping. Use when a
// scope/token misconfiguration blocks first-publish of a specific new
// package and you want to unblock CI while the npm-side fix lands.
const SKIP = (process.env.ENSURE_SKIP || "")
	.split(",")
	.map((s) => s.trim())
	.filter(Boolean);

function main() {
	const tag = resolveDistTag();
	const all = enumerateWorkspacePackages();
	const filtered = FILTER ? all.filter((p) => p.name.includes(FILTER)) : all;
	const inScope = filtered.filter((p) => isInTokenScope(p.name));
	const outOfScope = filtered.filter((p) => !isInTokenScope(p.name));
	console.log(
		`Scanning ${inScope.length} in-scope (${PUBLISHABLE_SCOPE_PREFIX}*) ` +
			`publishable workspace package(s) ` +
			`(dist-tag=${tag}${DRY_RUN ? ", dry-run" : ""})...`,
	);
	if (outOfScope.length > 0) {
		console.log(
			`  skipping ${outOfScope.length} out-of-scope package(s) ` +
				`(token cannot create unscoped/foreign-scope names): ` +
				`${outOfScope.map((p) => p.name).join(", ")}`,
		);
	}

	const missing = [];
	const skipped = [];
	for (const pkg of inScope) {
		const { exists } = npmExists(pkg.name);
		if (exists) {
			console.log(`  ok  ${pkg.name}`);
		} else if (SKIP.includes(pkg.name)) {
			console.log(`  skip ${pkg.name}  — ENSURE_SKIP bypass`);
			skipped.push(pkg);
		} else {
			console.log(`  NEW ${pkg.name}@${pkg.version}  — will be created`);
			missing.push(pkg);
		}
	}

	if (missing.length === 0) {
		if (skipped.length > 0) {
			console.log(
				`Skipped ${skipped.length} package(s) via ENSURE_SKIP; ` +
					`all other publishable packages exist on npm.`,
			);
		} else {
			console.log("All publishable packages exist on npm.");
		}
		return;
	}

	if (DRY_RUN) {
		console.log(
			`\nDry-run: would publish ${missing.length} package(s): ` +
				`${missing.map((p) => p.name).join(", ")}`,
		);
		return;
	}

	// Only preflight when there's an actual publish to do — keeps the
	// idempotent no-op path silent on repeat runs.
	console.log("\nPreflighting npm auth before bootstrap publishes...");
	preflightAuth();

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
