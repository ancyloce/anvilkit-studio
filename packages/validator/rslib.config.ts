import { defineConfig } from "@rslib/core";

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
		// Validator runs in both environments: Node (export pipelines,
		// tests) and the browser (AI copilot plugin in the editor). The
		// runtime is plain ES + zod/mini, no Node-only APIs, so a "web"
		// target produces output safe for both. `@anvilkit/ir` is listed
		// even though nothing imports it today — the README's dependency
		// contract forbids it, so an accidental import surfaces as a
		// bundling failure rather than silent inclusion.
		target: "web",
		externals: [
			"@anvilkit/core",
			"@anvilkit/ir",
			"@anvilkit/schema",
			"@anvilkit/utils",
			"@puckeditor/core",
			"zod",
		],
	},
});
