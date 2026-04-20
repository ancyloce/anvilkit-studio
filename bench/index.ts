/**
 * phase4-015 — bench harness entry point.
 *
 * Runs every registered bench, compares results against
 * `bench/baseline.json`, and exits non-zero if any result regresses
 * by >20% on `meanMs` or >10% on `bytes`. `--update-baseline`
 * rewrites the baseline from the current run instead of comparing.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runHtmlExportBench } from "./html-export.bench.js";
import { runIrRoundtripBench } from "./ir-roundtrip.bench.js";
import { runComponentRenderBench } from "./component-render.bench.js";
import type {
	BenchBaseline,
	BenchBaselineEntry,
	BenchComparison,
	BenchResult,
} from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BASELINE_PATH = resolve(__dirname, "baseline.json");

const MEAN_REGRESSION_PCT = 20;
const BYTES_REGRESSION_PCT = 10;
/**
 * Benches whose baseline mean is below this floor are measuring in
 * microseconds or nanoseconds, where natural run-to-run variance
 * routinely exceeds 20%. We still record them (useful for absolute
 * tracking) but we don't block CI on their deltas.
 */
const NOISE_FLOOR_MS = 0.1;

function readBaseline(): BenchBaseline {
	if (!existsSync(BASELINE_PATH)) return {};
	return JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as BenchBaseline;
}

function writeBaseline(baseline: BenchBaseline): void {
	writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
}

function toBaselineEntry(result: BenchResult): BenchBaselineEntry {
	return {
		meanMs: result.meanMs,
		hz: result.hz,
		...(result.bytes !== undefined ? { bytes: result.bytes } : {}),
		recordedAt: new Date().toISOString(),
	};
}

function compare(results: BenchResult[], baseline: BenchBaseline): BenchComparison[] {
	return results.map((r) => {
		const b = baseline[r.name];
		if (!b) {
			return {
				name: r.name,
				meanMs: r.meanMs,
				baselineMeanMs: null,
				meanDeltaPct: null,
				bytes: r.bytes,
				baselineBytes: undefined,
				bytesDeltaPct: null,
				regression: false,
				reasons: ["no baseline (new bench — run --update-baseline to pin)"],
			};
		}
		const meanDeltaPct = ((r.meanMs - b.meanMs) / b.meanMs) * 100;
		const bytesDeltaPct =
			r.bytes !== undefined && b.bytes !== undefined
				? ((r.bytes - b.bytes) / b.bytes) * 100
				: null;
		const reasons: string[] = [];
		const belowFloor = b.meanMs < NOISE_FLOOR_MS;
		if (!belowFloor && meanDeltaPct > MEAN_REGRESSION_PCT) {
			reasons.push(
				`meanMs +${meanDeltaPct.toFixed(1)}% (threshold: +${MEAN_REGRESSION_PCT}%)`,
			);
		}
		if (bytesDeltaPct !== null && bytesDeltaPct > BYTES_REGRESSION_PCT) {
			reasons.push(
				`bytes +${bytesDeltaPct.toFixed(1)}% (threshold: +${BYTES_REGRESSION_PCT}%)`,
			);
		}
		return {
			name: r.name,
			meanMs: r.meanMs,
			baselineMeanMs: b.meanMs,
			meanDeltaPct,
			bytes: r.bytes,
			baselineBytes: b.bytes,
			bytesDeltaPct,
			regression: reasons.length > 0,
			reasons,
		};
	});
}

function formatTable(comparisons: BenchComparison[]): string {
	const lines: string[] = [];
	lines.push(
		"| Bench | mean (ms) | baseline | Δ mean | bytes | Δ bytes | status |",
	);
	lines.push(
		"| ----- | --------: | -------: | ------ | ----: | ------- | ------ |",
	);
	for (const c of comparisons) {
		const mean = c.meanMs.toFixed(3);
		const base = c.baselineMeanMs !== null ? c.baselineMeanMs.toFixed(3) : "—";
		const meanDelta =
			c.meanDeltaPct !== null ? `${c.meanDeltaPct >= 0 ? "+" : ""}${c.meanDeltaPct.toFixed(1)}%` : "—";
		const bytes = c.bytes !== undefined ? String(c.bytes) : "—";
		const bytesDelta =
			c.bytesDeltaPct !== null
				? `${c.bytesDeltaPct >= 0 ? "+" : ""}${c.bytesDeltaPct.toFixed(1)}%`
				: "—";
		const status = c.regression
			? `FAIL: ${c.reasons.join("; ")}`
			: c.baselineMeanMs === null
				? "new"
				: c.baselineMeanMs < NOISE_FLOOR_MS
					? "ok (sub-ms: no gate)"
					: "ok";
		lines.push(`| ${c.name} | ${mean} | ${base} | ${meanDelta} | ${bytes} | ${bytesDelta} | ${status} |`);
	}
	return lines.join("\n");
}

async function main(): Promise<void> {
	const updateMode = process.argv.includes("--update-baseline");

	const allResults: BenchResult[] = [];
	allResults.push(await runHtmlExportBench());
	allResults.push(await runIrRoundtripBench());
	allResults.push(...(await runComponentRenderBench()));

	if (updateMode) {
		const next: BenchBaseline = {};
		for (const r of allResults) next[r.name] = toBaselineEntry(r);
		writeBaseline(next);
		console.log(`bench: updated ${BASELINE_PATH} with ${allResults.length} entries.`);
		return;
	}

	const baseline = readBaseline();
	const comparisons = compare(allResults, baseline);
	const table = formatTable(comparisons);
	console.log(table);

	// Emit machine-readable summary for CI PR comment.
	const summaryPath = process.env.BENCH_SUMMARY_PATH;
	if (summaryPath) {
		writeFileSync(summaryPath, `## Bench results\n\n${table}\n`, "utf8");
	}

	const failures = comparisons.filter((c) => c.regression);
	if (failures.length > 0) {
		console.error(`\nbench: ${failures.length} regression(s) detected.`);
		process.exit(1);
	}
	console.log("\nbench: all within threshold.");
}

main().catch((err) => {
	console.error("bench: crashed");
	console.error(err);
	process.exit(2);
});
