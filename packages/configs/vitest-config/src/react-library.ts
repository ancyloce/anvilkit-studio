import type { ViteUserConfig } from "vitest/config";

/**
 * Vitest preset for packages that render React components.
 *
 * - `environment: "jsdom"` for DOM globals.
 * - `@testing-library/jest-dom/vitest` loaded via setupFiles for custom matchers.
 * - `css: true` so imported stylesheets do not throw during rendering.
 * - `clearMocks: true` so vi.fn() state does not leak between tests.
 *
 * Consumers merge this preset into their own config via `mergeConfig`:
 *
 * ```ts
 * import { defineConfig, mergeConfig } from "vitest/config";
 * import { reactLibraryPreset } from "@anvilkit/vitest-config/react-library";
 *
 * export default mergeConfig(
 *   reactLibraryPreset,
 *   defineConfig({ test: { name: "@anvilkit/ui" } }),
 * );
 * ```
 */
export const reactLibraryPreset = {
	test: {
		environment: "jsdom",
		globals: false,
		setupFiles: ["@anvilkit/vitest-config/setup/jest-dom"],
		include: [
			"src/**/*.{test,spec}.{ts,tsx}",
			"src/**/__tests__/**/*.{test,spec}.{ts,tsx}",
		],
		css: true,
		clearMocks: true,
		restoreMocks: true,
	},
} satisfies ViteUserConfig;
