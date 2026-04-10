import { reactLibraryPreset } from "@anvilkit/vitest-config/react-library";
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
		test: {
			name: "@anvilkit/core",
			passWithNoTests: true,
		},
	}),
);
