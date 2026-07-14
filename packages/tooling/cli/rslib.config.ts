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
	performance: {
		// rslib defaults performance.buildCache to true, but rspack 2.x's
		// persistent cache storage is not concurrency-safe under Turbo's
		// parallel `^build` fan-out (concurrency: 32) -> SIGABRT or
		// silently missing/corrupted dist output (e.g. missing .d.ts).
		buildCache: false,
	},
});
