import type { StudioPlugin } from "@anvilkit/core";
import { lazyPlugin } from "@anvilkit/core";
import { createAiCopilotPlugin } from "@anvilkit/plugin-ai-copilot";
import { createCodeEditorPlugin } from "@anvilkit/plugin-code-editor";
import { createDesignSystemPlugin } from "@anvilkit/plugin-design-system";
import { FileCode, FileCode2 } from "lucide-react";
import { componentEditorConfig } from "./editor-config";
import { createCopilotGenerators } from "./generation/copilot-wiring";
import { createGenerationProvider } from "./generation/index";
import { createElement } from "react";

/**
 * Plugin roster for the component editor (design 0022 §1.4).
 *
 * **Array order is the override-composition order** — a later plugin's
 * overrides wrap an earlier one's. The order below is the design's, with
 * the two not-yet-built entries called out so they land in the right slot:
 *
 *   1. `createCodeEditorPlugin(...)` — first, so later plugins' overrides
 *      compose around its editor surface.
 *   2. `createAiCopilotPlugin(...)` — generation functions injected from
 *      the provider port, so the cloud swap (P3-02) is a config flip.
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

const codeEditorPlugin: StudioPlugin = createCodeEditorPlugin({
	// JSON is editable; TSX is the P1-08 read-only canonical projection
	// (design 0022 §8.4). Writing TSX arrives behind the P2 `tsxWrite` flag.
	projections: ["json", "tsx"],
});

/**
 * Variant with the code panel already open. E2E needs a deterministic way
 * to reach the opened state without driving shell chrome, and a second
 * module-scope roster keeps array identity stable for both cases (rebuilding
 * either per render would re-register every plugin on each recompile).
 */
const codeEditorPluginOpen: StudioPlugin = createCodeEditorPlugin({
	projections: ["json", "tsx"],
	initiallyOpen: true,
});

/**
 * The copilot, fed by whichever provider `NEXT_PUBLIC_AI_PROVIDER` selects
 * (mock by default). The plugin keeps the ONLY recording commit: its
 * validator gates the provider's untrusted artifact first, so a rejected
 * generation leaves the document untouched.
 */
const aiCopilotPlugin: StudioPlugin = createAiCopilotPlugin({
	...createCopilotGenerators(createGenerationProvider()),
	puckConfig: componentEditorConfig,
}) as unknown as StudioPlugin;

/**
 * The roster, built once at module scope: `<Studio>` memoizes plugin
 * compilation on array identity, so rebuilding it per render would
 * re-register every plugin on each recompile.
 */
export const componentEditorPlugins: StudioPlugin[] = [
	codeEditorPlugin,
	aiCopilotPlugin,
	lazyHtmlExportPlugin,
	lazyReactExportPlugin,
	designSystemPlugin,
];

/** The same roster with the code panel open at mount. */
export const componentEditorPluginsWithCodeOpen: StudioPlugin[] = [
	codeEditorPluginOpen,
	aiCopilotPlugin,
	lazyHtmlExportPlugin,
	lazyReactExportPlugin,
	designSystemPlugin,
];
