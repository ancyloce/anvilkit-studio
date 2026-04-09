import type { ViteUserConfig } from "vitest/config";

/**
 * Vitest preset for pure Node packages (no DOM, no React).
 *
 * Used by `@anvilkit/utils`, `@anvilkit/core`'s `src/runtime/`, and any
 * leaf package that must stay headless.
 *
 * Consumers merge this preset via `mergeConfig`:
 *
 * ```ts
 * import { defineConfig, mergeConfig } from "vitest/config";
 * import { nodePreset } from "@anvilkit/vitest-config/node";
 *
 * export default mergeConfig(
 *   nodePreset,
 *   defineConfig({ test: { name: "@anvilkit/utils" } }),
 * );
 * ```
 */
export const nodePreset = {
	test: {
		environment: "node",
		globals: false,
		include: [
			"src/**/*.{test,spec}.ts",
			"src/**/__tests__/**/*.{test,spec}.ts",
		],
		clearMocks: true,
		restoreMocks: true,
	},
} satisfies ViteUserConfig;
