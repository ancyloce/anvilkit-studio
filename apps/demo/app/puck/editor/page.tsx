"use client";

// The Canvas Studio plugin's overlay mounts `<CanvasWorkspace>` from
// `@anvilkit/canvas-editor`; its compiled (preflight-free) chrome stylesheet
// must be loaded by the host or the editor shell renders unstyled/blank.
import "@anvilkit/canvas-editor/styles.css";
import { createConsoleAdapter } from "@anvilkit/analytics-core";
import type { StudioPlugin } from "@anvilkit/core";
import {
	compilePlugins,
	Studio,
	StudioConfigSchema,
	StudioLoadingScreen,
} from "@anvilkit/core";
import type {
	ExportWarning,
	PageIR,
	StudioPage,
	StudioPluginContext,
} from "@anvilkit/core/types";
import { puckDataToIR } from "@anvilkit/ir";
import { createAiCopilotPlugin } from "@anvilkit/plugin-ai-copilot";
import {
	createMockGeneratePage,
	createMockGenerateSection,
} from "@anvilkit/plugin-ai-copilot/mock";
// Asset-manager runtime values are loaded lazily (see `lazy-plugins.ts`
// + the dynamic imports in the export / asset-harness handlers below).
// Only the `UploadResult` *type* is imported eagerly — `import type` is
// erased by `verbatimModuleSyntax`, so it pulls no chunk.
import type { UploadResult } from "@anvilkit/plugin-asset-manager";
import { createDesignSystemPlugin } from "@anvilkit/plugin-design-system";
import { createCanvasExportPlugin } from "@anvilkit/plugin-export-canvas";
import { createPageSeoPlugin } from "@anvilkit/plugin-page-seo";
import type { PageRootProps } from "@anvilkit/schema";
import type { Config, Data } from "@puckeditor/core";
import { useRouter } from "next/navigation";
import {
	type ChangeEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useDemoIdentity } from "@/lib/collab-identity";
import { createCopilotSidebarPlugin } from "@/lib/copilot-sidebar-plugin";
import {
	createLazyDemoVersionHistoryPlugins,
	getDemoAssetRegistry,
	lazyAiImageSidebarPlugin,
	lazyAssetManagerNoHeaderPlugin,
	lazyCanvasStudioPlugin,
	lazyHtmlExportPlugin,
	lazyReactExportPlugin,
	loadAssetManager,
	loadExportHtml,
	loadExportReact,
} from "@/lib/lazy-plugins";
import { persistPage } from "@/lib/page-persistence";
import { pageValidationPlugin } from "@/lib/page-validation-plugin";
import { createPersistedPagesSource } from "@/lib/persisted-pages-source";
import {
	createDemoConfig,
	createDemoData,
	createDemoModeHref,
	createDemoPagesData,
	type DemoComponents,
	demoCopySnippetPlugin,
	demoDataSearchParam,
	demoLayerQuickAddPlugin,
	getDemoDataFromSearchParam,
} from "@/lib/puck-demo";
import { smokeTestPlugin } from "@/lib/smoke-test-plugin";
import { readPersistedStudioLocale } from "@/lib/studio-locale";
import { tokenSwatchComponentConfig } from "@/lib/token-swatch-component";
import styles from "../puck.module.css";

// Plugin set (step 3.2 — pluggable lazy loading).
//
// The heavy / no-first-paint plugins are deferred via `lazyPlugin`
// wrappers in `lazy-plugins.ts`, so their package chunks stay out of the
// `/puck/editor` entry bundle until `<Studio>` compiles its plugins:
//   - export-html / export-react — publish-panel formats only
//   - asset-manager — sidebar image module (header action stripped via
//     the lazy-preserving `lazyPluginWith(withoutHeaderActions)`)
//   - version-history pair — sidebar history panel (+ its `/ui` chunk)
//   - canvas-studio — already lazy (pulls Konva + react-konva)
//
// AI Copilot and Design System stay EAGER on purpose:
//   - `copilotSidebarPlugin` closes over the live `aiCopilotPlugin`
//     instance and renders `<AiCopilotPanel plugin={…}>`, so deferral
//     would mean restructuring the live-instance panel (and risks the
//     AI-copilot E2E contract) — out of scope for 3.2.
//   - `TokenSwatch` (in `editorDemoConfig`, a *static* Puck config
//     component) pulls the design-system field factories, so the plugin
//     cannot leave the entry without moving that component first.
//
// All wrappers are module-scope constants so React re-renders don't mint
// new plugin identities (which would churn the fingerprint and re-run
// `compilePlugins` inside <Studio>, wiping editor/AI data).
const assetManagerTestStudioConfig = StudioConfigSchema.parse({});

// Design System plugin: contributes the `--ak-ds-*` token-bound field
// renderers, the Design System rail panel (Tokens + Theme tabs), and
// the off-token / WCAG-AA contrast validators wired through the
// existing `onDataChange` / `onBeforePublish` lifecycle seams.
const designSystemPlugin = createDesignSystemPlugin();
// F5: the Page SEO rail panel — edits root.props.seo (the canonical page model).
const pageSeoPlugin = createPageSeoPlugin();
// Canvas export formats (PNG / JSON / SVG / PDF). Headless — registers
// `exportFormats` only (no React/Konva), so it stays eager. Its formats consume
// a CanvasIR and are surfaced when the Canvas Studio overlay is active.
const canvasExportPlugin = createCanvasExportPlugin();

// Static (locale-agnostic) demo chrome-label overrides — formerly the
// keys the deprecated flat `<Studio messages>` prop carried. The flat
// prop applied to every locale; the per-locale `config.i18n.messages`
// map reproduces that by placing these under the default
// `fallbackLocale` ("en"), whose bundle back-fills missing keys into
// every active locale. Covers the demo-only plugin keys not in the core
// catalog. Merged with `?messageOverrides=` query overrides inside the
// component (see `studioMessages`). The whole `i18n` block is
// carve-out-exempt from the plugin-compile fingerprint, so populating
// `messages` never recompiles.
const demoChromeMessages: Readonly<Record<string, string>> = {
	"demo.layer.quickadd.hero": "Add demo Hero",
};

// Uncontrolled-mode `onLocaleChange` sink: fires AFTER the store applied
// (and persisted) a switch — the seam a real host would use to sync a
// cookie / router segment. Module scope ⇒ referentially stable.
function handleLocaleChange(locale: string): void {
	console.info("[demo] studio locale switched →", locale);
}

