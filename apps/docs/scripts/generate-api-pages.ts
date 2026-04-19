#!/usr/bin/env node
/**
 * @file phase4-003 — emit TypeDoc API reference for the five runtime
 * packages (`@anvilkit/core`, `@anvilkit/ir`, `@anvilkit/schema`,
 * `@anvilkit/validator`, `@anvilkit/utils`) into the Starlight docs
 * site.
 *
 * For each package we:
 *   1. Spawn TypeDoc inside the package directory so it runs against
 *      that package's own TypeScript (6.0.2) and `tsconfig.json` —
 *      this avoids the TS-version mismatch between this docs app and
 *      the runtime packages.
 *   2. Emit Markdown via `typedoc-plugin-markdown` into a temp dir,
 *      then post-process every page into MDX with Starlight
 *      frontmatter under `src/content/docs/api/<pkg>/`.
 *   3. Emit a JSON snapshot of the public surface and diff it against
 *      the previous run so breaking changes are surfaced in CI logs.
 *
 * Any TypeDoc error causes the script to exit non-zero, which fails
 * `pnpm docs:build` (the script is wired in via the `prebuild` hook).
 */
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_ROOT = resolve(__dirname, "..");
const WORKSPACE_ROOT = resolve(DOCS_ROOT, "..", "..");
const PACKAGES_ROOT = join(WORKSPACE_ROOT, "packages");
const OUT_DIR = join(DOCS_ROOT, "src", "content", "docs", "api");
const SNAPSHOT_DIR = join(DOCS_ROOT, ".api-snapshots");

type PackageSlug = "core" | "ir" | "schema" | "validator" | "utils";

type PackageEntry = {
	slug: PackageSlug;
	pkgName: string;
	displayName: string;
	summary: string;
};

const PACKAGES: readonly PackageEntry[] = [
	{
		slug: "core",
		pkgName: "@anvilkit/core",
		displayName: "Core",
		summary:
			"Runtime types, plugin engine, React shell, and config system for the Studio.",
	},
	{
		slug: "ir",
		pkgName: "@anvilkit/ir",
		displayName: "IR",
		summary:
			"Headless Page Intermediate Representation transforms shared by every export format.",
	},
	{
		slug: "schema",
		pkgName: "@anvilkit/schema",
		displayName: "Schema",
		summary:
			"Derive AI-friendly component schemas from a Puck Config — extraction, serializability, generation context.",
	},
	{
		slug: "validator",
		pkgName: "@anvilkit/validator",
		displayName: "Validator",
		summary: "Export-readiness validation for Puck configs and AI-generated output.",
	},
	{
		slug: "utils",
		pkgName: "@anvilkit/utils",
		displayName: "Utils",
		summary: "Zero-dependency helpers shared across Anvilkit runtime packages.",
	},
];

function fail(slug: string, msg: string): never {
	console.error(`[generate-api-pages] ${slug}: ${msg}`);
	process.exit(1);
}

function ensureCleanDir(dir: string): void {
	if (existsSync(dir)) {
		rmSync(dir, { recursive: true, force: true });
	}
	mkdirSync(dir, { recursive: true });
}

function ensureDir(dir: string): void {
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
}

function runTypedoc(args: string[], cwd: string, slug: string): void {
	const bin = join(cwd, "node_modules", ".bin", "typedoc");
	if (!existsSync(bin)) {
		fail(
			slug,
			`expected per-package TypeDoc binary at ${relative(WORKSPACE_ROOT, bin)}; run \`pnpm install\``,
		);
	}
	const result = spawnSync(bin, args, {
		cwd,
		stdio: ["ignore", "inherit", "inherit"],
		env: { ...process.env, FORCE_COLOR: "0" },
	});
	if (result.status !== 0) {
		fail(slug, `typedoc exited with status ${result.status}`);
	}
}

