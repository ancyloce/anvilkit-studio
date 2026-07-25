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
 */

export {
	assertContentFreeEvent,
	createHistoryRecordingProbe,
	type HistoryRecordingProbe,
} from "./assertions.js";
export {
	buildAuthoringStateAtLimits,
	buildLegacyPuckData,
	buildPuckDataWithSidecar,
	buildRootConfigWithSlotFields,
	buildUnknownVersionSidecar,
	LIMIT_FIXTURE_DEFAULTS,
	type LimitFixtureOptions,
} from "./fixtures.js";
