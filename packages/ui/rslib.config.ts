import { pluginReact } from "@rsbuild/plugin-react";
import { defineConfig } from "@rslib/core";

export default defineConfig({
	source: {
		entry: {
			index: [
				"./src/index.ts",
				"./src/*.tsx",
				"./src/hooks/*.tsx",
				"./src/lib/*.ts",
				"./src/lib/*.tsx",
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
