/**
 * @file The §28 performance gate: budgets, 20-run statistics, and
 * baseline regression comparison (PLAN-0020 CORE-P4-001).
 *
 * Pure by design — the harness measures, this module *judges* — so the
 * judgement is unit-testable without running a single benchmark. The
 * intentional-regression canary in `__tests__/bench-compare.test.ts`
 * feeds it a synthetically slowed run and asserts it fails; a gate
 * nobody has ever seen fail is not a gate.
 *
 * ### Two independent verdicts
 *
 * 1. **Absolute budgets** (§28 table) — always enforced. They are
 *    hardware-*sensitive* but not hardware-*relative*: a run slower
 *    than the budget on the reference class is a failure wherever it
 *    is observed, and a machine faster than the reference class simply
 *    never trips it.
 * 2. **Regression vs baseline** (>10%) — enforced only when the stored
 *    baseline was captured on the **same hardware class**. Plan §14 is
 *    explicit that gating numbers come from CI runners with a recorded
 *    class; comparing a GitHub runner against a WSL2 laptop baseline
 *    would produce noise, not signal, so a class mismatch downgrades
 *    the comparison to informational instead of pretending to gate.
 */

/** Milliseconds, median and p95, over a fixed run count. */
export interface BenchSample {
	readonly median: number;
	readonly p95: number;
	readonly runs: number;
}

/** One measured scenario in one profile. */
export interface BenchMetric extends BenchSample {
	/** Stable metric id, e.g. `sidecar.parse`. */
	readonly id: string;
	/** Profile id the metric was measured on (`1k` / `10k`). */
	readonly profile: string;
	/** The §28 row this metric implements. */
	readonly budgetLabel: string;
	/** Absolute §28 ceiling in ms; `null` = trend-only metric. */
	readonly budgetMs: number | null;
}

/** A complete harness run, the shape written to disk. */
export interface BenchRun {
	/** Reference-class identifier, e.g. `github-ubuntu-latest`. */
	readonly hardwareClass: string;
	/** ISO timestamp; informational only, never compared. */
	readonly capturedAt: string;
	readonly metrics: readonly BenchMetric[];
}

/**
 * Why a run failed the gate.
 *
 * `"baseline"` exists because the other two kinds cannot express the
 * failure mode that actually shipped: a gate whose baseline is absent
 * reported *green* while measuring half of what it claimed. Under
 * {@link BenchCompareOptions.requireBaseline} a missing or
 * wrong-hardware-class baseline is a violation, not a note.
 */
export interface BenchViolation {
	readonly kind: "budget" | "regression" | "baseline";
	readonly metricId: string;
	readonly profile: string;
	readonly message: string;
}

/** Informational note that did not fail the run. */
export interface BenchNote {
	readonly metricId: string;
	readonly profile: string;
	readonly message: string;
}

/** The gate verdict. */
export interface BenchComparison {
	readonly ok: boolean;
	readonly violations: readonly BenchViolation[];
	readonly notes: readonly BenchNote[];
	/** True when regression comparison actually ran. */
	readonly regressionChecked: boolean;
}

/** Tuning for {@link compareBenchRun}. */
export interface BenchCompareOptions {
	/**
	 * Fractional slowdown tolerated before a regression fails
	 * (§28: "more than 10%"). Defaults to `0.1`.
	 */
	readonly regressionTolerance?: number;
	/**
	 * Floor below which a relative regression is ignored, in ms.
	 * Sub-millisecond metrics swing by >10% from scheduler noise
	 * alone; without a floor the gate reports drift, not regressions.
	 * Defaults to `1`.
	 */
	readonly noiseFloorMs?: number;
	/** Skip absolute-budget enforcement (local exploration only). */
	readonly skipBudgets?: boolean;
	/**
	 * Fail the run when regression comparison could not happen — no
	 * stored baseline, or one recorded against a different hardware
	 * class. Defaults to `false` so a developer's ad-hoc run still
	 * reports budgets.
	 *
	 * CI sets this. §28's regression half is the *only* thing that
	 * catches slow drift inside the absolute budgets, so a CI run that
	 * silently skips it is a gate reporting green while measuring
	 * nothing — the exact failure this flag makes impossible.
	 */
	readonly requireBaseline?: boolean;
}

/** §28: fail on **more than** 10% regression. */
export const BENCH_REGRESSION_TOLERANCE = 0.1;

/** Sub-ms metrics are noise-dominated; see {@link BenchCompareOptions}. */
export const BENCH_NOISE_FLOOR_MS = 1;

const keyOf = (metric: { id: string; profile: string }): string =>
	`${metric.profile}/${metric.id}`;

/**
 * Median and p95 over raw samples. p95 uses the nearest-rank method
 * (no interpolation) so a 20-run set reports an actually-observed
 * sample rather than a synthesized one.
 */
