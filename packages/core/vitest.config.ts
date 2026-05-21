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
		},
	}),
);