function generatePackage(entry: PackageEntry): void {
	const pkgDir = join(PACKAGES_ROOT, entry.slug);
	const typedocConfig = join(pkgDir, "typedoc.json");
	if (!existsSync(typedocConfig)) {
		fail(entry.slug, `missing ${relative(WORKSPACE_ROOT, typedocConfig)}`);
	}

	const tempOut = mkdtempSync(join(tmpdir(), `anvilkit-typedoc-${entry.slug}-`));
	const finalOut = join(OUT_DIR, entry.slug);

	console.log(`[generate-api-pages] ${entry.slug}: running TypeDoc…`);
	runTypedoc(["--options", "typedoc.json", "--out", tempOut], pkgDir, entry.slug);

	// JSON snapshot for diff detection — written via a second TypeDoc
	// pass with `--json`. Cheap (the project graph is already cached
	// inside TypeDoc's own session) and keeps the markdown run pristine.
	ensureDir(SNAPSHOT_DIR);
	const snapshotPath = join(SNAPSHOT_DIR, `${entry.slug}.json`);
	const previousSnapshot = readSnapshot(snapshotPath);
	const newSnapshotPath = join(tempOut, "__snapshot.json");
	runTypedoc(
		["--options", "typedoc.json", "--json", newSnapshotPath, "--out", join(tempOut, "__discard__")],
		pkgDir,
		entry.slug,
	);
	rmSync(join(tempOut, "__discard__"), { recursive: true, force: true });
	const newSnapshotRaw = readFileSync(newSnapshotPath, "utf8");
	const newSnapshot = JSON.parse(newSnapshotRaw) as TypeDocJson;
	const newSurface = surfaceFromSnapshot(newSnapshot);

	if (previousSnapshot) {
		const prevSurface = surfaceFromSnapshot(previousSnapshot);
		const diff = diffSurfaces(prevSurface, newSurface);
		if (diff.added.length || diff.removed.length || diff.changed.length) {
			console.log(
				`[generate-api-pages] ${entry.slug}: API changes detected since last run`,
			);
			for (const name of diff.added) console.log(`  + ${name}`);
			for (const name of diff.removed) console.log(`  - ${name} (BREAKING)`);
			for (const name of diff.changed) console.log(`  ~ ${name}`);
		}
	}
	writeFileSync(snapshotPath, `${JSON.stringify(newSnapshot, null, 2)}\n`, "utf8");

	// Hand the markdown over to Starlight: rewrite into MDX, prepend
	// frontmatter, drop typedoc's own README/index header so
	// Starlight's title takes over.
	ensureCleanDir(finalOut);
	migrateMarkdownTree(tempOut, finalOut, entry);
	rmSync(tempOut, { recursive: true, force: true });

	console.log(
		`[generate-api-pages] wrote ${countMdx(finalOut)} pages → api/${entry.slug}/`,
	);
}

type TypeDocChild = {
	id?: number;
	name: string;
	kind?: number;
	flags?: { isPrivate?: boolean; isProtected?: boolean };
	signatures?: Array<{ name: string; parameters?: unknown }>;
	children?: TypeDocChild[];
	type?: unknown;
};

type TypeDocJson = {
	name?: string;
	children?: TypeDocChild[];
};

type Surface = Map<string, string>;

function surfaceFromSnapshot(snapshot: TypeDocJson): Surface {
	const out: Surface = new Map();
	for (const child of snapshot.children ?? []) {
		if (child.flags?.isPrivate || child.flags?.isProtected) continue;
		out.set(child.name, fingerprint(child));
	}
	return out;
}

function fingerprint(child: TypeDocChild): string {
	// Ignore IDs (TypeDoc renumbers each run) — fingerprint structure.
	const trimmed = JSON.parse(
		JSON.stringify(child, (key, value) => {
			if (key === "id") return undefined;
			if (key === "sources") return undefined;
			if (key === "url") return undefined;
			return value;
		}),
	);
	return JSON.stringify(trimmed);
}

type SurfaceDiff = {
	added: string[];
	removed: string[];
	changed: string[];
};

function diffSurfaces(prev: Surface, next: Surface): SurfaceDiff {
	const added: string[] = [];
	const removed: string[] = [];
	const changed: string[] = [];
	for (const [name, fp] of next.entries()) {
		const old = prev.get(name);
		if (old === undefined) added.push(name);
		else if (old !== fp) changed.push(name);
	}
	for (const name of prev.keys()) {
		if (!next.has(name)) removed.push(name);
	}
	return { added: added.sort(), removed: removed.sort(), changed: changed.sort() };
}

function readSnapshot(path: string): TypeDocJson | null {
	if (!existsSync(path)) return null;
	try {
		return JSON.parse(readFileSync(path, "utf8")) as TypeDocJson;
	} catch {
		return null;
	}
}

function migrateMarkdownTree(srcDir: string, destDir: string, entry: PackageEntry): void {
	walkMarkdown(srcDir, srcDir, destDir, entry);
}

