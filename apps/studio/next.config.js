import { join } from "node:path";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
	enabled: process.env.ANALYZE === "1",
});

/** @type {import("next").NextConfig} */
const nextConfig = {
	// Docker: emit a self-contained server bundle (`.next/standalone`) with
	// monorepo deps traced from the repo root, so the image can run with a
	// bare `node apps/studio/server.js` and no `node_modules` install. Gated on
	// DOCKER_BUILD so the Vercel/CI build and local `next start` are unchanged.
	...(process.env.DOCKER_BUILD === "1"
		? {
				output: "standalone",
				outputFileTracingRoot: join(import.meta.dirname, "..", ".."),
			}
		: {}),
	// better-sqlite3 is a native addon (used only by the server-side SQLite
	// page-storage adapter). Keep it external so the standalone trace copies the
	// package — including its prebuilt `.node` binary — into
	// `.next/standalone/node_modules` rather than trying to bundle it (which
	// drops the binary and crashes at boot).
	serverExternalPackages: ["better-sqlite3"],
	experimental: {
		externalDir: true,
		// Tree-shake the icon/animation barrels out of route bundles
		// instead of pulling the whole package. `lucide-react` is a
		// direct dep; `motion` arrives transitively via @anvilkit/core,
		// /ui, and /collab-ui (all in `transpilePackages`).
		optimizePackageImports: ["lucide-react", "motion"],
	},
	// `pnpm typecheck` (`tsc --noEmit`) is the authoritative type-check gate
	// (CLAUDE.md Verification/Definition of Done); `next build`'s own internal
	// TypeScript pass is redundant and, on this Next 16.2.9 + Turbopack combo,
	// crashes with "The 'id' argument must be of type string. Received
	// undefined" partway through — unrelated to any real type error (`pnpm
	// typecheck` passes clean on the exact same source).
	typescript: { ignoreBuildErrors: true },
	transpilePackages: [
		"@anvilkit/analytics-core",
		"@anvilkit/analytics-react",
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
		"@anvilkit/plugin-page-seo",
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
	// Konva ships `lib/index-node.js` as its CJS main entry, which
	// hard-requires the native `canvas` package. The Canvas Studio route
	// mounts the editor strictly via `next/dynamic({ ssr: false })`, so Konva
	// never executes on the server at runtime. Under webpack this needed an
	// explicit `resolve.alias: { canvas: false }` stub so the server compile
	// didn't fail looking for a native module we never invoke. Turbopack does
	// not need it — verified 2026-07-17: `next build --turbopack` compiles
	// clean with no `canvas` config at all — and `turbopack.resolveAlias`
	// rejects a literal `false` value outright (`boolean values are invalid in
	// exports field entries`, a Turbopack panic), so there is no direct
	// equivalent to port even if it were needed.
};

export default withBundleAnalyzer(nextConfig);
