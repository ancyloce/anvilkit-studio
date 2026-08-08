#!/usr/bin/env node
/**
 * PLAN-0028 §2 / `p0-003` — deferred-verification ledger checker.
 *
 * PLAN-0028 moves all testing to phase P8. Phases P0–P7 are refactoring,
 * and a refactor that strands a test file DELETES it rather than
 * skipping, commenting out or weakening it. The ledger
 * (`docs/tasks/0026-deferred-verification-ledger.md`) is the durable
 * record of every assertion removed that way, and rule 5 makes it
 * `p8-011`'s exit condition.
 *
 * A record nobody checks is a record nobody keeps. This script does two
 * jobs:
 *
 * 1. COVERAGE — given a git range, list every deleted or renamed test,
 *    spec, fixture or visual baseline, and report which deletions have
 *    no matching ledger row. This is the "did you file the row?" check,
 *    run before declaring any P1–P7 task done.
 *
 * 2. INTEGRITY — parse the ledger itself and enforce the rules that can
 *    be checked mechanically: statuses are from the closed set, a
 *    `superseded` row states a reason (rule 4 — "the code changed" is
 *    not a reason, so a bare `superseded` fails), `Restored by` names a
 *    P8 task that actually exists in the section index, and `Removed by`
 *    names a real phase task. Plus the counts `p8-011` needs.
 *
 * Modes:
 *   node scripts/check-ledger-coverage.mjs [range]        # advisory, exit 0
 *   node scripts/check-ledger-coverage.mjs [range] --strict
 *       fails on unrecorded deletions or malformed rows — things that
 *       are wrong in ANY phase.
 *   node scripts/check-ledger-coverage.mjs --require-closed
 *       additionally fails while any row is still `open`. This is
 *       `p8-011`'s mode and should fail for the whole of P1–P7.
 *   node scripts/check-ledger-coverage.mjs --self-test
 *
 * Default range is `HEAD~1..HEAD`. Advisory by default because during
 * refactor phases the ledger is a review aid, not a merge blocker.
 *
 * `EXAMPLE` rows (marked `EXAMPLE` in the `#` column) demonstrate the
 * expected granularity and are excluded from every count.
 *
 * No dependencies; runs on bare node.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LEDGER = "docs/tasks/0026-deferred-verification-ledger.md";

/** Artifacts whose loss the ledger exists to record. */
const TESTISH =
	/(?:\.(?:test|spec)\.[cm]?[jt]sx?$)|(?:[\\/]__tests__[\\/])|(?:-snapshots?[\\/].*\.(?:png|txt|snap)$)|(?:\.snap$)/;

const VALID_STATUS = new Set(["open", "closed", "superseded"]);

function git(args) {
	return execFileSync("git", args, {
		cwd: ROOT,
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
	});
}

/* ----------------------------- ledger parse ---------------------------- */

function parseLedger(text) {
	const rows = [];
	const index = [];
	let section = null;
	for (const raw of text.split("\n")) {
		const line = raw.trim();
		if (line.startsWith("## ")) {
			section = /ledger/i.test(line)
				? "ledger"
				: /section index/i.test(line)
					? "index"
					: null;
			continue;
		}
		if (!line.startsWith("|") || section === null) continue;
		const cells = line
			.split("|")
			.slice(1, -1)
			.map((c) => c.trim());
		if (cells.length === 0) continue;
		if (/^-+$/.test(cells[0].replace(/[:\s-]/g, "-"))) continue; // separator

		if (section === "index") {
			const task = (cells[1] ?? "").replace(/`/g, "").trim();
			if (/^p8-\d+$/.test(task)) index.push(task);
			continue;
		}
		// ledger table
		if (cells.length < 6) continue;
		const [num, artifact, behaviours, removedBy, restoredBy, status] = cells;
		if (/^#$/.test(num) || /^deleted artifact$/i.test(artifact)) continue; // header
		if (/^_?\(none yet/i.test(num) || artifact === "") continue; // placeholder
		rows.push({
			num,
			artifact: artifact.replace(/`/g, "").trim(),
			behaviours,
			removedBy: removedBy.replace(/`/g, "").trim(),
			restoredBy: restoredBy.replace(/`/g, "").trim(),
			statusRaw: status,
			status: status.replace(/`/g, "").split(/[—-]/)[0].trim().toLowerCase(),
			isExample: /^example$/i.test(num),
		});
	}
	return { rows, index };
}

function checkIntegrity(rows, index) {
	const problems = [];
	const real = rows.filter((r) => !r.isExample);
	for (const r of real) {
		const at = `ledger row ${r.num || "?"} (${r.artifact || "no artifact"})`;
		if (!VALID_STATUS.has(r.status)) {
			problems.push(
				`${at}: status "${r.statusRaw}" is not open/closed/superseded`,
			);
		}
		if (r.status === "superseded") {
			const reason = r.statusRaw
				.replace(/`/g, "")
				.replace(/^\s*superseded\s*/i, "");
			if (reason.replace(/^[—-]\s*/, "").trim().length < 12) {
				problems.push(
					`${at}: "superseded" needs a stated reason (rule 4 — "the code changed" is not one)`,
				);
			}
		}
		if (r.behaviours.length < 20) {
			problems.push(
				`${at}: behaviours cell is too thin to be behaviour-level (rule 2 — name what it asserted, not the file)`,
			);
		}
		// A task id, optionally followed by a note explaining the context.
		if (!/^p[0-8]-\d+\b/.test(r.removedBy)) {
			problems.push(
				`${at}: "Removed by" = "${r.removedBy}" is not a phase task id`,
			);
		}
		if (r.status !== "superseded" && !index.includes(r.restoredBy)) {
			problems.push(
				`${at}: "Restored by" = "${r.restoredBy}" is not a P8 task listed in the section index`,
			);
		}
	}
	return problems;
}

