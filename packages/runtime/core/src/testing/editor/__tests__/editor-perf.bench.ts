/**
 * @file The §28 performance CI harness (PLAN-0020 CORE-P4-001).
 *
 * Run with `pnpm bench:editor` (a dedicated Vitest project — this file
 * is **excluded** from `pnpm test`, which must stay fast).
 *
 * ### What this harness covers, and what it does not
 *
 * §28's table mixes engine latency with browser-observable latency.
 * Seven rows are pure-engine and measured here, deterministically,
 * with no browser in the loop:
 *
 * | §28 row | metric id |
 * |---|---|
 * | Sidecar parse | `sidecar.parse` |
 * | Full authoring resolve | `authoring.resolve.full` |
 * | Inspector commit p95 | `inspector.commit` |
 * | Undo/redo feedback | `undo.feedback` |
 * | Layer search | `layer.search` |
 * | Incremental accessibility scan | `a11y.scan.incremental` |
 * | Per-dispatch sidecar overhead | `dispatch.sidecar.overhead` |
 *
 * The remaining three — *Studio interactive*, *selection feedback
 * p95*, *gesture frame p95* — are only meaningful against a real
 * renderer and live in `apps/studio/e2e/editor/perf-baseline.spec.ts`.
 * They are **not** claimed here; a Node number for "gesture frame"
 * would be fiction.
 *
 * ### Gating
 *
 * Absolute §28 budgets always gate. Regression-vs-baseline gates only
 * when `bench/baselines/editor-perf.json` records the same hardware
 * class as the current run (plan §14). Refresh a baseline with
 * `ANVILKIT_BENCH_UPDATE_BASELINE=1 pnpm bench:editor` **on the
 * reference runner** — never from a dev laptop.
 *
 * `ANVILKIT_BENCH_REQUIRE_BASELINE=1` (set by the `editor-perf` CI job)
 * turns "could not compare" from a console note into a hard failure.
 * The baselines directory is deliberately **tracked** — only
 * `bench/results/` is ignored — so the committed baseline is the gate's
 * input and the per-run output never pollutes the diff.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { arch, platform } from "node:os";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import type {
	EditorCommand,
} from "../../../editor/legacy/index.js";
import { describe, expect, it } from "vitest";
import {
	applyEditorCommand,
	readAuthoringState,
	resolveNodeAuthoring,
	writeAuthoringState,
} from "../../../editor/index.js";
import { evaluateContractRules } from "../../../react/editor/a11y/contract-rules.js";
import { filterLayerTree } from "../../../studio/layout/sidebar/modules/layer/hooks/layer-search.js";
import type {
	LayerChildZone,
	LayerNode,
} from "../../../studio/layout/sidebar/modules/layer/hooks/use-layer-tree.js";
import type { BenchMetric, BenchRun } from "../bench-compare.js";
import {
	compareBenchRun,
	formatBenchRun,
	summarizeSamples,
} from "../bench-compare.js";
import type {
	PerfLayerChildZone,
	PerfLayerNode,
	PerfProfile,
	PerfProfileId,
} from "../perf-profiles.js";
import { buildPerfProfile } from "../perf-profiles.js";

// Compile-time proof that the generated layer rows really are the
// Layers module's own shape — if `LayerNode` gains a required member,
// this fails at typecheck instead of silently benchmarking a
// different structure than production walks.
type _AssertLayerNodeShape = PerfLayerNode extends LayerNode ? true : never;
type _AssertLayerZoneShape = PerfLayerChildZone extends LayerChildZone
	? true
	: never;
const _layerShapeOk: _AssertLayerNodeShape & _AssertLayerZoneShape = true;
void _layerShapeOk;

const HERE = dirname(fileURLToPath(import.meta.url));
const BENCH_DIR = resolve(HERE, "../../../../bench");
const BASELINE_PATH = resolve(BENCH_DIR, "baselines/editor-perf.json");
const RESULT_PATH = resolve(BENCH_DIR, "results/editor-perf.json");

const RUNS = Number(process.env.ANVILKIT_BENCH_RUNS ?? "20");
const UPDATE_BASELINE = process.env.ANVILKIT_BENCH_UPDATE_BASELINE === "1";
/**
 * Require a same-hardware-class baseline (CI). Without this the
 * regression half of the §28 gate degrades to a console note, which is
 * indistinguishable from a passing gate in a CI log — the audited
 * failure mode (REVIEW-0019 §2, P1). Never required while capturing a
 * baseline: that run is what *creates* the file.
 */
const REQUIRE_BASELINE =
	process.env.ANVILKIT_BENCH_REQUIRE_BASELINE === "1" && !UPDATE_BASELINE;

/**
 * The reference class the numbers belong to. CI pins it from the
 * runner labels; anything else is explicitly marked local so a laptop
 * run can never be mistaken for a gating baseline.
 */
function hardwareClass(): string {
	const explicit = process.env.ANVILKIT_BENCH_HW;
	if (explicit !== undefined && explicit !== "") {
		return explicit;
	}
	if (process.env.CI === "true") {
		return `ci-${process.env.RUNNER_OS ?? platform()}-${process.env.RUNNER_ARCH ?? arch()}`;
	}
	return `local-${platform()}-${arch()}`;
}

/** §28 budgets, per profile, in milliseconds. */
const BUDGETS: Readonly<
	Record<
		string,
		{ readonly label: string; readonly ms: Record<string, number> }
	>
