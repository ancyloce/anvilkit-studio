/**
 * @file Harness self-test + intentional-regression canary
 * (PLAN-0020 CORE-P4-001 "Val: harness self-test;
 * intentional-regression canary").
 *
 * The §28 gate is only worth having if it actually fails on a
 * regression. These tests inject synthetically slowed runs and assert
 * the verdict, so the gate's failure path is exercised on every
 * `pnpm test` — not just on the day a real regression lands.
 */

import { describe, expect, it } from "vitest";
import type { BenchMetric, BenchRun } from "../bench-compare.js";
import {
	BENCH_REGRESSION_TOLERANCE,
	compareBenchRun,
	formatBenchRun,
	summarizeSamples,
} from "../bench-compare.js";
import { buildPerfProfile, PERF_PROFILE_PRESETS } from "../perf-profiles.js";

function metric(overrides?: Partial<BenchMetric>): BenchMetric {
	return {
		id: "sidecar.parse",
		profile: "1k",
		budgetLabel: "Sidecar parse",
		budgetMs: 30,
		median: 10,
		p95: 12,
		runs: 20,
		...overrides,
	};
}

function run(
	metrics: readonly BenchMetric[],
	hardware = "ci-linux-x64",
): BenchRun {
	return {
		hardwareClass: hardware,
		capturedAt: "2026-07-27T00:00:00.000Z",
		metrics,
	};
}

describe("summarizeSamples", () => {
	it("reports the median and an actually-observed p95", () => {
		const samples = Array.from({ length: 20 }, (_, index) => index + 1);
		const summary = summarizeSamples(samples);
		expect(summary.runs).toBe(20);
		expect(summary.median).toBe(10.5);
		// Nearest-rank p95 of 20 samples = the 19th value, never a
		// synthesized interpolation.
		expect(summary.p95).toBe(19);
	});

	it("is defined for an empty sample set", () => {
		expect(summarizeSamples([])).toEqual({ median: 0, p95: 0, runs: 0 });
	});

	it("does not mutate its input", () => {
		const samples = [5, 1, 3];
		summarizeSamples(samples);
		expect(samples).toEqual([5, 1, 3]);
	});
});

describe("absolute §28 budgets", () => {
	it("passes when p95 is inside the budget", () => {
		const verdict = compareBenchRun(run([metric()]), null);
		expect(verdict.ok).toBe(true);
		expect(verdict.regressionChecked).toBe(false);
	});

	it("fails on a budget violation even with no baseline", () => {
		const verdict = compareBenchRun(run([metric({ p95: 31 })]), null);
		expect(verdict.ok).toBe(false);
		expect(verdict.violations[0]?.kind).toBe("budget");
		expect(verdict.violations[0]?.message).toContain("§28 budget of 30 ms");
	});

	it("gates on p95, not the median — a tail regression must not hide", () => {
		const verdict = compareBenchRun(
			run([metric({ median: 1, p95: 400 })]),
			null,
		);
		expect(verdict.violations).toHaveLength(1);
	});

	it("ignores trend-only metrics that declare no budget", () => {
		const verdict = compareBenchRun(
			run([metric({ budgetMs: null, p95: 10_000 })]),
			null,
		);
		expect(verdict.ok).toBe(true);
	});

	it("can be skipped explicitly for local exploration", () => {
		const verdict = compareBenchRun(run([metric({ p95: 999 })]), null, {
			skipBudgets: true,
		});
		expect(verdict.ok).toBe(true);
	});
});