export function summarizeSamples(samples: readonly number[]): BenchSample {
	if (samples.length === 0) {
		return { median: 0, p95: 0, runs: 0 };
	}
	const sorted = [...samples].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	const median =
		sorted.length % 2 === 0
			? ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2
			: (sorted[mid] as number);
	const rank = Math.min(
		sorted.length - 1,
		Math.max(0, Math.ceil(sorted.length * 0.95) - 1),
	);
	return { median, p95: sorted[rank] as number, runs: sorted.length };
}

/**
 * Judge a run against the §28 budgets and, when the hardware classes
 * match, against a stored baseline.
 */
export function compareBenchRun(
	current: BenchRun,
	baseline: BenchRun | null,
	options?: BenchCompareOptions,
): BenchComparison {
	const tolerance = options?.regressionTolerance ?? BENCH_REGRESSION_TOLERANCE;
	const floor = options?.noiseFloorMs ?? BENCH_NOISE_FLOOR_MS;
	const violations: BenchViolation[] = [];
	const notes: BenchNote[] = [];

	if (options?.skipBudgets !== true) {
		for (const metric of current.metrics) {
			if (metric.budgetMs === null) {
				continue;
			}
			// p95 is the gated statistic: §28 states its latency rows as
			// p95 and a median-only gate hides tail regressions entirely.
			if (metric.p95 > metric.budgetMs) {
				violations.push({
					kind: "budget",
					metricId: metric.id,
					profile: metric.profile,
					message:
						`${metric.budgetLabel} @${metric.profile}: p95 ` +
						`${metric.p95.toFixed(2)} ms exceeds the §28 budget of ` +
						`${metric.budgetMs} ms`,
				});
			}
		}
	}

	// One helper for both "cannot compare" exits so the required-vs-
	// advisory decision is made in exactly one place.
	const unchecked = (message: string): BenchComparison => {
		if (options?.requireBaseline === true) {
			violations.push({
				kind: "baseline",
				metricId: "*",
				profile: "*",
				message: `${message}. A baseline is REQUIRED here: capture it on this runner with \`ANVILKIT_BENCH_UPDATE_BASELINE=1 pnpm --filter @anvilkit/core bench:editor\` and commit \`packages/runtime/core/bench/baselines/editor-perf.json\`.`,
			});
		} else {
			notes.push({ metricId: "*", profile: "*", message });
		}
		return {
			ok: violations.length === 0,
			violations,
			notes,
			regressionChecked: false,
		};
	};

	if (baseline === null) {
		return unchecked(
			"no stored baseline — regression comparison skipped (budgets still enforced)",
		);
	}

	if (baseline.hardwareClass !== current.hardwareClass) {
		return unchecked(
			`baseline hardware class "${baseline.hardwareClass}" ≠ current ` +
				`"${current.hardwareClass}" — regression comparison skipped ` +
				"(plan §14: gating numbers come from a recorded hardware class)",
		);
	}

	const baselineByKey = new Map(
		baseline.metrics.map((metric) => [keyOf(metric), metric]),
	);
	for (const metric of current.metrics) {
		const previous = baselineByKey.get(keyOf(metric));
		if (previous === undefined) {
			notes.push({
				metricId: metric.id,
				profile: metric.profile,
				message: "new metric — no baseline entry to compare against",
			});
			continue;
		}
		if (previous.p95 <= 0) {
			continue;
		}
		const delta = (metric.p95 - previous.p95) / previous.p95;
		if (metric.p95 - previous.p95 <= floor) {
			continue;
		}
		if (delta > tolerance) {
			violations.push({
				kind: "regression",
				metricId: metric.id,
				profile: metric.profile,
				message:
					`${metric.budgetLabel} @${metric.profile}: p95 ` +
					`${metric.p95.toFixed(2)} ms is ${(delta * 100).toFixed(1)}% ` +
					`slower than the baseline ${previous.p95.toFixed(2)} ms ` +
					`(tolerance ${(tolerance * 100).toFixed(0)}%)`,
			});
		}
	}

	return {
		ok: violations.length === 0,
		violations,
		notes,
		regressionChecked: true,
	};
}

/** Human-readable one-line-per-metric table for CI logs. */
export function formatBenchRun(run: BenchRun): string {
	const lines = [
		`hardware class: ${run.hardwareClass}`,
		`captured at:    ${run.capturedAt}`,
		"",
	];
	for (const metric of run.metrics) {
		const budget =
			metric.budgetMs === null ? "trend-only" : `≤ ${metric.budgetMs} ms`;
		const verdict =
			metric.budgetMs === null || metric.p95 <= metric.budgetMs
				? "PASS"
				: "FAIL";
		lines.push(
			`  ${verdict} ${metric.profile.padEnd(4)} ${metric.id.padEnd(30)} ` +
				`median ${metric.median.toFixed(2).padStart(8)} ms · ` +
				`p95 ${metric.p95.toFixed(2).padStart(8)} ms · ${budget}`,
		);
	}
	return lines.join("\n");
}
