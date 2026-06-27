/**
 * @file Example: wrap workspace plugins with `lazyPlugin` so each
 * plugin lands in its own bundler chunk and is only fetched when the
 * host page actually mounts `<Studio plugins={[…]}/>` with that
 * plugin in the array.
 *
 * The plugin's `meta` is provided synchronously to `lazyPlugin` so the
 * runtime can validate `coreVersion`, dedupe ids, and fingerprint the
 * plugins array without paying the dynamic-import cost. The plugin
 * module itself is awaited at `register()` time.
 *
 * Enable/disable is then purely a host concern — include the lazy
 * plugin in the `plugins` array when it's enabled, omit it when not.
 * The sidebar rail will pick up its registered slot via the existing
 * registry subscription in `SidebarRail.tsx`.
 */

import type { StudioPlugin } from "@anvilkit/core";
import {
	lazyPlugin,
	lazyPluginWith,
	withoutHeaderActions,
} from "@anvilkit/core";
import type { AssetRegistry } from "@anvilkit/plugin-asset-manager";
import type { Config } from "@puckeditor/core";
import { FileCode, FileCode2, Frame, History } from "lucide-react";
import { createElement } from "react";

/**
 * Collapse repeated `import()` of a plugin package to a single resolved
 * value. Webpack already dedupes the chunk for an identical specifier,
 * but memoizing the resolved promise also guarantees one shared module
 * instance — so a lazy plugin entry's `register()` and any host handler
 * that needs the same package's named exports never trigger two loads.
 */
function memoLoader<T>(load: () => Promise<T>): () => Promise<T> {
	let promise: Promise<T> | undefined;
	return () => {
		promise ??= load();
		return promise;
	};
}

/**
 * Deferred plugin-package modules. The chunk is fetched on first call.
 * The editor page imports these so its export handlers and asset-manager
 * test harness share the exact chunk the lazy plugin entries load.
 */
export const loadExportHtml = memoLoader(
	() => import("@anvilkit/plugin-export-html"),
);
export const loadExportReact = memoLoader(
	() => import("@anvilkit/plugin-export-react"),
);
export const loadAssetManager = memoLoader(
	() => import("@anvilkit/plugin-asset-manager"),
);

// Demo host image for the Canvas Studio overlay's `image` tool. A 1×1
// transparent PNG seeded into every opened design so a placed image resolves
// to renderable bytes (the standalone /studio/canvas route uses the same id).
const HOST_IMAGE_ASSET_ID = "demo-host-image";
const HOST_IMAGE_DATA_URL =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

/**
 * Lazy HTML-export plugin. Only registers an `ExportFormatDefinition`
 * (no first-paint pixel), so deferring it cannot cause a layout shift.
 * `headerAction: false` mirrors the editor's chrome contract: the
 * AnvilKit `<PublishPanel>` is the single entry point for every format,
 * so the plugin's own toolbar button is suppressed.
 */
