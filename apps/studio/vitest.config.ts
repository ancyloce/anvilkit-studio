import { nodePreset } from "@anvilkit/vitest-config/node";
import { defineConfig, mergeConfig } from "vitest/config";

/**
 * Node-environment unit tests for the demo's server-side libraries (page storage
 * adapters, the pure Page API handlers). The demo otherwise runs only Playwright
 * E2E; these never touch the DOM or React, so the headless node preset applies.
 * Tests live under `lib/**\/__tests__` (the app has no `src/`), plus
 * `app/**\/__tests__` for route-handler helpers that must live beside their
 * route — currently `app/api/canvas/ai/_lib`, whose `_`-prefixed folder Next
 * excludes from routing.
 */
export default mergeConfig(
	nodePreset,
	defineConfig({
		test: {
			name: "studio",
			include: [
				"lib/**/__tests__/**/*.{test,spec}.ts",
				"app/**/__tests__/**/*.{test,spec}.ts",
			],
			passWithNoTests: true,
		},
	}),
);
