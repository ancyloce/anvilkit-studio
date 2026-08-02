#!/usr/bin/env node
/**
 * @file Release-readiness baseline presence gate (PLAN-0020
 * CORE-P4-001/-002/-007; DD-0019 §28, §32.1).
 *
 * Two certification artifacts are **CI-capture-only by policy** and
 * therefore easy to forget until a release is already cut:
 *
 * 1. `bench/baselines/editor-perf.json` — the §28 regression gate's
 *    input. Absent, the `editor-perf` job still enforces the absolute
 *    budgets but the >10 % regression half degrades to "could not
 *    compare"; the job is configured with
 *    `ANVILKIT_BENCH_REQUIRE_BASELINE=1` so that degradation is a hard
 *    failure there, and this gate makes it visible *before* a release
 *    walk rather than during one.
 * 2. Playwright visual baselines for `visual-regression.spec.ts` —
 *    without them the `editor-visual` project has nothing to compare
 *    against, so the pixel guard certifies nothing.
 *
 * ### Why this is a separate gate, not part of `check:all`
 *
 * Neither artifact can be produced on a developer machine: the perf
 * baseline must come from the recorded hardware class
 * (`ci-ubuntu-latest-x64`) or its numbers are meaningless, and WSL2
 * headless screenshot capture is verified broken on this box. Wiring
 * the presence check into the per-PR gate would make every
 * contributor's `check:all` fail for a condition only a maintainer
 * can resolve. It runs at release-readiness time, where "capture the
 * baselines first" is the correct answer.
 *
 * Exit 0 = both present. Exit 1 = at least one missing, with the exact
 * `workflow_dispatch` inputs needed to produce it.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const coreRoot = resolve(here, "..");
const repoRoot = resolve(coreRoot, "../../..");

const PERF_BASELINE = join(coreRoot, "bench/baselines/editor-perf.json");
const VISUAL_SNAPSHOTS = join(
	repoRoot,
	"apps/studio/e2e/editor/visual-regression.spec.ts-snapshots",
);

/** The hardware class a gating perf baseline must have been captured on. */
const REFERENCE_HARDWARE_CLASS = "ci-ubuntu-latest-x64";

const problems = [];

if (!existsSync(PERF_BASELINE)) {
	problems.push(
		`MISSING  packages/runtime/core/bench/baselines/editor-perf.json\n` +
			`         The §28 >10% regression comparison has no input.\n` +
			`         Capture: run the CI workflow via workflow_dispatch with\n` +
			`         \`capture_perf_baseline: true\`, download the\n` +
			`         \`editor-perf-baseline\` artifact, and commit it to that path.`,
	);
} else {
	let baseline;
	try {
		baseline = JSON.parse(readFileSync(PERF_BASELINE, "utf8"));
	} catch (error) {
		problems.push(
			`INVALID  bench/baselines/editor-perf.json is not valid JSON: ${String(error)}`,
		);
	}
	if (baseline !== undefined) {
		// A baseline captured on a dev box is worse than none: it looks
		// like the gate is armed while comparing against numbers from
		// unrelated hardware (the run is then skipped as a class
		// mismatch, silently).
		if (baseline.hardwareClass !== REFERENCE_HARDWARE_CLASS) {
			problems.push(
				`WRONG HW packages/runtime/core/bench/baselines/editor-perf.json\n` +
					`         hardwareClass is "${baseline.hardwareClass}", expected ` +
					`"${REFERENCE_HARDWARE_CLASS}".\n` +
					`         A baseline from another machine is never compared against\n` +
					`         (class mismatch skips the check), so this arms nothing.\n` +
					`         Re-capture on the reference runner.`,
			);
		}
		if (!Array.isArray(baseline.metrics) || baseline.metrics.length === 0) {
			problems.push(
				`EMPTY    bench/baselines/editor-perf.json records no metrics.`,
			);
		}
	}
}

if (!existsSync(VISUAL_SNAPSHOTS)) {
	problems.push(
		`MISSING  apps/studio/e2e/editor/visual-regression.spec.ts-snapshots/\n` +
			`         The editor-visual project has no baselines to compare against.\n` +
			`         Capture: run the CI workflow via workflow_dispatch with\n` +
			`         \`capture_visual_baselines: true\`, download the\n` +
			`         \`editor-visual-baselines\` artifact, and commit its contents\n` +
			`         to that directory. Do NOT commit locally generated PNGs —\n` +
			`         WSL2 headless screenshot capture is verified broken here and\n` +
			`         font rendering differs from the Ubuntu CI image regardless.`,
	);
} else {
	const shots = readdirSync(VISUAL_SNAPSHOTS).filter((name) =>
		name.endsWith(".png"),
	);
	if (shots.length === 0) {
		problems.push(
			`EMPTY    apps/studio/e2e/editor/visual-regression.spec.ts-snapshots/ ` +
				`contains no .png baselines.`,
		);
	} else {
		const empty = shots.filter(
			(name) => statSync(join(VISUAL_SNAPSHOTS, name)).size === 0,
		);
		if (empty.length > 0) {
			problems.push(`EMPTY    zero-byte visual baselines: ${empty.join(", ")}`);
		}
	}
}

if (problems.length > 0) {
	console.error(
		"check-release-baselines: FAIL — certification baselines are missing.\n",
	);
	for (const problem of problems) {
		console.error(`${problem}\n`);
	}
	console.error(
		"These artifacts are CI-capture-only by policy. Do not fabricate them\n" +
			"and do not commit locally generated ones; both would certify nothing.",
	);
	process.exit(1);
}

console.log(
	"check-release-baselines: OK — perf baseline " +
		`(${REFERENCE_HARDWARE_CLASS}) and visual snapshots are present.`,
);
