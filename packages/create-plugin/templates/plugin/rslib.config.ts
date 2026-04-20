import { defineConfig } from "@rslib/core";

/**
 * Bundleless build for `@anvilkit/plugin-__NAME__`.
 *
 * Each `.ts` under `src/` becomes an individual ESM + CJS output
 * in `dist/`. Peer deps stay external.
 */
export default defineConfig({
	source: {
		entry: {
			index: [
				"./src/**/*.ts",
				"!./src/**/*.{test,spec}.ts",
				"!./src/**/__tests__/**",
			],
		},
	},
	lib: [
		{
			bundle: false,
			dts: { autoExtension: true },
			format: "esm",
		},
		{
			bundle: false,
			dts: { autoExtension: true },
			format: "cjs",
		},
	],
	output: {
		target: "node",
		externals: [
			"@anvilkit/core",
			"@puckeditor/core",
			"react",
			"react-dom",
		],
	},
});
