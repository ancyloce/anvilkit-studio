import { defineConfig } from "@rslib/core";

/**
 * Bundleless build for `@anvilkit/ir`.
 *
 * Each `.ts` under `src/` becomes an individual ESM + CJS output in
 * `dist/`, matching `@anvilkit/utils`'s layout. `@anvilkit/utils`,
 * `@puckeditor/core`, and `@anvilkit/contracts` are all left external —
 * bundling any of them here would violate the package's dep contract
 * (architecture §8: `@anvilkit/ir` depends on `@anvilkit/utils` at
 * runtime, takes `@puckeditor/core` as a types-only peer, and
 * `@anvilkit/contracts` as a types-only dependency).
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
		externals: ["@anvilkit/utils", "@anvilkit/contracts", "@puckeditor/core"],
	},
	performance: {
		// rslib defaults performance.buildCache to true, but rspack 2.x's
		// persistent cache storage is not concurrency-safe under Turbo's
		// parallel `^build` fan-out (concurrency: 32) -> SIGABRT or
		// silently missing/corrupted dist output (e.g. missing .d.ts).
		buildCache: false,
	},
});
