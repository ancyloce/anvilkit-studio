// @ts-check
import react from "@astrojs/react";
import starlight from "@astrojs/starlight";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// Starlight bootstrap for the AnvilKit documentation site (phase4-001).
// Sidebar groups below are intentionally shells — later Phase 4 tasks
// (phase4-002 … phase4-010) populate Components, Guides, API Reference,
// and Playground with real content.
export default defineConfig({
	site: "https://anvilkit.dev",
	vite: {
		// `@tailwindcss/vite` (4.2.2) still ships Vite 7-era plugin types while
		// Astro 6 now bundles Vite 8 / rolldown. Runtime integration works,
		// but `astro check` surfaces a PluginOption variance error — the
		// cast narrows scope to this single line until Tailwind ships a
		// Vite 8-compatible release.
		plugins: [/** @type {any} */ (tailwindcss())],
	},
	integrations: [
		react(),
		starlight({
			title: "AnvilKit",
			description:
				"Puck-native React component packages, runtime, and plugin ecosystem.",
			social: [
				{
					icon: "github",
					label: "GitHub",
					href: "https://github.com/ancyloce/anvilkit-studio",
				},
			],
			customCss: ["./src/styles/tokens.css"],
			sidebar: [
				{
					label: "Getting Started",
					items: [
						{ label: "Introduction", slug: "" },
						{ label: "Quickstart", slug: "getting-started" },
					],
				},
				{
					label: "Components",
					collapsed: false,
					// Auto-populated from src/content/docs/components/*.mdx,
					// which phase4-002's generator writes during prebuild.
					autogenerate: { directory: "components" },
				},
				{
					label: "Templates",
					collapsed: false,
					// Auto-populated from src/content/docs/templates/*.mdx,
					// written by `scripts/generate-template-pages.mjs` at
					// prebuild time (phase5-018).
					autogenerate: { directory: "templates" },
				},
				{
					label: "Guides",
					collapsed: false,
					items: [
						{
							label: "Component authoring",
							slug: "guides/component-authoring",
						},
						{
							label: "Generator usage",
							slug: "guides/generator-usage",
						},
						{
							label: "Plugin authoring",
							slug: "guides/plugin-authoring",
						},
						{
							label: "Export pipeline",
							slug: "guides/export-pipeline",
						},
					],
				},
				{
					label: "API Reference",
					collapsed: true,
					// Auto-populated from src/content/docs/api/*, which
					// phase4-003's generator (`scripts/generate-api-pages.ts`)
					// emits during prebuild via TypeDoc.
					autogenerate: { directory: "api" },
				},
				{
					label: "Playground",
					collapsed: false,
					items: [
						{
							label: "Interactive playground",
							link: "/playground/",
							badge: { text: "Live", variant: "tip" },
							attrs: { "data-testid": "sidebar-playground-link" },
						},
					],
				},
				{
					label: "Marketplace",
					collapsed: false,
					items: [
						{
							label: "Plugins, templates, components",
							link: "/marketplace/",
							badge: { text: "New", variant: "note" },
							attrs: { "data-testid": "sidebar-marketplace-link" },
						},
					],
				},
			],
		}),
	],
});