> = {
	"sidecar.parse": {
		label: "Sidecar parse",
		ms: { "1k": 30, "10k": 150 },
	},
	"authoring.resolve.full": {
		label: "Full authoring resolve",
		ms: { "1k": 100, "10k": 500 },
	},
	"inspector.commit": {
		label: "Inspector commit p95",
		ms: { "1k": 100, "10k": 200 },
	},
	"undo.feedback": {
		label: "Undo/redo feedback",
		ms: { "1k": 100, "10k": 250 },
	},
	"layer.search": {
		label: "Layer search",
		ms: { "1k": 100, "10k": 200 },
	},
	"a11y.scan.incremental": {
		label: "Incremental accessibility scan",
		ms: { "1k": 100, "10k": 250 },
	},
	"dispatch.sidecar.overhead": {
		label: "Per-dispatch sidecar overhead",
		ms: { "1k": 5, "10k": 20 },
	},
};

function measure(
	id: string,
	profile: PerfProfile,
	run: () => unknown,
): BenchMetric {
	// Two warm-up passes: the first execution pays JIT + lazy-module
	// cost that no user-visible interaction pays twice.
	run();
	run();
	const samples: number[] = [];
	for (let index = 0; index < RUNS; index += 1) {
		const started = performance.now();
		run();
		samples.push(performance.now() - started);
	}
	const summary = summarizeSamples(samples);
	const budget = BUDGETS[id];
	return {
		id,
		profile: profile.id,
		budgetLabel: budget?.label ?? id,
		budgetMs: budget?.ms[profile.id] ?? null,
		...summary,
	};
}

/** Resolve every authored node — the "full authoring resolve" row. */
function fullResolve(profile: PerfProfile): number {
	let resolved = 0;
	for (const nodeId of Object.keys(profile.authoring.nodes)) {
		resolveNodeAuthoring(nodeId, {
			authoring: profile.authoring,
			breakpoints: profile.breakpoints,
			viewportWidth: 900,
			tokenMode: "light",
		});
		resolved += 1;
	}
	return resolved;
}

function commitCommand(profile: PerfProfile, gap: number): EditorCommand {
	return {
		id: `bench-commit-${gap}`,
		expectedRevision: profile.authoring.revision,
		source: "inspector",
		timestamp: 0,
		type: "node.layout.set",
		nodeIds: [profile.authoredNodeId],
		breakpointId: "base",
		patch: { gap: { kind: "unit", value: gap, unit: "px" } },
	} as EditorCommand;
}

function collectMetrics(profile: PerfProfile): BenchMetric[] {
	const metrics: BenchMetric[] = [];

	metrics.push(
		measure("sidecar.parse", profile, () => readAuthoringState(profile.data)),
	);

	metrics.push(
		measure("authoring.resolve.full", profile, () => fullResolve(profile)),
	);

	metrics.push(
		measure("inspector.commit", profile, () => {
			const result = applyEditorCommand(
				profile.authoring,
				commitCommand(profile, 9),
			);
			return writeAuthoringState(profile.data, result.state);
		}),
	);

	// Undo restores a previous document, so the editor pays a read of
	// the restored sidecar plus a full re-resolve before the canvas can
	// repaint — that pair is the user-visible "undo feedback" cost.
	metrics.push(
		measure("undo.feedback", profile, () => {
			readAuthoringState(profile.data);
			return fullResolve(profile);
		}),
	);

	// Alternate the query so no run can be served from a memoized
	// previous result: search cost must be measured, not cached.
	let searchRun = 0;
	metrics.push(
		measure("layer.search", profile, () => {
			searchRun += 1;
			return filterLayerTree(
				profile.layerRoots,
				searchRun % 2 === 0 ? "Heading" : "node 9",
			);
		}),
	);

	metrics.push(
		measure("a11y.scan.incremental", profile, () =>
			evaluateContractRules(profile.data, profile.capabilities),
		),
	);

	// Puck spread-clones `root.props` and re-flattens its node index on
	// every action; the sidecar rides along as one opaque reference.
	metrics.push(
		measure("dispatch.sidecar.overhead", profile, () => ({
			...profile.data,
			root: { ...profile.data.root, props: { ...profile.data.root.props } },
		})),
	);

	return metrics;
}

function readBaseline(): BenchRun | null {
	try {
		return JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as BenchRun;
	} catch {
		return null;
	}
}

function writeJson(path: string, value: unknown): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(value, null, "\t")}\n`, "utf8");
}

describe("editor performance harness (§28)", () => {
	it(`enforces the §28 budgets over ${RUNS} runs at 1k and 10k`, {
		timeout: 600_000,
	}, () => {
		const profiles: PerfProfile[] = (
			["1k", "10k"] satisfies PerfProfileId[]
		).map((id) => buildPerfProfile(id));

		const metrics = profiles.flatMap(collectMetrics);
		const run: BenchRun = {
			hardwareClass: hardwareClass(),
			capturedAt: new Date().toISOString(),
			metrics,
		};

		console.log(`\n${formatBenchRun(run)}\n`);
		writeJson(RESULT_PATH, run);

		const baseline = readBaseline();
		const comparison = compareBenchRun(run, baseline, {
			requireBaseline: REQUIRE_BASELINE,
		});
		for (const note of comparison.notes) {
			console.log(`  note: ${note.message}`);
		}
		console.log(
			`  regression comparison: ${
				comparison.regressionChecked
					? `ran against a ${baseline?.hardwareClass} baseline`
					: `DID NOT RUN (required: ${REQUIRE_BASELINE})`
			}`,
		);

		if (UPDATE_BASELINE) {
			writeJson(BASELINE_PATH, run);
			console.log(`  baseline updated: ${BASELINE_PATH}`);
		}

		expect(comparison.violations.map((violation) => violation.message)).toEqual(
			[],
		);
	});
});
