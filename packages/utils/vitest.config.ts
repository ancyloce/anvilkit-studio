import { reactLibraryPreset } from "@anvilkit/vitest-config/react-library";
import { defineConfig, mergeConfig } from "vitest/config";

/**
 * `@anvilkit/utils` uses the `react-library` preset (jsdom) rather than
 * the headless `node` preset because `get-strict-context.ts` is tested
 * with React Testing Library's `renderHook`, which needs a DOM. The
 * other helpers are environment-agnostic and run fine under jsdom.
 *
 * Coverage thresholds are pinned at 100% — these are leaf-level helpers
 * that every runtime package depends on, so regressions must be caught
 * at this boundary.
 */
export default mergeConfig(
	reactLibraryPreset,
	defineConfig({
		test: {
			name: "@anvilkit/utils",
			coverage: {
				provider: "v8",
				reporter: ["text", "html", "lcov"],
				include: ["src/**/*.ts"],
				exclude: [
					"src/**/*.test.ts",
					"src/**/*.test.tsx",
					"src/**/__tests__/**",
					"src/index.ts",
				],
				thresholds: {
					lines: 100,
					functions: 100,
					statements: 100,
					branches: 100,
				},
			},
		},
	}),
);
