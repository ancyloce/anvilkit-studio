#!/usr/bin/env node
/**
 * PLAN-0026 §6 / PLAN-0028 `p0-002` — banned-identifier tombstone gate.
 *
 * The canonical Puck-native rewrite deletes the sidecar editor
 * architecture and its version vocabulary. Most of that is enforced by
 * ABSENCE: once `@anvilkit/contracts` stops exporting a symbol, any
 * surviving import is a compile error, and typecheck is a better gate
 * than any scanner. This script exists for the part typecheck cannot
 * see — identifiers that survive as **string literals** in JSON
 * fixtures, migration code and stored documents (`__anvilkit`,
 * `authoringSchemaVersion`) — and to give the rewrite an auditable
 * countdown for the headline names.
 *
 * Three rules, from PLAN-0026 §6 and ADR 0007 decision 3:
 *
 * 1. EXPLICIT IDENTIFIER LIST, NEVER A SUBSTRING SCAN. A `v1`/`v2`
 *    substring scan false-positives on Y.js `applyUpdateV2`
 *    (`plugin-collab-yjs/src/utils/yjs-adapter.ts`), Unsplash's
 *    `Accept-Version: v1` header, and product-release prose like
 *    `v1.0.0-beta.0`. Every entry below is matched on word boundaries,
 *    so `__anvilkit` does not match `__anvilkitInstance` and
 *    `EditorCommand` does not match `EditorCommandPort` — they are
 *    separate rows with separate counts.
 *
 * 2. SHRINK RULE. The gate FAILS when a tombstoned identifier has zero
 *    hits repo-wide and is still listed. The list must therefore be
 *    pruned as each name genuinely dies, so it behaves as a countdown
 *    to zero rather than a permanent museum of old vocabulary. At
 *    `p8-011` the list should be EMPTY and this rule proves it.
 *
 * 3. THIS FILE IS THE ONE SANCTIONED PLACE the names may appear, so it
 *    excludes itself from the scan.
 *
 * ---------------------------------------------------------------
 * TWO SCOPE DECISIONS, stated so they read as choices, not oversights
 * ---------------------------------------------------------------
 *
 * A. `docs/` IS NOT SCANNED. The rewrite's own documentation — the
 *    tracked naming map (`docs/architecture/canonical-editor-naming-
 *    map.md`), ADR 0007, PLAN-0026/0028 and the task files — names
 *    every tombstoned identifier BY DESIGN; that is the audit trail of
 *    what was removed, which is the opposite of a violation. Scanning
 *    it would also make rule 2 unreachable: the naming map is tracked
 *    and permanent, so those names never hit zero. Documentation does
 *    not execute. `apps/docs/content` IS scanned, because a published
 *    guide teaching a deleted API is a real defect (`p6-006` fixes it).
 *
 * B. DERIVED AND INTERNAL NAMES ARE NOT LISTED. `InternalEditorCommand
 *    Port`, `EditorCommandPortDeps` and the 31 atomic command
 *    interfaces are local to files this rewrite deletes wholesale, and
 *    are fully caught by typecheck-by-absence. Listing every derived
 *    name would grow the list without adding coverage, and a longer
 *    list is a slower countdown.
 *
 * Two rows of the naming map are deliberately ABSENT from this list,
 * because tombstoning them would violate rule 1 — their bare tokens are
 * ordinary English and would false-positive by the thousand:
 *
 *   - `EditorSelectionState.scope` -> `definitionScope`. The token is
 *     `scope`. Enforced instead by typecheck: renaming the field breaks
 *     every reader at compile time (`p3-007`).
 *   - `appearance.version` wire literal. The token is `version`.
 *     Enforced instead by the schema dropping the literal (`p1-006`)
 *     and by `p7-002`'s store scan, which reads stored documents rather
 *     than source.
 *
 * Every other Renamed old-name and Deleted row of
 * `docs/architecture/canonical-editor-naming-map.md` has a row below.
 *
 * Suppression: a line carrying `anvilkit-tombstone-ok: <reason>` (on
 * the line itself or the line above) is exempt. Suppressions are
 * COUNTED AND REPORTED in every run, never silent — an escape hatch
 * you cannot see is a hole. A suppression without a reason is itself a
 * failure.
 *
 * Usage:
 *   node scripts/check-banned-identifiers.mjs             # blocking
 *   node scripts/check-banned-identifiers.mjs --advisory  # report, exit 0
 *   node scripts/check-banned-identifiers.mjs --self-test # prove the matcher
 *
 * No dependencies; runs on bare node.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SELF = fileURLToPath(import.meta.url);

/**
 * The tombstone list. Seeded from the Renamed (old names) and Deleted
 * tables of `docs/architecture/canonical-editor-naming-map.md`, which
 * `p0-001` verified line by line against the working tree on
 * 2026-08-06.
 *
 * `kind`  — identifier | literal | filename. Reporting only; all three
 *           match on word boundaries.
 * `dies`  — the task that removes the last occurrence. When that task
 *           lands, this row should be deleted (rule 2 enforces it).
 * `note`  — why a row is expected to survive longer than its phase.
 */