describe("regression canary", () => {
	const baseline = run([metric({ p95: 20, median: 18 })]);

	it("fails a run that is >10% slower than the baseline", () => {
		// 20 ms → 23 ms is +15%: past the §28 tolerance.
		const verdict = compareBenchRun(run([metric({ p95: 23 })]), baseline);
		expect(verdict.regressionChecked).toBe(true);
		expect(verdict.ok).toBe(false);
		expect(verdict.violations[0]?.kind).toBe("regression");
		expect(verdict.violations[0]?.message).toContain("15.0% slower");
	});

	it("passes a run inside the tolerance", () => {
		// +9%, below the >10% threshold.
		const verdict = compareBenchRun(run([metric({ p95: 21.8 })]), baseline);
		expect(verdict.ok).toBe(true);
	});

	it("treats exactly 10% as within tolerance (§28 says 'more than')", () => {
		const verdict = compareBenchRun(
			run([metric({ p95: 20 * (1 + BENCH_REGRESSION_TOLERANCE) })]),
			baseline,
		);
		expect(verdict.ok).toBe(true);
	});

	it("never flags an improvement", () => {
		const verdict = compareBenchRun(run([metric({ p95: 4 })]), baseline);
		expect(verdict.ok).toBe(true);
	});

	it("ignores sub-millisecond drift on tiny metrics", () => {
		// 0.2 ms → 0.9 ms is +350% but only 0.7 ms of wall clock: pure
		// scheduler noise, and flagging it would train people to ignore
		// the gate.
		const tiny = run([
			metric({ id: "dispatch.sidecar.overhead", p95: 0.9, budgetMs: 5 }),
		]);
		const tinyBaseline = run([
			metric({ id: "dispatch.sidecar.overhead", p95: 0.2, budgetMs: 5 }),
		]);
		expect(compareBenchRun(tiny, tinyBaseline).ok).toBe(true);
	});

	it("still flags a large absolute regression on a small metric", () => {
		const slow = run([
			metric({ id: "dispatch.sidecar.overhead", p95: 4, budgetMs: 5 }),
		]);
		const fast = run([
			metric({ id: "dispatch.sidecar.overhead", p95: 1, budgetMs: 5 }),
		]);
		expect(compareBenchRun(slow, fast).ok).toBe(false);
	});

	it("skips comparison across hardware classes rather than reporting noise", () => {
		const verdict = compareBenchRun(
			run([metric({ p95: 100, budgetMs: null })], "local-linux-x64"),
			baseline,
		);
		expect(verdict.regressionChecked).toBe(false);
		expect(verdict.ok).toBe(true);
		expect(verdict.notes[0]?.message).toContain("hardware class");
	});

	it("notes a new metric instead of failing it", () => {
		const verdict = compareBenchRun(
			run([metric(), metric({ id: "layer.search", budgetMs: 100, p95: 30 })]),
			baseline,
		);
		expect(verdict.ok).toBe(true);
		expect(verdict.notes.some((note) => note.metricId === "layer.search")).toBe(
			true,
		);
	});
});

// REVIEW-0019 §2 P1: the audited gate reported green while its
// regression half never executed. These assert the *inverse* of the
// canary above — not "does a regression fail" but "does a run that
// could not check for regressions fail when checking was required".
describe("requireBaseline (CI regression-gate integrity)", () => {
	it("fails when no baseline is stored", () => {
		const verdict = compareBenchRun(run([metric()]), null, {
			requireBaseline: true,
		});
		expect(verdict.regressionChecked).toBe(false);
		expect(verdict.ok).toBe(false);
		expect(verdict.violations).toHaveLength(1);
		expect(verdict.violations[0]?.kind).toBe("baseline");
		// The message must carry the fix, not just the diagnosis: a CI log
		// reader has no other place to learn how to capture a baseline.
		expect(verdict.violations[0]?.message).toContain(
			"ANVILKIT_BENCH_UPDATE_BASELINE=1",
		);
		expect(verdict.violations[0]?.message).toContain(
			"bench/baselines/editor-perf.json",
		);
	});

	it("fails when the stored baseline is from another hardware class", () => {
		const verdict = compareBenchRun(
			run([metric()], "ci-ubuntu-latest-x64"),
			run([metric()], "local-linux-x64"),
			{ requireBaseline: true },
		);
		expect(verdict.regressionChecked).toBe(false);
		expect(verdict.ok).toBe(false);
		expect(verdict.violations[0]?.kind).toBe("baseline");
		expect(verdict.violations[0]?.message).toContain("hardware class");
	});

	it("still reports budget violations alongside the baseline violation", () => {
		const verdict = compareBenchRun(
			run([metric({ p95: 999, budgetMs: 30 })]),
			null,
			{ requireBaseline: true },
		);
		expect(verdict.violations.map((violation) => violation.kind)).toEqual([
			"budget",
			"baseline",
		]);
	});

	it("passes — and reports regressionChecked — with a matching baseline", () => {
		const verdict = compareBenchRun(run([metric()]), run([metric()]), {
			requireBaseline: true,
		});
		expect(verdict.regressionChecked).toBe(true);
		expect(verdict.ok).toBe(true);
		expect(verdict.violations).toEqual([]);
	});

	it("stays advisory by default so a dev run still reports budgets", () => {
		const verdict = compareBenchRun(run([metric()]), null);
		expect(verdict.ok).toBe(true);
		expect(verdict.regressionChecked).toBe(false);
		expect(verdict.notes[0]?.message).toContain("no stored baseline");
	});
});

