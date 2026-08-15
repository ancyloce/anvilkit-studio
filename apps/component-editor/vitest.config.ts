import { reactLibraryPreset } from "@anvilkit/vitest-config/react-library";
import { defineConfig, mergeConfig } from "vitest/config";

/**
 * Unit tests for the component editor's libraries. The config-assembly and
 * parity suites render Puck's `<Render>` output, so the DOM preset applies
 * (the react-library preset leaves `globals: false` — import the testing
 * APIs explicitly and clean up per test).
 */
export default mergeConfig(
	reactLibraryPreset,
	defineConfig({
		test: {
			name: "component-editor",
			include: ["lib/**/__tests__/**/*.{test,spec}.{ts,tsx}"],
			setupFiles: [
				"@anvilkit/vitest-config/setup/jest-dom",
				"./vitest.setup.ts",
			],
			passWithNoTests: true,
		},
	}),
);
