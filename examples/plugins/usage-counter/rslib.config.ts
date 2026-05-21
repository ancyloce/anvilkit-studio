import { defineConfig } from "@rslib/core";

/**
 * Bundleless build for `@anvilkit/example-usage-counter`.
 *
 * The example plugin ships as a single entry. `@anvilkit/core` and
 * `@puckeditor/core` are left external so the package matches the
 * peer-dep contract documented in the plugin authoring guide.
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
		externals: ["@anvilkit/core", "@puckeditor/core"],
	},
});
