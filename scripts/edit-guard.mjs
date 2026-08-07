#!/usr/bin/env node
/**
 * PLAN-0026 §7 / PLAN-0028 `p0-004` — mechanical concurrent-edit guard.
 *
 * WHY THIS IS A SCRIPT AND NOT A CHECKLIST ITEM.
 *
 * PLAN-0026 §7 records that a concurrent session mutating this checkout
 * mid-phase has cost real edits **twice**, and that the mitigation in
 * force at the time — "per-task `git status` discipline" — is not a
 * control. `p0-004` was written to make it mechanical.
 *
 * The `phase-execute` skill already specifies the right idea: SKILL.md
 * §3a says `sha256sum <each target file>` and record it in the task's
 * `fileHashes`. But every one of the 8 tasks recorded in
 * `.claude/state/phase-run.json` carries `"fileHashes": {}` — the field
 * is declared and has never once been populated. A prose instruction
 * with an 0/8 compliance rate is not a control either; it is a control
 * that has already failed silently.
 *
 * So the guard is a command. It has three verbs:
 *
 *   record <task-id> <file...>   hash the files a task will touch
 *   verify <task-id> [file...]   re-hash and ABORT on mismatch
 *   status [task-id]             show what is being guarded
 *
 * Usage inside a task:
 *
 *   node scripts/edit-guard.mjs record p1-001 packages/.../appearance.ts
 *   ... do the reading and thinking ...
 *   node scripts/edit-guard.mjs verify p1-001    # before the FIRST write
 *   ... write ...
 *   node scripts/edit-guard.mjs verify p1-001    # before EACH later write
 *
 * A mismatch means someone else changed the file since you read it.
 * The correct response is NOT to retry: re-read the file, re-derive the
 * edit against the new content, and re-record. Re-applying an edit
 * derived from stale content is exactly how the two recorded losses
 * happened.
 *
 * State lives beside the phase checkpoint in `.claude/state/edit-guard.json`
 * rather than inside `phase-run.json`, so the guard works for ad-hoc
 * sessions that are not driving a numbered phase — which is most of
 * them, and which is where both losses actually occurred.
 *
 * Exit codes: 0 clean · 1 drift detected · 2 usage error.
 * No dependencies; runs on bare node.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const STATE = resolve(ROOT, ".claude/state/edit-guard.json");

const hashOf = (abs) => {
	try {
		return createHash("sha256").update(readFileSync(abs)).digest("hex");
	} catch (e) {
		return e.code === "ENOENT" ? "<absent>" : `<unreadable:${e.code}>`;
	}
};

function load() {
	try {
		return JSON.parse(readFileSync(STATE, "utf8"));
	} catch {
		return { version: 1, tasks: {} };
	}
}

function save(state) {
	mkdirSync(dirname(STATE), { recursive: true });
	writeFileSync(STATE, `${JSON.stringify(state, null, "\t")}\n`);
}

const [verb, taskId, ...files] = process.argv.slice(2);

if (!verb || (verb !== "status" && !taskId)) {
	console.error(
		"usage: edit-guard.mjs record <task-id> <file...>\n" +
			"       edit-guard.mjs verify <task-id> [file...]\n" +
			"       edit-guard.mjs status [task-id]",
	);
	process.exit(2);
}

const state = load();

if (verb === "record") {
	if (files.length === 0) {
		console.error("record needs at least one file");
		process.exit(2);
	}
	const map = {};
	for (const f of files) {
		const rel = relative(ROOT, resolve(ROOT, f));
		map[rel] = hashOf(resolve(ROOT, f));
	}
	state.tasks[taskId] = { recordedAt: new Date().toISOString(), files: map };
	save(state);
	console.log(
		`edit-guard: recorded ${Object.keys(map).length} file(s) for ${taskId}`,
	);
	for (const [f, h] of Object.entries(map)) {
		console.log(
			`  ${h === "<absent>" ? "(new)   " : `${h.slice(0, 12)}`}  ${f}`,
		);
	}
	process.exit(0);
}

if (verb === "verify") {
	const entry = state.tasks[taskId];
	if (!entry) {
		console.error(
			`edit-guard: nothing recorded for "${taskId}" — run \`record\` before the first write.\n` +
				"  Verifying nothing is not the same as verifying no drift.",
		);
		process.exit(2);
	}
	const targets =
		files.length > 0
			? files.map((f) => relative(ROOT, resolve(ROOT, f)))
			: Object.keys(entry.files);
	const drift = [];
	for (const rel of targets) {
		const was = entry.files[rel];
		if (was === undefined) {
			drift.push({
				rel,
				was: "<not recorded>",
				now: hashOf(resolve(ROOT, rel)),
			});
			continue;
		}
		const now = hashOf(resolve(ROOT, rel));
		if (now !== was) drift.push({ rel, was, now });
	}
	if (drift.length === 0) {
		console.log(
			`edit-guard: ${targets.length} file(s) unchanged since record — safe to write`,
		);
		process.exit(0);
	}
	console.error(
		`\nedit-guard: ABORT — ${drift.length} file(s) changed since you recorded them.\n`,
	);
	for (const d of drift) {
		console.error(`  ${d.rel}`);
		console.error(`    recorded: ${d.was}`);
		console.error(`    now:      ${d.now}`);
	}
	console.error(
		"\n  Someone else changed these while you were working. Do NOT re-apply an\n" +
			"  edit derived from the old content — that is how the two losses in this\n" +
			"  repo's history happened. Re-read, re-derive against the new content,\n" +
			"  then `record` again.\n",
	);
	process.exit(1);
}

if (verb === "status") {
	const ids = taskId ? [taskId] : Object.keys(state.tasks);
	if (ids.length === 0) {
		console.log("edit-guard: nothing recorded");
		process.exit(0);
	}
	for (const id of ids) {
		const e = state.tasks[id];
		if (!e) {
			console.log(`  ${id}: nothing recorded`);
			continue;
		}
		console.log(`  ${id} (recorded ${e.recordedAt}):`);
		for (const [f, h] of Object.entries(e.files)) {
			const now = hashOf(resolve(ROOT, f));
			console.log(`    ${now === h ? "ok  " : "DRIFT"}  ${f}`);
		}
	}
	process.exit(0);
}

console.error(`unknown verb "${verb}"`);
process.exit(2);