const TOMBSTONES = [
	// --- renamed: the OLD name must die (p1-001) ---
	{ id: "AuthorStyleV1", kind: "identifier", dies: "p1-001" },
	{ id: "TargetAppearanceV1", kind: "identifier", dies: "p1-001" },
	{ id: "AnvilAppearanceV1", kind: "identifier", dies: "p1-001" },
	{ id: "DesignSystemV1", kind: "identifier", dies: "p1-001" },
	{ id: "DocumentComponentLibraryV1", kind: "identifier", dies: "p1-001" },
	{ id: "AnvilKitV2RootProps", kind: "identifier", dies: "p1-001" },
	// --- renamed (p1-002) ---
	{ id: "InteractionV1", kind: "identifier", dies: "p1-002" },
	{ id: "BindingV1", kind: "identifier", dies: "p1-002" },
	{ id: "ComponentDefinitionV1", kind: "identifier", dies: "p1-002" },
	{ id: "StyleDefinitionV1", kind: "identifier", dies: "p1-002" },
	{ id: "TiptapDocumentV1", kind: "identifier", dies: "p1-002" },
	// --- renamed (p1-003) ---
	{ id: "component-metadata-v2", kind: "filename", dies: "p1-003" },
	{ id: "StyleTargetCapabilityV2", kind: "identifier", dies: "p1-003" },
	{ id: "AnvilComponentMetadataV2", kind: "identifier", dies: "p1-003" },
	{ id: "StyleTargetCapabilityV2Schema", kind: "identifier", dies: "p1-003" },
	{ id: "ComponentMetadataV2Schema", kind: "identifier", dies: "p1-003" },
	{ id: "readEditorMetadataV2", kind: "identifier", dies: "p1-003" },
	// --- deleted: sidecar state (p1-005) ---
	{ id: "ANVILKIT_AUTHORING_KEY", kind: "identifier", dies: "p1-005" },
	{ id: "AuthoringStateV1", kind: "identifier", dies: "p1-005" },
	{ id: "NodeAuthoringStateV1", kind: "identifier", dies: "p1-005" },
	{ id: "AnvilKitRootProps", kind: "identifier", dies: "p1-005" },
	{ id: "createEmptyAuthoringState", kind: "identifier", dies: "p1-005" },
	// --- deleted: the command IR (p1-005) ---
	{ id: "EditorCommandBase", kind: "identifier", dies: "p1-005" },
	{ id: "EditorCommand", kind: "identifier", dies: "p1-005" },
	{ id: "AtomicEditorCommand", kind: "identifier", dies: "p1-005" },
	{ id: "BatchEditorCommand", kind: "identifier", dies: "p1-005" },
	{ id: "EditorCommandResult", kind: "identifier", dies: "p1-005" },
	{ id: "EditorCommandSnapshot", kind: "identifier", dies: "p1-005" },
	{
		id: "EditorCommandPort",
		kind: "identifier",
		dies: "p8-011",
		note: "ADR 0007 decision 7 — retained as a type-only deprecated alias; the adopter set is not verifiable from the registry",
	},
	// --- deleted: v1 capability declaration (p2-006) ---
	{
		id: "EditorCapabilityMetadata",
		kind: "identifier",
		dies: "p2-006",
		note: "only this export of capability-metadata.ts dies; InlineTextTarget/ImageTarget/SlotCapability are retained (naming map F-1)",
	},
	// --- deleted: the command bridge (p3-009) ---
	{ id: "V2CommandPlan", kind: "identifier", dies: "p3-009" },
	{ id: "planV2Command", kind: "identifier", dies: "p3-009" },
	{ id: "applyV2Plan", kind: "identifier", dies: "p3-009" },
	// --- deleted: the migration layer (p7-004) ---
	{ id: "migrateToPuckNativeV2", kind: "identifier", dies: "p7-004" },
	{ id: "guardDocumentForV2Editor", kind: "identifier", dies: "p7-004" },
	{ id: "puck-native-v2", kind: "filename", dies: "p7-004" },
	// --- string-typed escapes: the reason this gate exists at all ---
	{
		id: "__anvilkit",
		kind: "literal",
		dies: "p7-002",
		note: "survives in stored documents until the final migration; typecheck can never see it",
	},
	{
		id: "__anvilkitInstance",
		kind: "literal",
		dies: "p7-002",
		note: "prop key in stored documents; code stops writing it at p3-003",
	},
	{
		id: "authoringSchemaVersion",
		kind: "literal",
		dies: "p7-002",
		note: "root-prop key in stored documents; contract drops it at p1-001",
	},
];

