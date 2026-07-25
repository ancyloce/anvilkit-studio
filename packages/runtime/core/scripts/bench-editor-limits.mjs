#!/usr/bin/env node
/**
 * @file Editor byte-limit and per-dispatch overhead benchmarks
 * (PLAN-0020 CORE-P0-014 / CORE-P0-015; DD-0019 §7.3, §28).
 *
 * Runs against the built `dist/` output (run `pnpm build` first).
 *
 * CORE-P0-014 — measures the canonical (compacted) serialization of
 * realistic documents at the frozen §7.3 count limits and prints the
 * evidence from which the `EditorByteLimits` defaults are frozen
 * (numbers must be measured, never invented).
 *
 * CORE-P0-015 — measures, at the max-limit document:
 *   a) the Puck-native per-dispatch cost proxy: a spread-clone of
 *      `root.props` with the max sidecar attached (Puck spread-clones
 *      root props and re-flattens its node index each action; the
 *      sidecar rides along as ONE opaque prop reference);
 *   b) the editor read path (`readAuthoringState`: detect + deep
 *      parse + normalize) — paid on external change notifications;
 *   c) the editor commit path (`applyEditorCommand` +
 *      `writeAuthoringState` with compaction) — paid once per intent.
 * Budgets (§28): ≤5 ms @1k node records, ≤20 ms @10k-scale (the §7.3
 * cap is 5k records; the 20 ms bound is checked at the cap).
 */

import { performance } from "node:perf_hooks";

const editor = await import("../dist/editor/index.js");
const testing = await import("../dist/testing/editor/index.js");
const schema = await import("@anvilkit/schema/editor");

const { buildAuthoringStateAtLimits, buildPuckDataWithSidecar } = testing;
const { applyEditorCommand, readAuthoringState, writeAuthoringState } = editor;
const { canonicalSerializeAuthoring, canonicalSerializeFragment } = schema;

function fmtBytes(bytes) {
	return `${bytes.toLocaleString("en-US")} B (${(bytes / 1024).toFixed(1)} KiB)`;
}

function stats(samples) {
	const sorted = [...samples].sort((a, b) => a - b);
	const median = sorted[Math.floor(sorted.length / 2)];
	const p95 =
		sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
	return { median, p95 };
}

function bench(label, runs, fn) {
	// Warmup.
	fn();
	fn();
	const samples = [];
	for (let index = 0; index < runs; index += 1) {
		const start = performance.now();
		fn();
		samples.push(performance.now() - start);
	}
	const { median, p95 } = stats(samples);
	console.log(
		`  ${label}: median ${median.toFixed(2)} ms · p95 ${p95.toFixed(2)} ms (${runs} runs)`,
	);
	return { median, p95 };
}

console.log("bench-editor-limits: CORE-P0-014 byte measurement");
console.log("");

const maxState = buildAuthoringStateAtLimits();
const nodeCount = Object.keys(maxState.nodes).length;
console.log(
	`  max-limit document: ${nodeCount} node records, ${Object.keys(maxState.tokens).length} tokens, ` +
		`${Object.keys(maxState.styleDefinitions).length} style definitions, ` +
		`${Object.keys(maxState.componentDefinitions).length} component definitions, ` +
		`${Object.keys(maxState.interactions).length} interactions`,
);

const fullBytes = canonicalSerializeAuthoring(maxState).bytes;
console.log(`  sidecar canonical bytes @ §7.3 limits: ${fmtBytes(fullBytes)}`);

const typical = buildAuthoringStateAtLimits({
	nodeRecords: 500,
	tokens: 200,
	styleDefinitions: 50,
	componentDefinitions: 50,
	interactions: 100,
	breakpoints: 3,
});
const typicalBytes = canonicalSerializeAuthoring(typical).bytes;
console.log(
	`  sidecar canonical bytes @ heavy-but-typical: ${fmtBytes(typicalBytes)}`,
);