function walkMarkdown(
	root: string,
	current: string,
	destRoot: string,
	entry: PackageEntry,
): void {
	for (const name of readdirSync(current)) {
		// Skip the JSON snapshot we wrote alongside the markdown output.
		if (name === "__snapshot.json") continue;
		const full = join(current, name);
		const stat = statSync(full);
		if (stat.isDirectory()) {
			walkMarkdown(root, full, destRoot, entry);
			continue;
		}
		if (!name.endsWith(".md")) continue;
		const rel = relative(root, full);
		const destRel = rel === "index.md" ? "index.mdx" : rel.replace(/\.md$/, ".mdx");
		const destPath = join(destRoot, destRel);
		ensureDir(dirname(destPath));
		const md = readFileSync(full, "utf8");
		const mdx = transformMarkdown(md, destRel, entry);
		writeFileSync(destPath, mdx, "utf8");
	}
}

function transformMarkdown(md: string, destRel: string, entry: PackageEntry): string {
	const isIndex = destRel === "index.mdx";
	// Strip typedoc's first H1 — Starlight renders the title from frontmatter.
	const lines = md.split("\n");
	let i = 0;
	while (i < lines.length && lines[i].trim() === "") i++;
	if (i < lines.length && lines[i].startsWith("# ")) {
		i++;
		while (i < lines.length && lines[i].trim() === "") i++;
	}
	const body = lines.slice(i).join("\n").trimEnd();
	// MDX is brittle around bare `<Type>` fragments TypeDoc sometimes emits
	// for generic parameters (e.g. `Promise<T>`) inside table cells.
	// Markdown-it would render them fine, but MDX treats them as JSX —
	// escape angle brackets that sit outside fenced code blocks/inline code.
	const safeBody = escapeAngleBracketsOutsideCode(body);
	const title = isIndex
		? `${entry.displayName} — API Reference`
		: deriveTitle(destRel) || `${entry.displayName} API`;
	const description = isIndex
		? `${entry.pkgName} public API reference, generated by TypeDoc.`
		: `${entry.pkgName} · ${title}`;
	return `---
title: "${escapeYaml(title)}"
description: "${escapeYaml(description)}"
editUrl: false
sidebar:
  label: "${escapeYaml(isIndex ? "Overview" : title)}"
---

${safeBody}
`;
}

function deriveTitle(destRel: string): string {
	const base = destRel.split(sep).pop() ?? destRel;
	const stem = base.replace(/\.mdx$/, "");
	// TypeDoc names files like `functions/foo.md`, `classes/Bar.md`,
	// `type-aliases/Baz.md`. The stem itself is already the symbol.
	return stem.replace(/^_+/, "");
}

function escapeYaml(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function escapeAngleBracketsOutsideCode(input: string): string {
	const lines = input.split("\n");
	let inFence = false;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (/^\s*```/.test(line)) {
			inFence = !inFence;
			continue;
		}
		if (inFence) continue;
		if (line.includes("|")) {
			lines[i] = escapeInlineGenericsInTableLine(line);
		}
	}
	return lines.join("\n");
}

function escapeInlineGenericsInTableLine(line: string): string {
	let out = "";
	let inCode = false;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (ch === "`") {
			inCode = !inCode;
			out += ch;
			continue;
		}
		if (inCode) {
			out += ch;
			continue;
		}
		if (ch === "<") {
			out += "&lt;";
			continue;
		}
		if (ch === ">") {
			out += "&gt;";
			continue;
		}
		out += ch;
	}
	return out;
}

function countMdx(dir: string): number {
	let count = 0;
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		const stat = statSync(full);
		if (stat.isDirectory()) count += countMdx(full);
		else if (name.endsWith(".mdx")) count += 1;
	}
	return count;
}

function writeApiIndex(): void {
	const indexPath = join(OUT_DIR, "index.mdx");
	const rows = PACKAGES.map(
		(p) =>
			`| [${p.displayName}](/api/${p.slug}/) | \`${p.pkgName}\` | ${p.summary} |`,
	).join("\n");
	const body = `---
title: API Reference
description: Auto-generated TypeDoc reference for every Anvilkit runtime package.
---

This catalog is regenerated from each package's TypeDoc output on every docs
build — see \`apps/docs/scripts/generate-api-pages.ts\`. Internal symbols (under
\`**/internal/**\` or prefixed with \`_\`) are excluded.

| Package | npm | Summary |
|---------|-----|---------|
${rows}
`;
	ensureDir(OUT_DIR);
	writeFileSync(indexPath, body, "utf8");
}

function main(): void {
	ensureCleanDir(OUT_DIR);
	for (const entry of PACKAGES) {
		generatePackage(entry);
	}
	writeApiIndex();
	console.log(`[generate-api-pages] ${PACKAGES.length} packages generated`);
}

main();
