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
			id: "esm",
			format: "esm",
		},
		{
			bundle: false,
			dts: {
				autoExtension: true,
				distPath: "./dist/cjs",
			},
			id: "cjs",
			format: "cjs",
		},
	],
	output: {
		target: "node",
		externals: ["@puckeditor/core"],
	},
	performance: {
		// rslib defaults performance.buildCache to true, but rspack 2.x's
		// persistent cache storage is not concurrency-safe under Turbo's
		// parallel `^build` fan-out (concurrency: 32) -> SIGABRT or
		// silently missing/corrupted dist output (e.g. missing .d.ts).
		buildCache: false,
	},
});
