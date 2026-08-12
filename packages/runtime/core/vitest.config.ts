import { reactLibraryPreset } from "@anvilkit/vitest-config/react-library";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig, mergeConfig } from "vitest/config";

/**
 * `@anvilkit/core` uses the `react-library` preset (jsdom) because the
 * React shell milestone (`core-014`) renders `<Studio>` under RTL.
 * Runtime-only tests (M3) are environment-agnostic and run fine under
 * jsdom too, so one preset covers every subdirectory.
 *
 * Tests live alongside the sources they cover. Until M2 lands, there
 * are no test files, and Vitest is configured with
 * `passWithNoTests: true` so `pnpm test` succeeds on the empty scaffold.
 */
export default mergeConfig(
	reactLibraryPreset,
	defineConfig({
		plugins: [tsconfigPaths({ projects: ["./tsconfig.test.json"] })],
		test: {
			name: "@anvilkit/core",
			passWithNoTests: true,
			// The `<Studio>` mount tests await a full compile + RTL render. In
			// isolation they finish in ~1–2s, but under Turbo's concurrent
			// full-suite load (every package's Vitest cold-transforming the
			// heavy chrome graph at once) the jsdom environment is heavily
			// contended and the first mount blows the default 5s ceiling. This
			// must stay comfortably above the 15s `asyncUtilTimeout` set in
			// `vitest.setup.ts` so a slow mount plus its follow-up `waitFor`
			// assertions never trip the test ceiling; a real hang still fails,
			// just later.
			testTimeout: 30000,
			hookTimeout: 30000,
			setupFiles: [
				"@anvilkit/vitest-config/setup/jest-dom",
				"./vitest.setup.ts",
			],
			/**
			 * PLAN-0020 §13 ("new-code coverage floors: reducers/resolvers
			 * ≥95% branch") and the Phase 0 exit criteria for CORE-P0-008 /
			 * CORE-P0-010. Before this block existed the floor was written
			 * down but never measured (REVIEW-0019 §3.3, finding 1).
			 *
			 * `enabled: false` keeps the inner `pnpm test` loop fast; the
			 * gate runs as `pnpm check:coverage`, which `check:all` (and
			 * therefore the pre-push hook and `package-gates` in CI) calls.
			 *
			 * `check:coverage` runs **only `src/editor`'s own tests**, for
			 * two reasons. Correctness: the floor is a claim about the pure
			 * engine's test suite, and letting incidental coverage from
			 * jsdom `<Studio>` mount tests count would let the number drift
			 * up without a single new engine assertion. Practicality: V8
			 * instrumentation roughly doubles the full suite's wall clock,
			 * which pushes the heavy RTL mount tests past their
			 * `asyncUtilTimeout` (verified: 65 timeout failures, 531 s) —
			 * a gate that flakes on unrelated tests is not a gate.
			 *
			 * Thresholds are **per directory glob**, deliberately not
			 * global, so a regression in a small directory cannot hide
			 * behind a larger well-covered one — the
			 * "high aggregate conceals a failing target" failure mode.
			 *
			 * This block used to carry a second glob for
			 * `src/editor/commands/**` (the reducer half of §13's
			 * "reducers/resolvers" floor). That directory was **deleted**
			 * with the legacy authoring sidecar, and its successor write
			 * path is `src/puck/` (`update-tree`, `update-appearance`,
			 * `update-overrides`, `create-component`, …). A threshold glob
			 * matching zero files passes silently, so the entry was not a
			 * dormant gate — it was a gate that reported green on nothing,
			 * which is worse than no gate. It is removed rather than
			 * repointed: `src/puck/` currently sits near 25% branch
			 * coverage, so re-arming the reducer floor there is real work,
			 * not a config edit. **The reducer half of §13 is currently
			 * unenforced** — that gap is recorded here on purpose.
			 *
			 * `include` is scoped to the mandated directory so the report
			 * is the gate, with nothing else diluting it. Widening the
			 * floor to more of `src/editor/` is a deliberate future
			 * decision, not something to inherit by accident.
			 */
			coverage: {
				enabled: false,
				provider: "v8",
				reporter: ["text-summary", "json-summary"],
				include: ["src/editor/resolve/**"],
				thresholds: {
					"src/editor/resolve/**": { branches: 95 },
				},
			},
		},
	}),
);