const SCAN_ROOTS = ["apps", "packages", "scripts", ".github", "turbo"];
const ROOT_FILES = ["package.json", "turbo.json", "CLAUDE.md", "AGENTS.md"];
const SKIP_DIRS = new Set([
	"node_modules",
	"dist",
	".next",
	".vercel",
	".output",
	".turbo",
	"coverage",
	".claude",
	".git",
	"storybook-static",
	"playwright-report",
	"test-results",
]);
const SCAN_EXT =
	/\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs|json|mdx|md|ya?ml|css|html)$/;
const SUPPRESS = /anvilkit-tombstone-ok:\s*(\S.*)?/;
/**
 * Generated artifacts. These are REAL hits — a tombstoned name in the
 * published api-snapshot means the public surface still exposes it —
 * but they are derivative and self-healing: regenerating the snapshot
 * after the export is deleted removes them with no separate work. They
 * are counted, and reported in their own column, so the `src` number
 * reads as "code still to change" rather than being inflated by an
 * artifact that cannot be fixed on its own.
 */
const GENERATED = /(?:^|[\\/])api[\\/]api-snapshot(?:\.[a-z-]+)?\.json$/;

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * One combined alternation, longest-first so `EditorCommandPort` wins
 * over `EditorCommand` without relying on backtracking order.
 */
function buildMatcher(tombstones) {
	const alts = tombstones
		.map((t) => t.id)
		.sort((a, b) => b.length - a.length)
		.map(escapeRe)
		.join("|");
	return new RegExp(`\\b(${alts})\\b`, "g");
}

function collect(dir, out) {
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (!SKIP_DIRS.has(entry.name)) collect(full, out);
		} else if (SCAN_EXT.test(entry.name) && full !== SELF) {
			out.push(full);
		}
	}
	return out;
}

