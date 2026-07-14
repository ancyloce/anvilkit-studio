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
		externals: ["@anvilkit/core", "@puckeditor/core", "react", "react-dom"],
	},
	performance: {
		// rslib defaults performance.buildCache to true, but rspack 2.x's
		// persistent cache storage is not concurrency-safe under Turbo's
		// parallel `^build` fan-out (concurrency: 32) -> SIGABRT or
		// silently missing/corrupted dist output (e.g. missing .d.ts).
		buildCache: false,
	},
});