// Editor-only config: extends the shared `demoConfig` with the
// demo-only `TokenSwatch` component that dogfoods the design-system
// plugin's token-bound field factories. Defined here (not in
// `puck-demo.ts`) because `TokenSwatch`'s render and fields import
// from `@anvilkit/plugin-design-system`, which transitively pulls
// `@anvilkit/core`'s React store providers — those use
// `createContext` and so cannot enter the RSC render route's bundle
// graph. `lib/puck-demo.ts` is imported by `/puck/render`; this
// editor page is `"use client"` and safe to host the import.
function createEditorDemoConfig(locale?: string) {
	const base = createDemoConfig(locale);
	return {
		...base,
		categories: {
			...base.categories,
			designSystem: {
				title: "Design System",
				components: ["TokenSwatch"],
			},
		},
		components: {
			...base.components,
			TokenSwatch: tokenSwatchComponentConfig,
		},
	};
}

// English default. The plugin factories below close over THIS stable
// reference (their internals — schema derivation, diff labels — stay
// English); only the `puckConfig` handed to <Studio> is rebuilt per
// locale inside the component, so a locale switch does not change
// plugin identities.
const editorDemoConfig = createEditorDemoConfig();

const aiCopilotPlugin = createAiCopilotPlugin({
	puckConfig: editorDemoConfig as unknown as Config,
	generatePage: createMockGeneratePage({ delayMs: 300 }),
	generateSection: createMockGenerateSection({ delayMs: 300 }),
	timeoutMs: 5_000,
	forwardCurrentData: true,
});

// Wires the existing AI copilot plugin into the StudioSidebar's
// `copilot` module. Hoisted to module scope so the panel registration
// stays stable across React re-renders (mirrors the other plugins
// above).
const copilotSidebarPlugin = createCopilotSidebarPlugin({ aiCopilotPlugin });

// Lazy version-history pair (headless history plugin + sidebar panel).
// The demo factory eagerly pulls `@anvilkit/plugin-version-history` and
// its `/ui` subpath, so it is deferred behind one shared `import()` (see
// `createLazyDemoVersionHistoryPlugins`). The headless plugin's header
// action is stripped inside the lazy boundary so the chrome owns the
// toolbar; the sidebar panel registers `StudioHistoryPanel`.
const {
	versionHistoryPlugin: versionHistoryNoHeaderPlugin,
	historySidebarPlugin,
} = createLazyDemoVersionHistoryPlugins(editorDemoConfig as unknown as Config);

interface AssetManagerTestHarness {
	readonly ctx: StudioPluginContext;
	readonly runtime: Awaited<ReturnType<typeof compilePlugins>>;
	asset: UploadResult | null;
}

function createHeadlessStudioContext(): StudioPluginContext {
	let currentData: Data = { root: { props: {} }, content: [], zones: {} };

	return {
		getData: () => currentData,
		getPuckApi: (() => ({
			dispatch(action: unknown) {
				if (
					action &&
					typeof action === "object" &&
					"type" in action &&
					action.type === "setData" &&
					"data" in action
				) {
					currentData = action.data as Data;
				}
			},
		})) as StudioPluginContext["getPuckApi"],
		studioConfig: assetManagerTestStudioConfig,
		log: () => undefined,
		emit: () => undefined,
		on: () => () => undefined,
		t: (key) => key,
		registerMessages: () => undefined,
		registerAssetResolver: (_resolver) => undefined,
	};
}

async function createAssetManagerTestHarness(): Promise<AssetManagerTestHarness> {
	const ctx = createHeadlessStudioContext();
	// Load the plugin factories on demand (the harness only runs under
	// `?e2e=asset-manager`), reusing the same memoized chunks as the live
	// lazy plugin entries so no second copy is fetched.
	const [assetManagerMod, htmlMod, reactMod] = await Promise.all([
		loadAssetManager(),
		loadExportHtml(),
		loadExportReact(),
	]);
	const runtime = await compilePlugins(
		[
			assetManagerMod.createAssetManagerPlugin({
				uploader: assetManagerMod.dataUrlUploader(),
				dataUrlAllowlistOptIn: true,
			}),
			htmlMod.createHtmlExportPlugin(),
			reactMod.createReactExportPlugin({
				syntax: "tsx",
				assetStrategy: "url-prop",
			}),
		],
		ctx,
	);

	await runtime.lifecycle.emit("onInit", ctx);

	return {
		ctx,
		runtime,
		asset: null,
	};
}

function createAssetReference(id: string): string {
	return `asset://${id}`;
}

function createAssetManagerHtmlIr(assetId: string): PageIR {
	const assetUrl = createAssetReference(assetId);

	return {
		version: "1",
		root: {
			id: "root",
			type: "__root__",
			props: {},
			children: [
				{
					id: "blog-1",
					type: "BlogList",
					props: {
						posts: [
							{
								title: "Resolver smoke test",
								description: "The HTML exporter should resolve asset URLs.",
								imageSrc: assetUrl,
								imageAlt: "Uploaded asset",
							},
						],
					},
				},
			],
		},
		assets: [{ id: assetId, kind: "image", url: assetUrl }],
		metadata: {},
	};
}

function createAssetManagerReactIr(assetId: string): PageIR {
	const assetUrl = createAssetReference(assetId);

	return {
		version: "1",
		root: {
			id: "root",
			type: "__root__",
			props: {},
			children: [
				{
					id: "hero-1",
					type: "Hero",
					props: {
						headline: "Resolver smoke test",
						description: "The React exporter should resolve asset URLs.",
						backgroundSrc: assetUrl,
					},
				},
			],
		},
		assets: [{ id: assetId, kind: "image", url: assetUrl }],
		metadata: {},
	};
}