/* ---------------------------- coverage check --------------------------- */

function changedArtifacts(range) {
	let out;
	try {
		out = git(["diff", "--name-status", "--find-renames", range]);
	} catch (e) {
		return { error: String(e.message ?? e).split("\n")[0] };
	}
	const deleted = [];
	const renamed = [];
	for (const line of out.split("\n")) {
		if (!line.trim()) continue;
		const parts = line.split("\t");
		const code = parts[0];
		if (code.startsWith("D")) {
			if (TESTISH.test(parts[1])) deleted.push(parts[1]);
		} else if (code.startsWith("R")) {
			if (TESTISH.test(parts[1]))
				renamed.push({ from: parts[1], to: parts[2] });
		}
	}
	return { deleted, renamed };
}

/* ------------------------------ self-test ------------------------------ */

function selfTest() {
	let failed = 0;
	const say = (ok, label, detail = "") => {
		if (!ok) failed++;
		console.log(
			`    ${ok ? "ok  " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`,
		);
	};
	console.log("\n  self-test — ledger parser and artifact matcher\n");

	// Artifact matcher.
	for (const p of [
		"packages/runtime/core/src/editor/__tests__/reconcile.test.ts",
		"apps/studio/e2e/editor/inspector-tabs.spec.ts",
		"packages/x/src/__tests__/helper.ts",
		"apps/studio/e2e/__snapshots__/a.snap",
		"apps/studio/e2e/editor/visual.spec.ts-snapshots/shot.png",
	]) {
		say(TESTISH.test(p), `matches ${p.split("/").pop()}`);
	}
	for (const p of [
		"packages/runtime/core/src/puck/update-appearance.ts",
		"README.md",
	]) {
		say(!TESTISH.test(p), `ignores ${p.split("/").pop()}`);
	}

	// Parser + integrity on a synthetic ledger.
	const synthetic = `
## Ledger

| # | Deleted artifact | Behaviours asserted | Removed by | Restored by | Status |
|---|---|---|---|---|---|
| 1 | \`a/b/x.test.ts\` | a set-hidden patch at the md layer clears when set to null | \`p1-005\` | \`p8-001\` | open |
| 2 | \`a/b/y.test.ts\` | cascade layer precedence and reset-at-layer semantics | \`p1-005\` | \`p8-001\` | closed |
| 3 | \`a/b/z.test.ts\` | thin | \`nope\` | \`p8-999\` | banana |
| EXAMPLE | \`a/b/e.test.ts\` | demonstrates the expected behaviour-level granularity here | \`p1-005\` | \`p8-001\` | open |

## Section index

| Coverage class | Restoring task |
|---|---|
| Read model | \`p8-001\` |
`;
	const { rows, index } = parseLedger(synthetic);
	say(rows.length === 4, "parses 4 rows incl. EXAMPLE", `got ${rows.length}`);
	say(index.length === 1 && index[0] === "p8-001", "parses the section index");
	const real = rows.filter((r) => !r.isExample);
	say(
		real.length === 3,
		"EXAMPLE excluded from real rows",
		`got ${real.length}`,
	);
	say(
		real.filter((r) => r.status === "open").length === 1,
		"counts exactly one open row (EXAMPLE not counted)",
	);
	const problems = checkIntegrity(rows, index);
	// Row 3 is deliberately wrong in four independent ways: an invalid
	// status, a behaviours cell too thin to be behaviour-level, a
	// "Removed by" that is not a phase task, and a "Restored by" naming a
	// P8 task absent from the section index.
	say(
		problems.length === 4,
		"the malformed row raises all 4 of its problems",
		`got ${problems.length}${problems.length ? `: ${problems.map((p) => p.split(": ")[1]?.slice(0, 20)).join(" | ")}` : ""}`,
	);
	say(
		checkIntegrity([rows[0], rows[1]], index).length === 0,
		"well-formed rows raise nothing",
	);

	console.log(
		failed === 0
			? "\n  self-test OK — matcher and parser behave\n"
			: `\n  self-test FAILED — ${failed} case(s)\n`,
	);
	return failed;
}

