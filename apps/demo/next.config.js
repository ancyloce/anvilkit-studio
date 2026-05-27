import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
	enabled: process.env.ANALYZE === "1",
});

/** @type {import("next").NextConfig} */
const nextConfig = {
	experimental: {
		externalDir: true,
		// Tree-shake the icon/animation barrels out of route bundles
		// instead of pulling the whole package. `lucide-react` is a
		// direct dep; `motion` arrives transitively via @anvilkit/core,
		// /ui, and /collab-ui (all in `transpilePackages`).
		optimizePackageImports: ["lucide-react", "motion"],
	},
	transpilePackages: [
		"@anvilkit/bento-grid",
		"@anvilkit/blog-list",
		"@anvilkit/button",
		"@anvilkit/canvas-core",
		"@anvilkit/canvas-editor",
		"@anvilkit/collab-ui",
		"@anvilkit/core",
		"@anvilkit/design-block",
		"@anvilkit/hero",
		"@anvilkit/helps",
		"@anvilkit/input",
		"@anvilkit/ir",
		"@anvilkit/logo-clouds",
		"@anvilkit/navbar",
		"@anvilkit/plugin-ai-copilot",
		"@anvilkit/plugin-ai-image",
		"@anvilkit/plugin-asset-manager",
		"@anvilkit/plugin-canvas-studio",
		"@anvilkit/plugin-collab-yjs",
		"@anvilkit/plugin-design-system",
		"@anvilkit/plugin-export-canvas",
		"@anvilkit/plugin-export-html",
		"@anvilkit/plugin-export-react",
		"@anvilkit/plugin-version-history",
		"@anvilkit/pricing-minimal",
		"@anvilkit/schema",
		"@anvilkit/section",
		"@anvilkit/statistics",
		"@anvilkit/ui",
		"@anvilkit/validator",
	],
	webpack: (config) => {
		// Konva ships `lib/index-node.js` as its CJS main entry, which
		// hard-requires the native `canvas` package. The Canvas Studio
		// route mounts the editor strictly via
		// `next/dynamic({ ssr: false })`, so Konva never executes on
		// the server at runtime — but webpack still walks the import
		// graph at build time. Stub the `canvas` resolution so the
		// server compile doesn't fail looking for a native module we
		// never invoke.
		config.resolve.alias = {
			...config.resolve.alias,
			canvas: false,
		};
		return config;
	},
};

export default withBundleAnalyzer(nextConfig);