function downloadExportResult(
	content: string | Uint8Array,
	filename: string,
	mimeType: string,
): void {
	const blobPart =
		typeof content === "string" ? content : new Uint8Array(content);
	const blob = new Blob([blobPart], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	URL.revokeObjectURL(url);
}

function formatWarnings(
	warnings: readonly ExportWarning[] | undefined,
): string {
	if (!warnings || warnings.length === 0) {
		return "none";
	}

	return warnings
		.map(
			(warning) =>
				`${warning.code}: ${warning.message}${warning.nodeId ? ` (${warning.nodeId})` : ""}`,
		)
		.join("\n");
}

// The editor page reads the incoming demo `data` param from
// `window.location.search` in a client effect rather than calling
// `useSearchParams()` at render time. The hook-based approach forces
// the render tree into a `<Suspense>` fallback under Next.js 16's
// `"use client"` boundary, and under Next.js 16 + React 19 that
// Suspense boundary never resolves on client hydration — the page
// gets permanently stuck on its fallback.
//
// This effect-based read sidesteps the issue entirely: the initial
// render uses `createDemoData()`, and on mount we replace it with the
// URL-derived payload. Playwright's smoke test (`e2e/smoke.spec.ts`)
// asserts that `smokeTestPlugin.onInit` fires end-to-end, which
// requires this page to mount successfully.
export default function PuckEditorPage() {
	const router = useRouter();
	const assetManagerHarnessRef = useRef<AssetManagerTestHarness | null>(null);
	const [publishedData, setPublishedData] = useState<
		Data<DemoComponents, PageRootProps>
	>(() => createDemoData());
	// Demo-only Save Draft / Publish state for the consolidated header
	// publish panel. Real apps would persist drafts to a backend; here we
	// just stamp a timestamp and route the panel's "Publish to live"
	// action through the same `handlePublish` flow used by Puck's own
	// publish button.
	const [isSavingDraft, setIsSavingDraft] = useState(false);
	const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
	const [assetManagerTestMode, setAssetManagerTestMode] = useState(false);
	// `?e2e=demo-tools` surfaces the demo's auxiliary validation chrome — the
	// HTML/React export buttons and the published-data snapshot — which the
	// default full-screen editor deliberately omits. The export-html /
	// export-react / pages-management specs opt into this mode.
	const [demoToolsMode, setDemoToolsMode] = useState(false);
	// Phase 4 Puck-drag E2E mirrors `publishedData` and intercepts
	// exports onto `window.__puckData` / `window.__puckExports` so the
	// spec can assert without parsing iframe contents or downloads.
	const [puckDragE2eMode, setPuckDragE2eMode] = useState(false);
	const [assetManagerUploadMode, setAssetManagerUploadMode] = useState<
		"safe" | "rogue"
	>("safe");
	// Phase 4 hardening fixtures: the spec drives different rogue
	// payloads through the same registry-bypass code path via
	// `?rogueUrl=...`. Defaults to the legacy `javascript:` URL so the
	// existing test continues to pass without a query param.
	const [assetManagerRogueUrl, setAssetManagerRogueUrl] = useState(
		"javascript:alert(1)",
	);
	const [assetManagerStatus, setAssetManagerStatus] = useState("Idle.");
	const [assetManagerHtmlOutput, setAssetManagerHtmlOutput] = useState("");
	const [assetManagerHtmlWarnings, setAssetManagerHtmlWarnings] =
		useState("none");
	const [assetManagerReactOutput, setAssetManagerReactOutput] = useState("");
	const [assetManagerReactWarnings, setAssetManagerReactWarnings] =
		useState("none");
	// Collaboration is ON by default in the showcase editor (`?collab=0` opts
	// out); the editor auto-connects to the Hocuspocus relay the `dev`
	// supervisor starts, so opening `/puck/editor` in two tabs shows peers
	// without any extra step.
	const [collabEnabled, setCollabEnabled] = useState(true);
	const [collabQueryReady, setCollabQueryReady] = useState(false);
	const [collabPeerOverride, setCollabPeerOverride] = useState<string | null>(
		null,
	);
	const [collabRelayUrl, setCollabRelayUrl] = useState<string | null>(null);
	// Selected managed transport. `ws` → y-websocket relay (:21234, the E2E
	// path); `hocuspocus` → the auto-started Hocuspocus relay whose URL is
	// resolved at runtime from `/api/collab/config` (:31234 by default); `null`
	// → single-tab in-memory.
	const [collabRelayKind, setCollabRelayKind] = useState<
		"ws" | "hocuspocus" | null
	>("hocuspocus");
	const [collabRoom, setCollabRoom] = useState("demo-room");
	const [showRemoteCursors] = useState(true);
	const {
		identity: demoIdentity,
		ready: demoIdentityReady,
		setDisplayName: setDemoIdentityName,
	} = useDemoIdentity({
		enabled: collabQueryReady,
		peerOverride: collabPeerOverride,
	});
	// Phase 6: `?chrome=puck` opts out of the AnvilKit chrome and
	// renders the raw Puck editor for visual regression checks.
	const [chromeMode, setChromeMode] = useState<"anvilkit" | "puck">("anvilkit");

	// Host-side mirror of Studio's UNCONTROLLED locale store: seeded from
	// the persisted value on mount (onLocaleChange only fires on switches),
	// then kept in sync via the wrapped handler below. Drives the
	// locale-aware Puck config — Puck field labels are plain strings, so
	// they only change when the config object is rebuilt.
	const [studioLocale, setStudioLocale] = useState("en");

	useEffect(() => {
		setStudioLocale(readPersistedStudioLocale("demo-editor"));
	}, []);

	// Rebuilding puckConfig rotates the plugin-compile key (a deliberate
	// recompile): the editor re-seeds from `data`, same semantics as the
	// page-switch remount on <Studio key={activePageId}>. The `en` case
	// reuses the module-scope object so the mount effect does not
	// invalidate the initial compile.
	const localizedEditorConfig = useMemo(
		() =>
			studioLocale === "en"
				? editorDemoConfig
				: createEditorDemoConfig(studioLocale),
		[studioLocale],
	);

	const handleStudioLocaleChange = useCallback((locale: string) => {
		handleLocaleChange(locale);
		setStudioLocale(locale);
	}, []);
	// Phase G E2E hook: `?messageOverrides=<urlencoded JSON>` layers onto
	// the demo's chrome labels so the sidebar-modules spec can exercise the
	// PRD §10.2 alias map at runtime (legacy `studio.tab.*` keys resolve
	// through the new `studio.module.*` namespace). These flow through
	// `config.i18n.messages` below — the deprecated flat `<Studio messages>`
	// prop is gone.
	const [messageOverrides, setMessageOverrides] = useState<
		Readonly<Record<string, string>> | undefined
	>(undefined);
	// Demo-owned chrome labels (`demoChromeMessages`) merged with the
	// query-param overrides so the alias-map spec can layer on top.
	const studioMessages = useMemo<Readonly<Record<string, string>>>(
		() => ({ ...demoChromeMessages, ...(messageOverrides ?? {}) }),
		[messageOverrides],
	);
	// Studio config (Layer 3 host overrides). `showLocaleSwitch` mounts the
	// built-in header LanguageSwitcher (replacing the old
	// `headerEnd={<LanguageSwitcher/>}` wiring); no `i18n.locale`, so the
	// mount stays UNCONTROLLED (the user's choice persists per `storeId`,
	// `onLocaleChange` is a pure notification tap). `i18n.messages` carries
	// the demo's chrome overrides under "en" (the default `fallbackLocale`)
	// so they back-fill into every active locale — the config-centric
	// replacement for the removed flat `messages` prop. Memoized on
	// `studioMessages` so identity only rotates when the E2E overrides change;
	// the `i18n` block is carve-out-exempt from the compile fingerprint, so
	// this never recompiles plugins.
	const demoStudioConfig = useMemo(
		() => ({
			i18n: { showLocaleSwitch: true, messages: { en: studioMessages } },
		}),
		[studioMessages],
	);

	// F9: editor-side analytics. The console adapter logs the system events
	// (draft_saved / page_published / component_dropped) emitted by <Studio>.
	const analyticsAdapter = useMemo(
		() => createConsoleAdapter({ source: "studio" }),
		[],
	);

	// Durable pages source for the layer sidebar module: keeps the rail's
	// deterministic seed ids + locked/reorder/optimistic-duplicate behavior, and
	// writes every create/rename/delete/duplicate/settings mutation through to the
	// SQLite-backed Page API so editor edits resolve at `/puck/render/<slug>`.
	// Stable identity (`useMemo` with no deps) so the source's internal
	// active-page state survives re-renders. The source itself owns
	// active-page tracking and re-emits via `subscribe()` on `onSelect`.
	const pagesSource = useMemo(
		() =>
			createPersistedPagesSource({
				// `title`/`seo` are canonical in each page's Puck `root.props`.
				// `getRootProps` reads the per-page document map (kept current for
				// the active page by the sync effect below); `updateRootProps`
				// writes rename/SEO edits back into it so the rail, breadcrumb, and
				// renderer all read one source. `getRootProps` deliberately reads
				// only `pageDataMapRef` (never `activePageIdRef`) — the source's
				// first `list()` runs during render before `activePageIdRef` is set.
				getRootProps: (id) => pageDataMapRef.current[id]?.root.props,
				updateRootProps: (id, patch) => {
					const applyPatch = (
						doc: Data<DemoComponents, PageRootProps>,
					): Data<DemoComponents, PageRootProps> => ({
						...doc,
						// Every demo doc carries a full `root.props` (F3); narrow off
						// the optional so the merge stays a complete `PageRootProps`.
						root: {
							...doc.root,
							props: { ...(doc.root.props as PageRootProps), ...patch },
						},
					});
					const existing = pageDataMapRef.current[id];
					if (existing !== undefined) {
						pageDataMapRef.current[id] = applyPatch(existing);
					}
					if (id === activePageIdRef.current) {
						setPublishedData((current) => applyPatch(current));
					}
				},
			}),
		[],
	);

	// Locale switcher: config-centric — `demoStudioConfig.i18n.showLocaleSwitch`
	// (the memoized config above) mounts the built-in header switcher; the
	// old `headerEnd={<LanguageSwitcher/>}` seam is gone. Uncontrolled mode
	// (no `i18n.locale` in the config), so the choice still persists per
	// `storeId` and `onLocaleChange` is just a notification tap.

	// Per-page canvas content for the layer sidebar. The source owns which
	// page is active; this map owns each page's Puck document. Clicking a
	// row fires `source.onSelect` → `subscribe()` → the effect below swaps
	// `publishedData` to the selected page and remounts `<Studio>` (via the
	// `key` prop) so Puck re-initializes with the new document. The header
	// breadcrumb title updates independently in core (it reads the same
	// source's `active` flag).
	const pageDataMapRef = useRef<
		Record<string, Data<DemoComponents, PageRootProps>>
	>(createDemoPagesData());
	// The demo source's `list()` is synchronous; the union return type from
	// `StudioPagesSource` is narrowed with a cast here.
	const readActivePageId = useCallback((): string => {
		const list = pagesSource.list() as readonly StudioPage[];
		return list.find((page) => page.active)?.id ?? list[0]?.id ?? "home";
	}, [pagesSource]);
	const activePageIdRef = useRef<string>(readActivePageId());
	const [activePageId, setActivePageId] = useState<string>(
		activePageIdRef.current,
	);

	useEffect(() => {
		const syncActivePage = (): void => {
			const next = readActivePageId();
			const prev = activePageIdRef.current;
			if (next === prev) return;
			// Stash the outgoing page's current document, then load the
			// incoming one (falling back to the default showcase for pages
			// created at runtime). The functional updater reads the latest
			// `publishedData` without re-subscribing on every edit.
			setPublishedData((current) => {
				pageDataMapRef.current[prev] = current;
				return pageDataMapRef.current[next] ?? createDemoData();
			});
			activePageIdRef.current = next;
			setActivePageId(next);
		};
		syncActivePage();
		const unsubscribe = pagesSource.subscribe?.(syncActivePage);
		return () => unsubscribe?.();
	}, [pagesSource, readActivePageId]);

	// Mirror the active page's live document into the page-data map so the
	// pages-source derives its title/SEO (from `root.props`) off fresh data
	// without the source subscribing to Puck. Page swaps stash the outgoing
	// doc in the effect above; this keeps the *active* entry current between
	// swaps so `getRootProps(activeId)` never reads a stale snapshot.
	useEffect(() => {
		const id = activePageIdRef.current;
		if (id.length > 0) pageDataMapRef.current[id] = publishedData;
	}, [publishedData]);

	// Collab plugins live in `@anvilkit/collab-ui` / `@anvilkit/plugin-collab-yjs`,
	// which (together with the provider libs) pull in the whole yjs stack
	// (~190 KB). We import the factory *dynamically*, only under `?collab=1`, so
	// that stack stays out of the default editor bundle.
	//
	// The consolidated `createCollabPlugin()` now owns the ENTIRE transport
	// (doc + awareness + provider + status bridge + teardown) — no hand-built
	// bundle. `?relay=ws` selects the managed y-websocket relay
	// (`collabRelayUrl`, :21234); with no relay the plugin runs single-tab
	// in-memory. `createCollabStudioPlugin` still reads the adapter from the
	// `<CollabUIProvider>` context, so it is registered *after* the consolidated
	// plugin. The `cancelled` flag drops a late dynamic-import resolve (deps
	// change / unmount / StrictMode double-invoke); the plugin's own `onDestroy`
	// disposes the transport when `<Studio>` tears the plugin down.
	const [collabPlugins, setCollabPlugins] = useState<
		readonly StudioPlugin[] | null
	>(null);

	// Read identity / cursor-toggle through refs so they do NOT rebuild the
	// collab plugin: in managed mode the plugin owns the transport, so a
	// rebuild would tear down and reconnect the WebSocket. The plugin is built
	// ONCE per connection-params change (`collabEnabled`/`relay`/`room`); the
	// initial identity seeds `self`, and later renames flow through the collab
	// context (`onIdentityChange` + the settings popover), not a plugin rebuild.
	// This is the recommended pattern for the `websocketUrl` one-liner — it
	// keeps the socket stable across the host's incidental re-renders.
	const demoIdentityRef = useRef(demoIdentity);
	demoIdentityRef.current = demoIdentity;
	const setDemoIdentityNameRef = useRef(setDemoIdentityName);
	setDemoIdentityNameRef.current = setDemoIdentityName;
	const showRemoteCursorsRef = useRef(showRemoteCursors);
	showRemoteCursorsRef.current = showRemoteCursors;

	useEffect(() => {
		if (!collabEnabled || !demoIdentityReady) {
			setCollabPlugins(null);
			return;
		}
		let cancelled = false;
		void (async () => {
			// Resolve the managed transport. `?relay=hocuspocus` fetches the
			// browser-reachable relay URL at runtime (Docker-friendly: NEXT_PUBLIC
			// is build-time-frozen); `?relay=ws` keeps the y-websocket relay; no
			// relay → in-memory.
			let websocketUrl = collabRelayUrl ?? undefined;
			let provider: "y-websocket" | "hocuspocus" = "y-websocket";
			if (collabRelayKind === "hocuspocus") {
				provider = "hocuspocus";
				try {
					const res = await fetch("/api/collab/config");
					const cfg = (await res.json()) as { wsUrl?: string };
					websocketUrl = cfg.wsUrl ?? "ws://localhost:31234";
				} catch {
					websocketUrl = "ws://localhost:31234";
				}
				if (cancelled) return;
			}
			const [{ createCollabPlugin }, { createCollabStudioPlugin }] =
				await Promise.all([
					import("@anvilkit/collab-ui"),
					import("@/lib/collab-studio-plugin"),
				]);
			if (cancelled) return;
			const collabPlugin = createCollabPlugin({
				// `?relay=ws` → y-websocket relay; `?relay=hocuspocus` → the
				// auto-started Hocuspocus relay (URL from `/api/collab/config`);
				// no relay → omit `websocketUrl` so the plugin runs in-memory.
				websocketUrl,
				provider,
				room: collabRoom,
				self: demoIdentityRef.current,
				puckConfig: editorDemoConfig as unknown as Config,
				onIdentityChange: (next) => {
					if (
						typeof next.displayName === "string" &&
						next.displayName.length > 0
					) {
						setDemoIdentityNameRef.current(next.displayName);
					}
				},
				presence: {
					className: "!fixed z-[9999]",
					showCursors: showRemoteCursorsRef.current,
					resolveSelectionRect: resolvePuckSelectionRect,
					// `createCollabStudioPlugin` below already broadcasts the local
					// cursor *and* selection in one frame; opt out of the plugin's
					// built-in cursor publisher so the two don't clobber each other
					// (awareness replaces the whole presence frame per update).
					broadcastCursor: false,
				},
			});
			setCollabPlugins([collabPlugin, createCollabStudioPlugin()]);
		})();
		return () => {
			cancelled = true;
		};
	}, [
		collabEnabled,
		demoIdentityReady,
		collabRelayUrl,
		collabRoom,
		collabRelayKind,
	]);

	// Memoized so the plugins array reference stays stable across
	// renders. Without this, each render passes a fresh array literal
	// to `<Studio>`, whose compile effect re-fires, unmounts the
	// runtime, and resets Puck's data back to the `publishedData`
	// prop — wiping any AI-generated content instantly.
	const plugins = useMemo(() => {
		const base = [
			smokeTestPlugin,
			pageValidationPlugin,
			lazyHtmlExportPlugin,
			lazyReactExportPlugin,
			aiCopilotPlugin,
			copilotSidebarPlugin,
			versionHistoryNoHeaderPlugin,
			historySidebarPlugin,
			lazyAssetManagerNoHeaderPlugin,
			designSystemPlugin,
			pageSeoPlugin,
			lazyCanvasStudioPlugin,
			canvasExportPlugin,
			lazyAiImageSidebarPlugin,
			demoCopySnippetPlugin,
			demoLayerQuickAddPlugin,
		];
		return collabPlugins ? [...base, ...collabPlugins] : base;
	}, [collabPlugins]);

	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const incomingData = params.get(demoDataSearchParam);
		setAssetManagerTestMode(params.get("e2e") === "asset-manager");
		setDemoToolsMode(params.get("e2e") === "demo-tools");
		setPuckDragE2eMode(params.get("e2e") === "puck-drag");
		const rogueUrlParam = params.get("rogueUrl");
		if (rogueUrlParam !== null && rogueUrlParam.length > 0) {
			setAssetManagerRogueUrl(rogueUrlParam);
		}
		if (incomingData !== null) {
			setPublishedData(getDemoDataFromSearchParam(incomingData));
		}
		setCollabEnabled(params.get("collab") !== "0");
		const peerOverride = params.get("peer");
		if (peerOverride && peerOverride.length > 0) {
			setCollabPeerOverride(peerOverride);
		} else {
			setCollabPeerOverride(null);
		}
		const roomOverride = params.get("room");
		if (roomOverride && roomOverride.length > 0) {
			setCollabRoom(roomOverride);
		}
		// Relay selection:
		//   - bare `/puck/editor` (default showcase) → auto-connect to the
		//     Hocuspocus relay the `dev` supervisor starts (URL from
		//     `/api/collab/config`, :31234);
		//   - `?relay=ws` → y-websocket reference relay (port from `?relayPort=`/
		//     NEXT_PUBLIC_COLLAB_RELAY_PORT, default 21234 — keep in sync with
		//     `scripts/dev-collab.mjs` and `playwright.config.ts`);
		//   - explicit `?collab=1` without a relay → single-tab in-memory.
		const relayParam = params.get("relay");
		if (relayParam === "ws") {
			const port =
				params.get("relayPort") ??
				process.env.NEXT_PUBLIC_COLLAB_RELAY_PORT ??
				"21234";
			setCollabRelayUrl(`ws://localhost:${port}`);
			setCollabRelayKind("ws");
		} else if (relayParam === "hocuspocus") {
			// URL resolved at plugin-build time from `/api/collab/config`.
			setCollabRelayUrl(null);
			setCollabRelayKind("hocuspocus");
		} else if (params.get("collab") === "1") {
			// Explicit opt-in without a relay → single-tab in-memory.
			setCollabRelayUrl(null);
			setCollabRelayKind(null);
		} else {
			// Default showcase → auto-connect to the Hocuspocus relay.
			setCollabRelayUrl(null);
			setCollabRelayKind("hocuspocus");
		}
		setChromeMode(params.get("chrome") === "puck" ? "puck" : "anvilkit");
		setCollabQueryReady(true);
		const rawOverrides = params.get("messageOverrides");
		if (rawOverrides !== null && rawOverrides.length > 0) {
			try {
				const parsed = JSON.parse(rawOverrides) as unknown;
				if (
					parsed !== null &&
					typeof parsed === "object" &&
					!Array.isArray(parsed)
				) {
					setMessageOverrides(parsed as Readonly<Record<string, string>>);
				}
			} catch {
				// Malformed query input — fall through with no overrides.
			}
		}
	}, []);

	useEffect(() => {
		if (!puckDragE2eMode) return;
		const w = window as unknown as { __puckData?: Data };
		w.__puckData = publishedData;
	}, [puckDragE2eMode, publishedData]);

	useEffect(() => {
		if (!puckDragE2eMode) return;
		const w = window as unknown as {
			__puckExportTrigger?: (formatId: string) => Promise<void>;
		};
		w.__puckExportTrigger = handleExport;
		return () => {
			delete w.__puckExportTrigger;
		};
	});

	async function ensureAssetManagerHarness(): Promise<AssetManagerTestHarness> {
		const harness = await createAssetManagerTestHarness();
		assetManagerHarnessRef.current = harness;
		return harness;
	}

	async function handleAssetManagerFileChange(
		event: ChangeEvent<HTMLInputElement>,
	) {
		const file = event.currentTarget.files?.[0];
		if (!file) {
			return;
		}

		setAssetManagerHtmlOutput("");
		setAssetManagerHtmlWarnings("none");
		setAssetManagerReactOutput("");
		setAssetManagerReactWarnings("none");

		try {
			const harness = await ensureAssetManagerHarness();
			const { getAssetRegistry, uploadAsset } = await loadAssetManager();

			if (assetManagerUploadMode === "safe") {
				harness.asset = await uploadAsset(harness.ctx, file);
				setAssetManagerStatus(
					`Uploaded ${harness.asset.id} through dataUrlUploader.`,
				);
			} else {
				const registry = getAssetRegistry(harness.ctx);
				if (!registry) {
					throw new Error("Asset registry unavailable in test harness.");
				}

				harness.asset = registry.register({
					id: "asset-rogue",
					url: assetManagerRogueUrl,
					meta: {
						size: file.size,
						...(file.type ? { mimeType: file.type } : {}),
					},
				});
				setAssetManagerStatus(
					`Seeded asset-rogue (${assetManagerRogueUrl}) to simulate a rogue uploader bypassing upload validation.`,
				);
			}
		} catch (error) {
			setAssetManagerStatus(
				error instanceof Error ? error.message : String(error),
			);
		} finally {
			event.currentTarget.value = "";
		}
	}

	async function handleAssetManagerHtmlExport() {
		const harness = assetManagerHarnessRef.current;
		if (!harness?.asset) {
			setAssetManagerStatus("Upload or seed an asset before exporting.");
			return;
		}

		const format = harness.runtime.exportFormats.get("html");
		if (!format) {
			setAssetManagerStatus("HTML export format not registered.");
			return;
		}

		const result = await format.run(
			createAssetManagerHtmlIr(harness.asset.id),
			{ title: "Asset manager test page" },
			{ assetResolvers: harness.runtime.assetResolvers },
		);

		setAssetManagerHtmlOutput(String(result.content));
		setAssetManagerHtmlWarnings(formatWarnings(result.warnings));
	}

	async function handleAssetManagerReactExport() {
		const harness = assetManagerHarnessRef.current;
		if (!harness?.asset) {
			setAssetManagerStatus("Upload or seed an asset before exporting.");
			return;
		}

		const format = harness.runtime.exportFormats.get("react");
		if (!format) {
			setAssetManagerStatus("React export format not registered.");
			return;
		}

		const result = await format.run(
			createAssetManagerReactIr(harness.asset.id),
			{ syntax: "tsx", assetStrategy: "url-prop" },
			{ assetResolvers: harness.runtime.assetResolvers },
		);

		setAssetManagerReactOutput(String(result.content));
		setAssetManagerReactWarnings(formatWarnings(result.warnings));
	}

	async function handleSaveDraft() {
		setIsSavingDraft(true);
		try {
			// F7: validate `root.props` then persist (localStorage / remote).
			// An invalid payload aborts the save — nothing is written.
			const result = await persistPage("draft", publishedData);
			if (!result.ok) {
				console.error("[demo] save blocked —", result.issue);
				return;
			}
			setLastSavedAt(new Date());
			console.log("[demo] draft saved");
		} finally {
			setIsSavingDraft(false);
		}
	}

	async function handlePublishClick(liveData: Data) {
		// Demo: the chrome panel's "Publish to live" hands us the LIVE editor
		// document. This path bypasses Puck's publish queue (and thus the
		// `onBeforePublish` plugin), so F7 validates + persists inline here;
		// an invalid payload aborts the publish.
		const typed = liveData as unknown as Data<DemoComponents, PageRootProps>;
		const result = await persistPage("publish", typed);
		if (!result.ok) {
			console.error("[demo] publish blocked —", result.issue);
			return;
		}
		handlePublish(liveData);
	}

	function handlePublish(nextPublishedData: Data) {
		// `<Studio>` narrows its callback to Puck's default `Data` type.
		// The demo knows the shape is `Data<DemoComponents, PageRootProps>`
		// because `demoConfig` is the source of truth; assert through `unknown`
		// so the editor state stays strongly typed without forking the
		// public Studio surface.
		const typedData = nextPublishedData as unknown as Data<
			DemoComponents,
			PageRootProps
		>;
		setPublishedData(typedData);
		// The Puck-drag E2E stays on the editor so the export hooks
		// (`window.__puckExportTrigger`) survive for its export assertions;
		// real publishing navigates to the render preview. The document was
		// just persisted to the durable store (handlePublishClick → persistPage),
		// so navigate by `?slug=` — the render route reads the stitched published
		// document back from SQLite. Pages with no slug fall back to the inline
		// `?data=` payload so the preview still renders.
		if (!puckDragE2eMode) {
			const slug = typedData.root.props?.slug ?? "";
			router.push(
				slug.length > 0
					? `/puck/render?slug=${encodeURIComponent(slug)}`
					: createDemoModeHref("/puck/render", typedData),
			);
		}
		console.log("[demo] publish", typedData);
	}

	function handlePreview(liveData: Data) {
		// Preview the LIVE (possibly unsaved) editor document: open the render
		// route carrying the current data inline (`?data=`), in a new tab so the
		// editing session is preserved. The render route renders it content-only.
		const typed = liveData as unknown as Data<DemoComponents, PageRootProps>;
		window.open(
			createDemoModeHref("/puck/render", typed),
			"_blank",
			"noopener,noreferrer",
		);
	}

	// Build export IR and resolve any `asset://<id>` references against the
	// demo's upload registry, so an inserted asset exports as a real URL
	// instead of an unresolved `asset://` ref. The plugin keeps its registry
	// internal, so uploads are mirrored into `getDemoAssetRegistry()`
	// (`lazy-plugins.ts`); when nothing has been uploaded the IR is returned
	// as-is.
	async function buildExportIR() {
		const ir = puckDataToIR(
			publishedData,
			editorDemoConfig as unknown as Config,
		);
		const registry = getDemoAssetRegistry();
		if (registry === undefined) return ir;
		const { createIRAssetResolver, resolveAssets } = await loadAssetManager();
		const resolver = createIRAssetResolver({
			registry,
			dataUrlAllowlistOptIn: true,
		});
		return resolveAssets(ir, resolver);
	}

	async function handleExportHtml() {
		try {
			const ir = await buildExportIR();
			const { htmlFormat } = await loadExportHtml();
			const result = await htmlFormat.run(ir, { title: "Exported Page" });
			downloadExportResult(
				result.content,
				result.filename,
				htmlFormat.mimeType,
			);
			console.log("[demo] exported html", {
				filename: result.filename,
				byteLength: result.content.length,
			});
		} catch (error) {
			console.error("[demo] export failed", error);
		}
	}

	async function handleExportReact() {
		try {
			const ir = await buildExportIR();
			const { reactFormat } = await loadExportReact();
			const result = await reactFormat.run(ir, { syntax: "tsx" });
			downloadExportResult(
				result.content,
				result.filename,
				reactFormat.mimeType,
			);
			console.log("[demo] exported react", {
				filename: result.filename,
				byteLength: result.content.length,
			});
		} catch (error) {
			console.error("[demo] export react failed", error);
		}
	}

	// Single dispatcher wired to the AnvilKit chrome's `<PublishPanel>`.
	// The panel calls `onExport(formatId)`; we look the format up in the
	// runtime and run it against IR built from the latest published data.
	// This is the cleanest interface adaptation between the panel UI and
	// the export plugins — neither side needs to know about the other.
	async function handleExport(formatId: string) {
		try {
			const ir = await buildExportIR();
			if (formatId === "html") {
				const { htmlFormat } = await loadExportHtml();
				const result = await htmlFormat.run(ir, { title: "Exported Page" });
				if (puckDragE2eMode) {
					const w = window as unknown as {
						__puckExports?: { html?: string; react?: string };
					};
					w.__puckExports = {
						...(w.__puckExports ?? {}),
						html:
							typeof result.content === "string"
								? result.content
								: new TextDecoder().decode(result.content),
					};
				} else {
					downloadExportResult(
						result.content,
						result.filename,
						htmlFormat.mimeType,
					);
				}
				return;
			}
			if (formatId === "react") {
				const { reactFormat } = await loadExportReact();
				const result = await reactFormat.run(ir, { syntax: "tsx" });
				if (puckDragE2eMode) {
					const w = window as unknown as {
						__puckExports?: { html?: string; react?: string };
					};
					w.__puckExports = {
						...(w.__puckExports ?? {}),
						react:
							typeof result.content === "string"
								? result.content
								: new TextDecoder().decode(result.content),
					};
				} else {
					downloadExportResult(
						result.content,
						result.filename,
						reactFormat.mimeType,
					);
				}
				return;
			}
			if (formatId === "json") {
				downloadExportResult(
					JSON.stringify(ir, null, 2),
					"page.json",
					"application/json",
				);
				return;
			}
			console.warn("[demo] unknown export format", formatId);
		} catch (error) {
			console.error("[demo] export failed", { formatId, error });
		}
	}

	return (
		<main className={styles.editorShell}>
			{assetManagerTestMode ? (
				<section className={styles.snapshot} data-testid="asset-manager-e2e">
					<div className={styles.snapshotHeader}>
						<h2>Asset manager export harness</h2>
						<p>
							Test-only route wiring for resolver/export end-to-end coverage.
						</p>
					</div>
					<div className="grid gap-3 mb-4">
						<div className="flex gap-3 flex-wrap">
							<button
								type="button"
								className={styles.secondaryAction}
								aria-pressed={assetManagerUploadMode === "safe"}
								onClick={() => setAssetManagerUploadMode("safe")}
							>
								Use safe uploader
							</button>
							<button
								type="button"
								className={styles.secondaryAction}
								aria-pressed={assetManagerUploadMode === "rogue"}
								onClick={() => setAssetManagerUploadMode("rogue")}
							>
								Simulate rogue uploader
							</button>
						</div>
						<label className="grid gap-2">
							<span>Upload fixture image</span>
							<input
								data-testid="asset-manager-file-input"
								type="file"
								accept="image/*"
								onChange={(event) => {
									void handleAssetManagerFileChange(event);
								}}
							/>
						</label>
						<p data-testid="asset-manager-status">{assetManagerStatus}</p>
						<div className="flex gap-3 flex-wrap">
							<button
								type="button"
								className={styles.secondaryAction}
								onClick={() => {
									void handleAssetManagerHtmlExport();
								}}
							>
								Run HTML asset export
							</button>
							<button
								type="button"
								className={styles.secondaryAction}
								onClick={() => {
									void handleAssetManagerReactExport();
								}}
							>
								Run React asset export
							</button>
						</div>
					</div>
					<h3>HTML output</h3>
					<pre
						className={styles.codeBlock}
						data-testid="asset-manager-html-output"
					>
						{assetManagerHtmlOutput}
					</pre>
					<h3>HTML warnings</h3>
					<pre
						className={styles.codeBlock}
						data-testid="asset-manager-html-warnings"
					>
						{assetManagerHtmlWarnings}
					</pre>
					<h3>React output</h3>
					<pre
						className={styles.codeBlock}
						data-testid="asset-manager-react-output"
					>
						{assetManagerReactOutput}
					</pre>
					<h3>React warnings</h3>
					<pre
						className={styles.codeBlock}
						data-testid="asset-manager-react-warnings"
					>
						{assetManagerReactWarnings}
					</pre>
				</section>
			) : null}

			<section
				className={styles.editorPanel}
				data-testid="studio-mount"
				data-collab={collabEnabled ? "1" : "0"}
				data-chrome={chromeMode}
			>
				{/*
				  The consolidated `createCollabPlugin()` from `@anvilkit/collab-ui`
				  is now in the `plugins` array (when `collabEnabled`). It
				  contributes:
				    - data sync hooks
				    - `<CollabUIProvider>` provider wrapping Studio
				    - presence overlay (canvas) + conflict toaster (notifications)
				    - identity-sync bridge (wired to `setDemoIdentityName` via the
				      `onIdentityChange` option)
				  The wrapper composition that used to live here is no longer
				  needed; we render one `<Studio>` for both collab-on and
				  collab-off paths.
				*/}
				<Studio
					// Remount on page switch so Puck re-initializes its draft
					// from the newly selected page's `data` (Puck owns its
					// internal document state after mount; a prop change alone
					// would not reset it). A *stable* `storeId` keeps the
					// persisted editor UI slice (active rail tab, viewport)
					// keyed consistently so it rehydrates across the remount
					// instead of resetting to defaults.
					key={activePageId}
					storeId="demo-editor"
					puckConfig={localizedEditorConfig as unknown as Config}
					data={publishedData}
					plugins={plugins}
					loading={<StudioLoadingScreen />}
					onPublish={handlePublish}
					onPublishClick={handlePublishClick}
					onPreview={handlePreview}
					onSaveDraft={handleSaveDraft}
					isSavingDraft={isSavingDraft}
					lastSavedAt={lastSavedAt}
					onExport={handleExport}
					analytics={analyticsAdapter}
					chrome={chromeMode}
					pages={pagesSource}
					config={demoStudioConfig}
					onLocaleChange={handleStudioLocaleChange}
				/>
			</section>

			{/*
			  Demo validation tools — the HTML/React export buttons and the
			  published-data snapshot. The clean full-screen editor omits them by
			  default; they render only under `?e2e=demo-tools`, which the
			  export-html / export-react / pages-management specs request. The
			  Studio's own chrome still exposes export via its publish panel.
			*/}
			{demoToolsMode ? (
				<section
					className={styles.snapshot}
					aria-labelledby="demo-exports-heading"
				>
					<div className={styles.snapshotHeader}>
						<h2 id="demo-exports-heading">Exports</h2>
						<p>Demo validation tools (rendered under ?e2e=demo-tools).</p>
					</div>
					<div className={styles.actions}>
						<button
							type="button"
							className={styles.secondaryAction}
							onClick={handleExportHtml}
						>
							Download HTML
						</button>
						<button
							type="button"
							className={styles.secondaryAction}
							onClick={handleExportReact}
						>
							Export React
						</button>
					</div>
					<pre
						className={styles.codeBlock}
						data-testid="ak-demo-data-snapshot"
						style={{ marginTop: "1rem" }}
					>
						{JSON.stringify(publishedData, null, 2)}
					</pre>
				</section>
			) : null}
		</main>
	);
}