function scan(tombstones) {
	if (tombstones.length === 0) {
		return { files: 0, hits: new Map(), suppressed: [], unreasoned: [] };
	}
	const matcher = buildMatcher(tombstones);
	const files = [];
	for (const r of SCAN_ROOTS) collect(join(ROOT, r), files);
	for (const f of ROOT_FILES) {
		const p = join(ROOT, f);
		try {
			if (statSync(p).isFile()) files.push(p);
		} catch {
			/* absent is fine */
		}
	}

	const hits = new Map(tombstones.map((t) => [t.id, []]));
	const suppressed = [];
	const unreasoned = [];

	for (const file of files) {
		let text;
		try {
			text = readFileSync(file, "utf8");
		} catch {
			continue;
		}
		// Cheap pre-filter: skip files that cannot contain any tombstone.
		matcher.lastIndex = 0;
		if (!matcher.test(text)) continue;
		const rel = relative(ROOT, file);
		const generated = GENERATED.test(rel);
		const lines = text.split("\n");
		lines.forEach((line, i) => {
			matcher.lastIndex = 0;
			const found = [...line.matchAll(matcher)];
			if (found.length === 0) return;
			const own = SUPPRESS.exec(line);
			const above = i > 0 ? SUPPRESS.exec(lines[i - 1]) : null;
			const sup = own ?? above;
			const where = `${rel}:${i + 1}`;
			if (sup) {
				const reason = (sup[1] ?? "").trim();
				for (const m of found) suppressed.push({ id: m[1], where, reason });
				if (reason === "") unreasoned.push(where);
				return;
			}
			for (const m of found) hits.get(m[1])?.push({ where, generated });
		});
	}
	return { files: files.length, hits, suppressed, unreasoned };
}

function report(tombstones, result) {
	const { hits, files, suppressed } = result;
	const rows = tombstones.map((t) => {
		const h = hits.get(t.id);
		return {
			...t,
			count: h.length,
			src: h.filter((x) => !x.generated).length,
			gen: h.filter((x) => x.generated).length,
			fileCount: new Set(h.map((x) => x.where.split(":")[0])).size,
		};
	});
	const live = rows.filter((r) => r.count > 0);
	const dead = rows.filter((r) => r.count === 0);
	const total = live.reduce((n, r) => n + r.count, 0);
	const totalSrc = live.reduce((n, r) => n + r.src, 0);
	const totalGen = live.reduce((n, r) => n + r.gen, 0);

	const w = Math.max(10, ...rows.map((r) => r.id.length));
	console.log(
		`\n  ${"identifier".padEnd(w)}  ${"kind".padEnd(10)}  ${"src".padStart(5)}  ${"gen".padStart(5)}  ${"files".padStart(5)}  dies`,
	);
	console.log(
		`  ${"-".repeat(w)}  ${"-".repeat(10)}  -----  -----  -----  ------`,
	);
	for (const r of [...live].sort((a, b) => b.src - a.src || b.gen - a.gen)) {
		console.log(
			`  ${r.id.padEnd(w)}  ${r.kind.padEnd(10)}  ${String(r.src).padStart(5)}  ${String(r.gen).padStart(5)}  ${String(r.fileCount).padStart(5)}  ${r.dies}`,
		);
	}
	for (const r of dead) {
		console.log(
			`  ${r.id.padEnd(w)}  ${r.kind.padEnd(10)}  ${"0".padStart(5)}  ${"0".padStart(5)}  ${"0".padStart(5)}  ${r.dies}   <-- DEAD, prune it`,
		);
	}
	console.log(
		`\n  ${files} files scanned · ${tombstones.length} tombstones · ${total} hits ` +
			`(${totalSrc} source, ${totalGen} generated) across ${live.length} live · ${dead.length} dead · ${suppressed.length} suppressed`,
	);
	if (suppressed.length > 0) {
		console.log("\n  suppressions (each one is a decision):");
		for (const s of suppressed)
			console.log(`    ${s.where} — ${s.id} — ${s.reason || "(NO REASON)"}`);
	}
	return { live, dead, total };
}

/* ------------------------------ self-test ------------------------------ */

