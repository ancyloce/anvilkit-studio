import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import mdx from "fumadocs-mdx/vite";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import { collabRelayVitePlugin } from "./integrations/collab-relay.mjs";

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
			// Seed the localized home pages. The language switcher navigates via JS
			// (not a crawlable <a href>), so the prerender crawler never discovers
			// the `/zh`, `/ja`, `/ko` trees on its own. Seeding the localized homes
			// lets the crawler walk each localized sidebar from there, giving the
			// non-default locales the same static coverage as the default one.
			pages: [{ path: "/zh" }, { path: "/ja" }, { path: "/ko" }],
			prerender: {
				enabled: true,
				// Crawl links for full static coverage, but a link to a
				// not-yet-migrated page must not fail the build during the
				// phased content migration. Flip to true once all 257 pages
				// land, to turn broken internal links back into a hard gate.
				failOnError: false,
			},
		}),
		react(),
		// Hosting via Nitro (Vercel preset). See:
		// https://tanstack.com/start/latest/docs/framework/react/guide/hosting
		nitro({
			preset: "vercel",
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
