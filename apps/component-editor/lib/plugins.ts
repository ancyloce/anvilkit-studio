import type { StudioPlugin } from "@anvilkit/core";
import { lazyPlugin } from "@anvilkit/core";
import { createDesignSystemPlugin } from "@anvilkit/plugin-design-system";
import { FileCode, FileCode2 } from "lucide-react";
import { createElement } from "react";

/**
 * Plugin roster for the component editor (design 0022 §1.4).
 *
 * **Array order is the override-composition order** — a later plugin's
 * overrides wrap an earlier one's. The order below is the design's, with
 * the two not-yet-built entries called out so they land in the right slot:
 *
 *   1. `createCodeEditorPlugin(...)` — arrives with P0-13.
 *   2. `createAiCopilotPlugin(...)` — arrives with P0-20.
 *   3. export plugins (below), lazily loaded.
 *   4. design system (below).
 *   5. optional version history — not in P0 scope.
 *
 * Export plugins register only an `ExportFormatDefinition` (no first-paint
 * surface), so deferring them cannot cause a layout shift — the same
 * rationale as the studio app's roster. They use `lazyPlugin`, not
 * `lazyPluginWith`: these factories take their options at build time here,
 * so no options-bearing wrapper is needed.
 */

const lazyHtmlExportPlugin: StudioPlugin = lazyPlugin(
	async () => {
		const mod = await import("@anvilkit/plugin-export-html");
		return mod.createHtmlExportPlugin({ headerAction: false });
	},
	{
		id: "anvilkit-plugin-export-html",
		name: "HTML Export",
		version: "0.1.4",
		coreVersion: "^0.1.0-alpha",
		description: "Export Puck pages as standalone HTML documents.",
		capabilities: { header: true },
		icon: createElement(FileCode),
	},
);

const lazyReactExportPlugin: StudioPlugin = lazyPlugin(
	async () => {
		const mod = await import("@anvilkit/plugin-export-react");
		return mod.createReactExportPlugin({
			syntax: "tsx",
			assetStrategy: "url-prop",
		});
	},
	{
		id: "anvilkit-plugin-export-react",
		name: "React Export",
		version: "0.1.4",
		coreVersion: "^0.1.0-alpha",
		description: "Export Puck pages as React components.",
		capabilities: { header: true },
		icon: createElement(FileCode2),
	},
);

const designSystemPlugin: StudioPlugin = createDesignSystemPlugin();

/**
 * The roster, built once at module scope: `<Studio>` memoizes plugin
 * compilation on array identity, so rebuilding it per render would
 * re-register every plugin on each recompile.
 */
export const componentEditorPlugins: StudioPlugin[] = [
	lazyHtmlExportPlugin,
	lazyReactExportPlugin,
	designSystemPlugin,
];
