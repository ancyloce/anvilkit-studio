/**
 * @file `@anvilkit/core/testing/editor` — fixture builders and
 * contract assertion helpers for the visual editor (DD-0019 §22.2;
 * PLAN-0020 CORE-P0-017).
 *
 * The builders generate documents at the frozen §7.3 count limits,
 * legacy documents without a sidecar, unknown-version sidecars, and
 * a root config with slot fields (the invariant-11 fixture). The
 * assertion helpers encode the single-intent history rule and the
 * content-free event privacy contract so every suite checks them the
 * same way. The compatibility suite in `__tests__/` is the
 * regression net for the "reader only" rollout stage (§30.7).
 *
 * The performance profiles and the §28 gate (CORE-P4-001) live here
 * too: they are test infrastructure, and hosts benchmarking their own
 * editor integration need the same fixed inputs Core gates on.
 */

export {
	assertContentFreeEvent,
	createHistoryRecordingProbe,
	type HistoryRecordingProbe,
} from "./assertions.js";
export {
	BENCH_NOISE_FLOOR_MS,
	BENCH_REGRESSION_TOLERANCE,
	type BenchCompareOptions,
	type BenchComparison,
	type BenchMetric,
	type BenchNote,
	type BenchRun,
	type BenchSample,
	type BenchViolation,
	compareBenchRun,
	formatBenchRun,
	summarizeSamples,
} from "./bench-compare.js";
export {
	CFX_COMPONENT_IDS,
	CFX_FIXTURES,
	CFX_IDS,
	CFX_TOKEN_IDS,
	type CfxFixture,
	type CfxId,
	certify,
	cfxFixture,
	resetCfxCoverage,
	uncertifiedFixtures,
} from "./cfx/index.js";
export {
	buildAuthoringStateAtLimits,
	buildLegacyPuckData,
	buildPuckDataWithSidecar,
	buildRootConfigWithSlotFields,
	buildUnknownVersionSidecar,
	LIMIT_FIXTURE_DEFAULTS,
	type LimitFixtureOptions,
} from "./fixtures.js";
export {
	buildPerfProfile,
	PERF_COMPONENT_TYPES,
	PERF_PROFILE_PRESETS,
	type PerfLayerChildZone,
	type PerfLayerNode,
	type PerfProfile,
	type PerfProfileId,
	type PerfProfileOptions,
} from "./perf-profiles.js";
