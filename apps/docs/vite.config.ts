import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import mdx from "fumadocs-mdx/vite";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import { resolveDocsBuildTarget } from "./build-target";
import { collabRelayVitePlugin } from "./integrations/collab-relay.mjs";

const docsBuildTarget = resolveDocsBuildTarget(process.env.NITRO_PRESET);

export default defineConfig({
	// Expose PUBLIC_* env vars to client code (Astro parity) so the playground's
	// PUBLIC_COLLAB_WS_* overrides work; without it it falls back to :41234.
	envPrefix: ["VITE_", "PUBLIC_"],
	server: {
		port: 4321,
		host: "0.0.0.0",
	},
	plugins: [
		// Embedded Hocuspocus relay for /playground?collab=1 (dev/preview only).
		collabRelayVitePlugin(),
		mdx(),
		tailwindcss(),
		tanstackStart({
			// Seed the localized home pages. The language switcher navigates via JS,
			// so these routes are not found by automatic static-route discovery.
			pages: [{ path: "/zh" }, { path: "/ja" }, { path: "/ko" }],
			prerender: {
				// The Docker node-server renders on demand. Avoid retaining the full
				// localized crawl graph in memory while building that image.
				enabled: docsBuildTarget.prerender,
				// Generated API pages contain thousands of relative cross-links. The
				// crawler retains every discovered variant until the build completes,
				// which exhausts the CI heap. Static routes are still auto-discovered;
				// dynamic docs routes are rendered by Nitro on demand.
				crawlLinks: docsBuildTarget.crawlLinks,
				failOnError: false,
			},
		}),
		react(),
		// Hosting via Nitro. Defaults to the Vercel preset (the production
		// deploy target). A Docker build sets NITRO_PRESET=node-server to emit
		// a runnable Node server at `.output/server/index.mjs` instead; the
		// Vercel/CI build is unchanged because the env var is unset there. See:
		// https://tanstack.com/start/latest/docs/framework/react/guide/hosting
		nitro({
			preset: docsBuildTarget.nitroPreset,
		}),
	],
	resolve: {
		tsconfigPaths: true,
		alias: {
			tslib: "tslib/tslib.es6.js",
		},
	},
	ssr: {
		// The /playground route is client-only (ssr:false + lazy mount), but the
		// SSR build still bundles its module graph and chokes on @anvilkit/core's
		// relative i18n JSON dynamic imports + Konva. Externalize the heavy
		// @anvilkit/Puck/canvas graph from the SSR bundle so those packages
		// resolve against their own dist at runtime (never actually executed
		// server-side). Mirrors Astro's `client:only` keeping the graph out of SSR.
		// vite ssr.external accepts exact package names only (regex → noExternal).
		external: [
			"@anvilkit/bento-grid",
			"@anvilkit/blog-list",
			"@anvilkit/button",
			"@anvilkit/canvas-editor",
			"@anvilkit/collab-ui",
			"@anvilkit/core",
			"@anvilkit/helps",
			"@anvilkit/hero",
			"@anvilkit/input",
			"@anvilkit/ir",
			"@anvilkit/logo-clouds",
			"@anvilkit/navbar",
			"@anvilkit/plugin-ai-copilot",
			"@anvilkit/plugin-asset-manager",
			"@anvilkit/plugin-canvas-studio",
			"@anvilkit/plugin-collab-yjs",
			"@anvilkit/plugin-design-system",
			"@anvilkit/plugin-export-html",
			"@anvilkit/plugin-export-react",
			"@anvilkit/plugin-version-history",
			"@anvilkit/pricing-minimal",
			"@anvilkit/section",
			"@anvilkit/statistics",
			"@puckeditor/core",
			"konva",
			"react-konva",
			"yjs",
			"y-protocols",
			"@hocuspocus/provider",
		],
	},
});