/**
 * Maps a Puck node id to its bounding rect in the parent document's
 * coordinate space so `<PresenceSelectionRing>` can position itself
 * over the iframed canvas. Returns `null` when the node isn't in the
 * DOM yet (the next presence render will retry).
 *
 * Puck renders the canvas inside `iframe#preview-frame`; component
 * elements aren't reachable from the parent document directly, so we
 * pick up the iframe's `contentDocument`, run a multi-selector probe
 * (Puck has changed its wrapper attribute across versions), then add
 * the iframe's own bounding offset.
 */
function resolvePuckSelectionRect(
	nodeId: string,
): { x: number; y: number; width: number; height: number } | null {
	if (typeof window === "undefined") return null;
	const iframe = document.querySelector<HTMLIFrameElement>(
		"iframe#preview-frame",
	);
	const doc = iframe?.contentDocument;
	if (!iframe || !doc) return null;
	const escaped =
		typeof CSS !== "undefined" && typeof CSS.escape === "function"
			? CSS.escape(nodeId)
			: nodeId.replace(/"/g, '\\"');
	const probe = doc.querySelector<HTMLElement>(
		`[data-rfd-draggable-id="${escaped}"], [data-puck-component-id="${escaped}"], [data-puck-id="${escaped}"], [data-id="${escaped}"], #${escaped}`,
	);
	if (!probe) return null;
	const inner = probe.getBoundingClientRect();
	const outer = iframe.getBoundingClientRect();
	return {
		x: inner.left + outer.left,
		y: inner.top + outer.top,
		width: inner.width,
		height: inner.height,
	};
}