/* -------------------------------- main --------------------------------- */

const argv = process.argv.slice(2);
if (argv.includes("--self-test")) process.exit(selfTest() === 0 ? 0 : 1);

const strict = argv.includes("--strict");
const requireClosed = argv.includes("--require-closed");
const range = argv.find((a) => !a.startsWith("--")) ?? "HEAD~1..HEAD";

const text = readFileSync(new URL(`../${LEDGER}`, import.meta.url), "utf8");
const { rows, index } = parseLedger(text);
const real = rows.filter((r) => !r.isExample);
const open = real.filter((r) => r.status === "open");
const closed = real.filter((r) => r.status === "closed");
const superseded = real.filter((r) => r.status === "superseded");
const examples = rows.filter((r) => r.isExample);

const integrity = checkIntegrity(rows, index);
const { deleted, renamed, error } = changedArtifacts(range);

console.log(`\n  ledger: ${LEDGER}`);
console.log(
	`  rows: ${real.length} real (${open.length} open · ${closed.length} closed · ${superseded.length} superseded) + ${examples.length} example · section index lists ${index.length} P8 tasks`,
);

if (error) {
	console.log(`\n  range ${range}: could not diff — ${error}`);
} else {
	const recorded = new Set(real.concat(examples).map((r) => r.artifact));
	const unrecorded = deleted.filter(
		(p) =>
			![...recorded].some((a) => a === p || a.endsWith(p) || p.endsWith(a)),
	);
	console.log(
		`  range ${range}: ${deleted.length} test-artifact deletion(s), ${renamed.length} rename(s)`,
	);
	if (renamed.length > 0) {
		console.log("\n  renamed (informational — coverage moved, not lost):");
		for (const r of renamed) console.log(`    ${r.from}\n      -> ${r.to}`);
	}
	if (unrecorded.length > 0) {
		console.log(`\n  UNRECORDED deletions — file a ledger row for each:`);
		for (const p of unrecorded) console.log(`    ${p}`);
	} else if (deleted.length > 0) {
		console.log("\n  every deletion in this range has a ledger row.");
	}
	globalThis.__unrecorded = unrecorded;
}

if (integrity.length > 0) {
	console.log(`\n  ledger integrity problems:`);
	for (const p of integrity) console.log(`    ${p}`);
}

const unrecorded = globalThis.__unrecorded ?? [];
const errors = [];
if (unrecorded.length > 0)
	errors.push(
		`${unrecorded.length} deleted test artifact(s) with no ledger row`,
	);
errors.push(...integrity);
if (requireClosed && open.length > 0)
	errors.push(`${open.length} ledger row(s) still open`);

if (errors.length === 0) {
	console.log(
		`\ncheck:ledger OK${requireClosed ? " — every row closed" : ""}\n`,
	);
	process.exit(0);
}
if (!strict && !requireClosed) {
	console.log(
		`\ncheck:ledger ADVISORY — ${errors.length} problem(s); not failing.\n` +
			`  Advisory during P1–P7 by design; \`p8-011\` runs --require-closed.\n`,
	);
	process.exit(0);
}
console.error(`\ncheck:ledger FAILED (${errors.length} problem(s)):`);
for (const e of errors) console.error(`  ${e}`);
process.exit(1);
