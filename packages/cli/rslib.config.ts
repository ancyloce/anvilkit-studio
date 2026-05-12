import { defineConfig } from "@rslib/core";

export default defineConfig({
	source: {
		entry: {
			"bin/anvilkit": "./src/bin/anvilkit.ts",
		},
	},
	lib: [
		{
			bundle: true,
			dts: false,
			format: "esm",
			banner: {
				js: "#!/usr/bin/env node",
			},
		},
	],
	output: {
		target: "node",
		filename: {
			js: "[name].mjs",
		},
		externals: [/^@anvilkit\//, "cac", "jiti", "picocolors"],
	},
});
