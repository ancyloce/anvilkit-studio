import { defineConfig } from "@rslib/core";

/**
 * Bundleless build for `@anvilkit/contracts`.
 *
 * The package is **type-only by design** — every module compiles to an
 * (effectively empty) ESM + CJS output plus the `.d.ts` files that
 * carry the actual contract. `@puckeditor/core` is left external: it
 * is a types-only peer (`AiGenerationContext.currentData` references
 * Puck's `Data`) and must never be bundled.
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
			dts: {
				autoExtension: true,
			},
			format: "esm",
		},
		{
			bundle: false,
			dts: {
				autoExtension: true,
			},
			format: "cjs",
		},
	],
	output: {
		target: "node",
		externals: ["@puckeditor/core"],
	},
});