function selfTest() {
	const cases = [
		// The three false-positive patterns PLAN-0026 §4 R0 names by name.
		["applyUpdateV2(doc, update)", 0, "Y.js applyUpdateV2"],
		['headers: { "Accept-Version": "v1" }', 0, "Unsplash Accept-Version: v1"],
		['const tag = "v1.0.0-beta.0";', 0, "release prose v1.0.0-beta.0"],
		["import { applyUpdateV2, encodeStateAsUpdateV2 } from 'yjs';", 0, "yjs"],
		// Word-boundary discrimination between overlapping tombstones.
		[
			'props.__anvilkitInstance = "x";',
			1,
			"__anvilkitInstance, not __anvilkit",
		],
		["root.props.__anvilkit = {};", 1, "__anvilkit alone"],
		[
			"const p: EditorCommandPort = x;",
			1,
			"EditorCommandPort, not EditorCommand",
		],
		["type T = EditorCommand;", 1, "EditorCommand alone"],
		["const s: StyleTargetCapabilityV2Schema = z;", 1, "…V2Schema, not …V2"],
		// Genuine hits.
		["import type { AuthoringStateV1 } from './x';", 1, "AuthoringStateV1"],
		["migrate:puck-native-v2", 1, "filename tombstone"],
	];
	const matcher = buildMatcher(TOMBSTONES);
	let failed = 0;
	console.log("\n  self-test — matcher discrimination\n");
	for (const [line, expected, label] of cases) {
		matcher.lastIndex = 0;
		const got = [...line.matchAll(matcher)];
		const ok = got.length === expected;
		if (!ok) failed++;
		console.log(
			`    ${ok ? "ok  " : "FAIL"}  ${label.padEnd(38)} expected ${expected}, got ${got.length}${got.length ? ` [${got.map((m) => m[1]).join(", ")}]` : ""}`,
		);
	}

	// The shrink rule must fire on a synthetic dead entry.
	const synthetic = [
		{
			id: "AnvilKitDefinitelyNotPresentXyzzy",
			kind: "identifier",
			dies: "n/a",
		},
	];
	const res = scan(synthetic);
	const dead = res.hits.get(synthetic[0].id).length === 0;
	if (!dead) failed++;
	console.log(
		`    ${dead ? "ok  " : "FAIL"}  ${"shrink rule fires on a dead entry".padEnd(38)} ${dead ? "detected" : "NOT detected"}`,
	);

	console.log(
		failed === 0
			? "\n  self-test OK — no false positives, boundaries discriminate, shrink rule works\n"
			: `\n  self-test FAILED — ${failed} case(s)\n`,
	);
	return failed;
}

/* -------------------------------- main -------------------------------- */

const argv = new Set(process.argv.slice(2));
if (argv.has("--self-test")) process.exit(selfTest() === 0 ? 0 : 1);

const advisory = argv.has("--advisory");
const result = scan(TOMBSTONES);
const { live, dead, total } = report(TOMBSTONES, result);

const errors = [];
if (total > 0) {
	errors.push(
		`${total} banned-identifier occurrence(s) across ${live.length} tombstoned name(s)`,
	);
}
for (const r of dead) {
	errors.push(`tombstone "${r.id}" is dead — remove it from the list`);
}
for (const w of result.unreasoned) {
	errors.push(
		`${w} — suppression has no reason after "anvilkit-tombstone-ok:"`,
	);
}

if (errors.length === 0) {
	console.log("\ncheck:banned-identifiers OK — zero hits, list is empty\n");
	process.exit(0);
}
if (advisory) {
	console.log(
		`\ncheck:banned-identifiers ADVISORY — ${errors.length} problem(s); not failing the build.\n` +
			`  Blocking mode lands at p8-011. Track the countdown in docs/reports/.\n`,
	);
	process.exit(0);
}
console.error(
	`\ncheck:banned-identifiers FAILED (${errors.length} problem(s)):`,
);
for (const e of errors) console.error(`  ${e}`);
console.error(
	`\n  Fix by deleting the code, not by editing this list — except when an\n` +
		`  identifier has genuinely reached zero, in which case prune its row.\n`,
);
process.exit(1);
