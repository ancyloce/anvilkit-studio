import { pluginReact } from "@rsbuild/plugin-react";
import { defineConfig } from "@rslib/core";

/**
 * Bundleless build for `@anvilkit/core`.
 *
 * Every `.ts` / `.tsx` file under `src/` becomes an individual ESM + CJS
 * output under `dist/`, preserving the subpath tree (`src/types/index.ts`
 * → `dist/types/index.js`). Subpath exports in `package.json` rely on
 * that 1:1 mapping, so any new subdirectory added to `src/` is
 * automatically buildable without config changes.
 *
 * Mirrors `@anvilkit/ui`'s config — the only package in the workspace
 * with a proven React + Rslib bundleless setup.
 */
export default defineConfig({
	source: {
		entry: {
			index: [
				"./src/**/*.ts",
				"./src/**/*.tsx",
				"!./src/**/*.{test,spec}.{ts,tsx}",
				"!./src/**/__tests__/**",
			],
		},
	},
	lib: [
		{
			bundle: false,
			dts: true,
			format: "esm",
		},
		{
			bundle: false,
			format: "cjs",
		},
	],
	output: {
		target: "web",
	},
	plugins: [pluginReact()],
});
