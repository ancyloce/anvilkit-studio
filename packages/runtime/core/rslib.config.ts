import { pluginReact } from "@rsbuild/plugin-react";
import { defineConfig } from "@rslib/core";

/**
 * Bundleless build for `@anvilkit/core`.
 *
 * Every `.ts` / `.tsx` file under `src/` becomes an individual ESM + CJS
 * output under `dist/`, preserving the subpath tree (`src/types/index.ts`
 * → `dist/types/index.js`). Subpath exports in `package.json` rely on
 * that 1:1 mapping, so any new subdirectory added to `src/` is
 * automatically buildable without config changes.
 *
 * Mirrors `@anvilkit/ui`'s config — the only package in the workspace
 * with a proven React + Rslib bundleless setup.
 */
export default defineConfig({
	source: {
		entry: {
			index: [
				"./src/**/*.ts",
				"./src/**/*.tsx",
				"!./src/**/*.{test,spec}.{ts,tsx}",
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
		target: "web",
		copy: [
			// Co-located component CSS (e.g. `pages-tokens.css` next to
			// `PagesPanel.tsx`) is imported via side-effect `import "./*.css"`
			// from the matching `.tsx` and must ship to `dist/` in the same
			// relative location so the import resolves at host build time.
			{
				from: "./src/**/*.css",
				to: ({ absoluteFilename }) => {
					const rel = absoluteFilename
						.replace(/.*[\\/]src[\\/]/, "")
						.replace(/[\\]/g, "/");
					return `./${rel}`;
				},
				globOptions: {
					// `overrides/styles.src.css` is a Tailwind SOURCE compiled to
					// `dist/react/overrides/styles.css` by the `build:css` step that
					// runs after `rslib build` — never ship the raw source.
					ignore: ["**/react/overrides/styles.src.css"],
				},
			},
		],
	},
	performance: {
		// rslib defaults performance.buildCache to true, but rspack 2.x's
		// persistent cache storage is not concurrency-safe under Turbo's
		// parallel `^build` fan-out (concurrency: 32) -> SIGABRT or
		// silently missing/corrupted dist output (e.g. missing .d.ts).
		buildCache: false,
	},
	plugins: [pluginReact()],
});
