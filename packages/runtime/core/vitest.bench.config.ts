import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

/**
 * The §28 performance harness project (PLAN-0020 CORE-P4-001).
 *
 * Kept out of `pnpm test` on purpose: the harness builds 10,000-node
 * fixtures and runs every scenario 20 times, which is minutes of work
 * that must not be paid on every unit-test run. `*.bench.ts` also does
 * not match the shared preset's `*.{test,spec}.*` include, so the two
 * projects can never pick up each other's files by accident.
 *
 * Deliberately **not** built with `mergeConfig(reactLibraryPreset, …)`:
 * `mergeConfig` concatenates arrays, so the preset's `include` would be
 * unioned with this one and the bench project would run the entire unit
 * suite in a `node` environment (818 failures — verified the hard way).
 *
 * `environment: "node"` because every scenario is maths over plain
 * objects; jsdom would add setup cost and measurement noise for
 * nothing. Single-threaded and non-isolated: parallel workers
 * contending for the same cores are exactly the noise a latency
 * benchmark must not measure.
 */
export default defineConfig({
	plugins: [tsconfigPaths({ projects: ["./tsconfig.test.json"] })],
	test: {
		name: "@anvilkit/core:bench",
		include: ["src/**/__tests__/**/*.bench.ts"],
		environment: "node",
		isolate: false,
		fileParallelism: false,
		pool: "threads",
		maxWorkers: 1,
		minWorkers: 1,
		// The harness prints the §28 table itself; Vitest's console
		// interception would swallow it on a passing run, which is the run
		// whose numbers people actually want to read.
		disableConsoleIntercept: true,
		testTimeout: 900_000,
		hookTimeout: 900_000,
	},
});