const definitions = Object.values(maxState.componentDefinitions);
const maxDefinitionBytes = Math.max(
	...definitions.map(
		(definition) => canonicalSerializeFragment(definition).bytes,
	),
);
console.log(
	`  largest generated component definition: ${fmtBytes(maxDefinitionBytes)}`,
);

// A worst-case single-intent batch: 200 layout writes.
const batch = {
	id: "bench-batch",
	expectedRevision: 1,
	source: "plugin",
	timestamp: 0,
	type: "batch",
	label: "bench",
	commands: Array.from({ length: 200 }, (_, index) => ({
		id: `bench-${index}`,
		expectedRevision: 1,
		source: "plugin",
		timestamp: 0,
		type: "node.layout.set",
		nodeIds: [`node-${index}`],
		breakpointId: "base",
		patch: { gap: { kind: "unit", value: index % 48, unit: "px" } },
	})),
};
const commandBytes = canonicalSerializeFragment(batch).bytes;
console.log(`  max-size batch command payload: ${fmtBytes(commandBytes)}`);

console.log("");
console.log("bench-editor-limits: CORE-P0-015 per-dispatch overhead");
console.log("");

const dataAtLimits = buildPuckDataWithSidecar(maxState, 200);
const oneKState = buildAuthoringStateAtLimits({
	nodeRecords: 1000,
	tokens: 400,
	styleDefinitions: 100,
	componentDefinitions: 50,
	interactions: 200,
	breakpoints: 4,
});
const dataAt1k = buildPuckDataWithSidecar(oneKState, 200);

const RUNS = 20;

console.log("  @1k node records:");
const spread1k = bench("puck-proxy root.props spread-clone", RUNS, () => {
	const next = {
		...dataAt1k,
		root: { ...dataAt1k.root, props: { ...dataAt1k.root.props } },
	};
	return next;
});
const read1k = bench("readAuthoringState (detect+parse+normalize)", RUNS, () =>
	readAuthoringState(dataAt1k),
);
const commit1k = bench("applyEditorCommand + writeAuthoringState", RUNS, () => {
	const result = applyEditorCommand(oneKState, {
		id: "bench",
		expectedRevision: 1,
		source: "inspector",
		timestamp: 0,
		type: "node.layout.set",
		nodeIds: ["node-1"],
		breakpointId: "base",
		patch: { gap: { kind: "unit", value: 7, unit: "px" } },
	});
	return writeAuthoringState(dataAt1k, result.state);
});

console.log("  @5k node records (the §7.3 cap):");
const spread5k = bench("puck-proxy root.props spread-clone", RUNS, () => {
	const next = {
		...dataAtLimits,
		root: { ...dataAtLimits.root, props: { ...dataAtLimits.root.props } },
	};
	return next;
});
const read5k = bench("readAuthoringState (detect+parse+normalize)", RUNS, () =>
	readAuthoringState(dataAtLimits),
);
const commit5k = bench("applyEditorCommand + writeAuthoringState", RUNS, () => {
	const result = applyEditorCommand(maxState, {
		id: "bench",
		expectedRevision: 1,
		source: "inspector",
		timestamp: 0,
		type: "node.layout.set",
		nodeIds: ["node-1"],
		breakpointId: "base",
		patch: { gap: { kind: "unit", value: 7, unit: "px" } },
	});
	return writeAuthoringState(dataAtLimits, result.state);
});

console.log("");
console.log("bench-editor-limits: §28 budget check");
const checks = [
	["spread @1k ≤ 5 ms", spread1k.median <= 5],
	["commit @1k ≤ 5 ms", commit1k.median <= 5],
	["spread @5k ≤ 20 ms", spread5k.median <= 20],
	["commit @5k ≤ 20 ms", commit5k.median <= 20],
];
let failed = false;
for (const [label, ok] of checks) {
	console.log(`  ${ok ? "PASS" : "FAIL"} ${label}`);
	if (!ok) {
		failed = true;
	}
}
console.log(
	`  (read path, informational: @1k ${read1k.median.toFixed(2)} ms · @5k ${read5k.median.toFixed(2)} ms — paid on external change notifications, not per dispatch)`,
);
process.exit(failed ? 1 : 0);
