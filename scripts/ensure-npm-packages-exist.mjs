#!/usr/bin/env node
/**
 * Pre-publish guard: compare each public workspace package's local
 * package.json version with npm. This script never publishes and never
 * creates missing package names.
 *
 * Operation:
 *   1. Enumerate package.json files from pnpm-workspace.yaml patterns.
 *   2. Ignore the root package and every package marked private: true.
 *   3. Fail if a public workspace package name does not exist on npm.
 *   4. Mark existing packages whose exact local version is absent on npm.
 *   5. Write GitHub Action outputs so the workflow can decide whether
 *      to run `changeset publish`.
 *
 * Flags:
 *   --dry-run   Probe only. Kept for local/CI readability; this script
 *               never mutates npm either way.
 *   --filter    Restrict to package names containing this substring.
 */
import { spawnSync } from "node:child_process";
import {
	appendFileSync,
	existsSync,
	readFileSync,
	readdirSync,
	realpathSync,
	statSync,
} from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const DRY_RUN = process.argv.includes("--dry-run");
const FILTER_ARG = process.argv.find((arg) => arg.startsWith("--filter="));
const FILTER = FILTER_ARG ? FILTER_ARG.slice("--filter=".length) : null;

function readJson(path) {
	return JSON.parse(readFileSync(path, "utf8"));
}

function readWorkspacePatterns() {
	const workspacePath = join(ROOT, "pnpm-workspace.yaml");
	const lines = readFileSync(workspacePath, "utf8").split(/\r?\n/);
	const patterns = [];
	let inPackages = false;

	for (const line of lines) {
		if (/^packages:\s*$/.test(line)) {
			inPackages = true;
			continue;
		}
		if (inPackages && /^\S/.test(line)) {
			break;
		}
		if (!inPackages) {
			continue;
		}

		const match = line.match(/^\s*-\s*["']?([^"']+)["']?\s*$/);
		if (match) {
			patterns.push(match[1]);
		}
	}

	return patterns;
}

function expandPattern(pattern) {
	const segments = pattern.split("/");
	let dirs = [ROOT];

	for (const segment of segments) {
		const next = [];
		for (const dir of dirs) {
			if (segment === "*") {
				if (!existsSync(dir)) {
					continue;
				}
				for (const entry of readdirSync(dir, { withFileTypes: true })) {
					if (entry.isDirectory()) {
						next.push(join(dir, entry.name));
					}
				}
			} else {
				const candidate = join(dir, segment);
				if (existsSync(candidate) && statSync(candidate).isDirectory()) {
					next.push(candidate);
				}
			}
		}
		dirs = next;
	}

	return dirs.filter((dir) => existsSync(join(dir, "package.json")));
}

function enumerateWorkspacePackages() {
	const seen = new Set();
	const packages = [];

	for (const pattern of readWorkspacePatterns()) {
		for (const dir of expandPattern(pattern)) {
			const real = realpathSync(dir);
			if (seen.has(real)) {
				continue;
			}
			seen.add(real);

			const packagePath = join(dir, "package.json");
			const manifest = readJson(packagePath);
			if (manifest.private === true) {
				continue;
			}
			if (typeof manifest.name !== "string" || manifest.name.length === 0) {
				continue;
			}
			if (
				typeof manifest.version !== "string" ||
				manifest.version.length === 0
			) {
				continue;
			}

			packages.push({
				name: manifest.name,
				version: manifest.version,
				path: relative(ROOT, packagePath),
			});
		}
	}

	return packages.sort((a, b) => a.name.localeCompare(b.name));
}

function npmView(args) {
	const result = spawnSync("npm", ["view", ...args], {
		stdio: ["ignore", "pipe", "pipe"],
		encoding: "utf8",
	});
	if (result.status === 0) {
		return { ok: true };
	}

	const output = `${result.stderr || ""}\n${result.stdout || ""}`;
	if (output.includes("E404") || output.includes("404 Not Found")) {
		return { ok: false, missing: true };
	}

	throw new Error(
		`npm view ${args.join(" ")} failed with status ${result.status}:\n` +
			output.trim(),
	);
}

function npmPackageExists(name) {
	return npmView([name, "name", "--json"]).ok;
}

function npmVersionExists(name, version) {
	return npmView([`${name}@${version}`, "version", "--json"]).ok;
}

function setOutput(name, value) {
	if (!process.env.GITHUB_OUTPUT) {
		return;
	}
	appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

function writeOutputs(pending) {
	const packages = pending.map((pkg) => `${pkg.name}@${pkg.version}`);
	setOutput("should_publish", pending.length > 0 ? "true" : "false");
	setOutput("package_count", String(pending.length));
	setOutput("packages", packages.join(","));
}

function main() {
	const all = enumerateWorkspacePackages();
	const packages = FILTER
		? all.filter((pkg) => pkg.name.includes(FILTER))
		: all;
	const pending = [];
	const missingPackages = [];

	console.log(
		`Comparing ${packages.length} public workspace package(s) with npm` +
			`${FILTER ? ` (filter=${FILTER})` : ""}` +
			`${DRY_RUN ? " (dry-run)" : ""}...`,
	);

	for (const pkg of packages) {
		if (!npmPackageExists(pkg.name)) {
			console.log(`  missing package name  ${pkg.name} (${pkg.path})`);
			missingPackages.push(pkg);
			continue;
		}

		if (npmVersionExists(pkg.name, pkg.version)) {
			console.log(`  ok       ${pkg.name}@${pkg.version}`);
		} else {
			console.log(`  publish  ${pkg.name}@${pkg.version}`);
			pending.push(pkg);
		}
	}

	writeOutputs(pending);

	if (missingPackages.length > 0) {
		throw new Error(
			"Refusing to publish because one or more public workspace package " +
				"names do not exist on npm.\n" +
				"First publishes must be intentional and must not be created by " +
				"the automated release workflow.\n" +
				`Missing package name(s): ${missingPackages
					.map((pkg) => `${pkg.name} (${pkg.path})`)
					.join(", ")}`,
		);
	}

	if (pending.length === 0) {
		console.log("All public workspace package.json versions already exist on npm.");
		return;
	}

	console.log(
		`Found ${pending.length} package.json version(s) ready to publish: ` +
			pending.map((pkg) => `${pkg.name}@${pkg.version}`).join(", "),
	);
}

try {
	main();
} catch (error) {
	writeOutputs([]);
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
}