export const lazyHtmlExportPlugin: StudioPlugin = lazyPlugin(
	async () => {
		const mod = await loadExportHtml();
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

/**
 * Lazy React-export plugin. Same rationale as {@link lazyHtmlExportPlugin}
 * — a publish-panel format with no first-paint surface. The chrome's
 * `<HeaderActions>` already filters any `export-*` action id, so no
 * `headerAction` opt-out flag is needed here.
 */
export const lazyReactExportPlugin: StudioPlugin = lazyPlugin(
	async () => {
		const mod = await loadExportReact();
		return mod.createReactExportPlugin({
			syntax: "tsx",
			assetStrategy: "url-prop",
		});
	},
	{
		id: "anvilkit-plugin-export-react",
		name: "React Export",
		version: "0.1.4",
		coreVersion: "^0.1.3",
		description: "Export Puck pages as React (.tsx / .jsx) source files.",
		capabilities: { header: true },
		icon: createElement(FileCode2),
	},
);

/**
 * Lazy asset-manager plugin wired for the demo: the `data:` URL uploader
 * (works fully in-browser, no server) with the header action stripped so
 * the chrome owns the toolbar. {@link lazyPluginWith} applies the
 * {@link withoutHeaderActions} transform *inside* the lazy boundary, so
 * the chunk is still only fetched at `register()` time (the old eager
 * `withoutHeaderActions(instance)` wrapper forced the import at module
 * scope). Shares {@link loadAssetManager} with the editor's e2e harness.
 *
 * Uses the two-argument `lazyPluginWith(load, transform)` form: the
 * plugin's `meta` (id, version, `coreVersion`, …) is loaded from the
 * chunk rather than re-declared here. Safe for this plugin because its
 * header action is stripped, so the chrome never needs its
 * `capabilities.header` reserved before the chunk loads (other
 * header-capable plugins keep the header-action region rendered).
 */
// The plugin keeps its asset registry internal, so the editor's standalone
// export handlers (`puckDataToIR` + `format.run`) have nothing to resolve
// `asset://<id>` references against. We mirror every successful upload into
// this demo-owned registry so {@link getDemoAssetRegistry} can feed
// `createIRAssetResolver` at export time.
let demoAssetRegistry: AssetRegistry | undefined;

/** The demo's export-side asset registry (mirrors uploads); `undefined` until the asset plugin registers. */
export function getDemoAssetRegistry(): AssetRegistry | undefined {
	return demoAssetRegistry;
}

// Unsplash is enabled only when the operator opts in via `NEXT_PUBLIC_UNSPLASH_ENABLED`
// (so the client wires the proxy endpoint) AND sets the server-only
// `UNSPLASH_ACCESS_KEY` (so `app/api/unsplash/[...path]` can authenticate).
// Proxy-first: the key never reaches the browser (PRD 0002 §8.3). Absent the
// flag, the demo omits Unsplash and the sidebar shows just the library + folders.
const demoUnsplashOptions =
	process.env.NEXT_PUBLIC_UNSPLASH_ENABLED === "1"
		? {
				proxyEndpoint: "/api/unsplash",
				appName: "anvilkit-demo",
				// Per-request ceiling so a blocked/flaky network path can't spin the
				// Images rail forever — a timeout surfaces as a retryable
				// `PROVIDER_NETWORK` and the sidebar shows "Unsplash unavailable".
				// 14s is a deliberate backstop ABOVE the proxy route's worst case
				// (`UNSPLASH_PROXY_TIMEOUT_MS`, default 6s, × 2 attempts ≈ 12s), so
				// the proxy's own retry + clean 504 surfaces first; this only governs
				// if the Next route itself wedges. To fail faster, lower BOTH this and
				// `UNSPLASH_PROXY_TIMEOUT_MS` together.
				requestTimeoutMs: 14_000,
			}
		: undefined;

export const lazyAssetManagerNoHeaderPlugin: StudioPlugin = lazyPluginWith(
	async () => {
		const mod = await loadAssetManager();
		demoAssetRegistry ??= mod.createAssetRegistry();
		const registry = demoAssetRegistry;
		const baseUploader = mod.dataUrlUploader();
		const trackedUploader: typeof baseUploader = async (file, options) => {
			const result = await baseUploader(file, options);
			// Side-mirror for export resolution; the plugin still registers the
			// same result into its own internal registry for the sidebar.
			registry.register(result);
			return result;
		};
		return mod.createAssetManagerPlugin({
			uploader: trackedUploader,
			dataUrlAllowlistOptIn: true,
			// Folders default ON in the plugin; set explicitly for clarity so the
			// demo's Images rail always shows the folder breadcrumb + tree.
			folders: true,
			...(demoUnsplashOptions ? { unsplash: demoUnsplashOptions } : {}),
		});
	},
	withoutHeaderActions,
);

/**
 * Lazy version-history pair for the demo. The demo's
 * `createDemoVersionHistoryPlugins` (in `history-sidebar-plugin.tsx`)
 * eagerly pulls `@anvilkit/plugin-version-history` + its `/ui` subpath,
 * so we defer the whole module behind one memoized `import()` and expose
 * two lazy entries that share it:
 *   - the headless plugin (header action stripped, chrome owns the
 *     toolbar), and
 *   - the sidebar-panel registration.
 *
 * `puckConfig` is needed by the sidebar panel to derive IR, so the
 * factory is parameterized rather than module-scope.
 */
export function createLazyDemoVersionHistoryPlugins(puckConfig: Config): {
	readonly versionHistoryPlugin: StudioPlugin;
	readonly historySidebarPlugin: StudioPlugin;
} {
	const load = memoLoader(async () => {
		const mod = await import("./history-sidebar-plugin");
		return mod.createDemoVersionHistoryPlugins({ puckConfig });
	});

	const versionHistoryPlugin = lazyPluginWith(
		async () => (await load()).versionHistoryPlugin,
		{
			id: "anvilkit-plugin-version-history",
			name: "Version History",
			version: "0.1.4",
			coreVersion: "^0.1.0-alpha",
			description: "Sidebar history panel + snapshot adapter",
			capabilities: { header: true },
			icon: createElement(History),
		},
		withoutHeaderActions,
	);

	const historySidebarPlugin = lazyPlugin(
		async () => (await load()).sidebarPlugin,
		{
			id: "anvilkit-demo-history-sidebar",
			name: "Demo Version History Sidebar",
			version: "0.0.1",
			coreVersion: "^0.1.0-alpha",
			description:
				"Registers @anvilkit/plugin-version-history's UI with the StudioSidebar `history` module.",
		},
	);

	return { versionHistoryPlugin, historySidebarPlugin };
}

/**
 * Lazy-loaded Canvas Studio plugin. This is the heaviest plugin in the
 * demo — its `register()` pulls `@anvilkit/canvas-editor`, which in turn
 * pulls Konva + react-konva — so deferring it keeps that whole graph out
 * of the editor page's initial chunk until `<Studio>` actually mounts.
 *
 * The loader runs client-side at `register()` time, so `localStorage` is
 * available and the persistence adapter is created here (keeping the
 * adapter import deferred too). The SSR-noop fallback mirrors the
 * convention used by the standalone canvas route's `CanvasStudioClient`.
 */
export const lazyCanvasStudioPlugin: StudioPlugin = lazyPlugin(
	async () => {
		const mod = await import("@anvilkit/plugin-canvas-studio");
		const adapter =
			typeof globalThis.localStorage === "undefined"
				? {
						save: () => undefined,
						load: () => null,
						list: () => [],
						delete: () => undefined,
					}
				: mod.localStorageCanvasAdapter({ namespace: "demo-canvas" });
		return mod.createCanvasStudioPlugin({
			adapter,
			// Demo image picker: the editor's `image` tool resolves this to an
			// asset id and places a node referencing it. We return a fixed host
			// image and seed it into every opened design (mirrors the standalone
			// /studio/canvas route) so placing an image needs no picker UI and
			// always resolves to renderable bytes.
			onPickAsset: async () => HOST_IMAGE_ASSET_ID,
			seedAssets: {
				[HOST_IMAGE_ASSET_ID]: {
					id: HOST_IMAGE_ASSET_ID,
					uri: HOST_IMAGE_DATA_URL,
				},
			},
		});
	},
	{
		id: "@anvilkit/plugin-canvas-studio",
		name: "Canvas Studio",
		version: "0.1.1",
		coreVersion: "^0.1.0-alpha",
		description:
			"Mounts the Canvas Studio overlay, registers the design-block quick-add, and exposes the design:// asset resolver.",
		capabilities: { header: true },
		icon: createElement(Frame),
	},
);

/**
 * Lazy AI Image sidebar plugin. Surfaces `@anvilkit/plugin-ai-image`'s
 * generation panel in the StudioSidebar `copilot` module (mirrors
 * {@link createCopilotSidebarPlugin}). The mask UI transitively pulls Konva, so
 * the whole package is deferred behind one `import()` until `<Studio>` compiles
 * its plugins. A deterministic mock provider (no API key / no network) drives
 * jobs — consistent with AI Copilot's `createMockGenerate*`. `getLayerContext`
 * returns `null` (the panel shows its "no active artboard" state) until a
 * canvas-studio selection bridge is wired (a follow-up).
 */
export const lazyAiImageSidebarPlugin: StudioPlugin = lazyPlugin(
	async () => {
		const [
			{ createAiImageSidebarPlugin },
			{ createAiJobClient },
			{ createMockAiImageProvider },
		] = await Promise.all([
			import("@anvilkit/plugin-ai-image/react"),
			import("@anvilkit/plugin-ai-image"),
			import("@anvilkit/plugin-ai-image/mock"),
		]);
		return createAiImageSidebarPlugin({
			jobClient: createAiJobClient({ provider: createMockAiImageProvider() }),
			getLayerContext: () => null,
		});
	},
	{
		id: "@anvilkit/plugin-ai-image-sidebar",
		name: "AI Image",
		version: "0.1.0",
		coreVersion: "^0.1.0-alpha",
		description:
			"AI image generation panel in the StudioSidebar `copilot` module (mock provider).",
	},
);