describe("formatBenchRun", () => {
	it("marks each metric PASS or FAIL against its budget", () => {
		const text = formatBenchRun(
			run([metric(), metric({ id: "layer.search", budgetMs: 5, p95: 40 })]),
		);
		expect(text).toContain("PASS 1k   sidecar.parse");
		expect(text).toContain("FAIL 1k   layer.search");
		expect(text).toContain("hardware class: ci-linux-x64");
	});
});

describe("perf profiles are fixed inputs", () => {
	it("builds the frozen §14 1k shape", () => {
		const profile = buildPerfProfile("1k");
		expect(profile.data.content).toHaveLength(1_000);
		expect(Object.keys(profile.authoring.nodes)).toHaveLength(
			PERF_PROFILE_PRESETS["1k"].authoringRecords,
		);
		expect(profile.authoring.breakpoints).toHaveLength(3);
	});

	it("is deterministic — two builds are byte-identical", () => {
		const a = buildPerfProfile({
			treeNodes: 40,
			authoringRecords: 8,
			breakpoints: 3,
			tokens: 10,
			childrenPerContainer: 4,
		});
		const b = buildPerfProfile({
			treeNodes: 40,
			authoringRecords: 8,
			breakpoints: 3,
			tokens: 10,
			childrenPerContainer: 4,
		});
		expect(JSON.stringify(a.data)).toBe(JSON.stringify(b.data));
		expect(JSON.stringify(a.layerRoots)).toBe(JSON.stringify(b.layerRoots));
	});

	it("spreads authoring records across the tree, not just the head", () => {
		const profile = buildPerfProfile({
			treeNodes: 100,
			authoringRecords: 10,
			breakpoints: 3,
			tokens: 10,
			childrenPerContainer: 5,
		});
		const indices = Object.keys(profile.authoring.nodes).map((id) =>
			Number(id.replace("perf-", "")),
		);
		expect(Math.max(...indices)).toBeGreaterThan(50);
	});

	it("attaches the sidecar only to the sidecar-bearing document", () => {
		const profile = buildPerfProfile({
			treeNodes: 10,
			authoringRecords: 2,
			breakpoints: 3,
			tokens: 4,
			childrenPerContainer: 5,
		});
		const bareProps = profile.bareData.root.props as Record<string, unknown>;
		const props = profile.data.root.props as Record<string, unknown>;
		expect(bareProps.__anvilkit).toBeUndefined();
		expect(props.__anvilkit).toBeDefined();
	});

	it("declares mixed capabilities so scans have real work", () => {
		const profile = buildPerfProfile("1k");
		expect(
			profile.capabilities.forComponent("Image")?.capabilities.imageAdjust,
		).toBeDefined();
		expect(
			profile.capabilities.forComponent("Box")?.capabilities.imageAdjust,
		).toBeUndefined();
		expect(profile.capabilities.forComponent("Unknown")).toBeUndefined();
	});
});
