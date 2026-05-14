"use client";

import { Studio, StudioConfigSchema, compilePlugins } from "@anvilkit/core";
import type {
	AiSectionSelection,
	ExportWarning,
	PageIR,
	StudioPluginContext,
} from "@anvilkit/core/types";
import { puckDataToIR } from "@anvilkit/ir";
import { createAiCopilotPlugin } from "@anvilkit/plugin-ai-copilot";
import {
	createMockGeneratePage,
	createMockGenerateSection,
} from "@anvilkit/plugin-ai-copilot/mock";
import {
	createAssetManagerPlugin,
	dataUrlUploader,
	getAssetRegistry,
	type UploadResult,
	uploadAsset,
} from "@anvilkit/plugin-asset-manager";
import {
	createHtmlExportPlugin,
	htmlFormat,
} from "@anvilkit/plugin-export-html";
import {
	createReactExportPlugin,
	reactFormat,
} from "@anvilkit/plugin-export-react";
import {
	AiPromptPanel,
	type AiPromptPanelIssue,
	type AiPromptPanelSelection,
} from "@anvilkit/ui";
import {
	CollabSettingsPopover,
	createCollabPlugin,
	PeerAvatarStack,
} from "@anvilkit/collab-ui";
import type { Config, Data } from "@puckeditor/core";
import { useDemoIdentity } from "../../../lib/collab-identity";
import { createCollabStudioPlugin } from "../../../lib/collab-studio-plugin";
import {
	type CollabTransportBundle,
	createCollabDemoTransport,
	createCollabRelayTransport,
} from "../../../lib/collab-transport";
import { createDemoPagesSource } from "../../../lib/demo-pages-source";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
	useEffect,
	useMemo,
	useRef,
	useState,
	type ChangeEvent,
	type ReactNode,
} from "react";
import {
	createDemoData,
	createDemoModeHref,
	demoCopySnippetPlugin,
	demoLayerQuickAddPlugin,
	type DemoComponents,
	demoConfig,
	demoDataSearchParam,
	getDemoDataFromSearchParam,
} from "../../../lib/puck-demo";
import { smokeTestPlugin } from "../../../lib/smoke-test-plugin";
import styles from "../puck.module.css";

// Hoisted to module scope so React re-renders do not re-instantiate
// the plugins (which would bust the AI copilot's WeakMap cache and
// re-run compilePlugins inside <Studio>).
//
// `headerAction: false` opts the HTML plugin out of contributing its
// own toolbar button — the AnvilKit chrome's `<PublishPanel>` is the
// single entry point for every registered export format. The React
// plugin doesn't accept an opt-out flag, but the chrome's
// `<HeaderActions>` defensively filters any action whose id starts
// with `export-`, so its toolbar button is hidden too. Both plugins
// still register their `ExportFormatDefinition` with the runtime,
// which is what the panel iterates.
const htmlExportPlugin = createHtmlExportPlugin({ headerAction: false });
const reactExportPlugin = createReactExportPlugin({
	syntax: "tsx",
	assetStrategy: "url-prop",
});
// Live asset-manager plugin: drives the sidebar's `image` module via the
// `StudioAssetSource` registered on `onInit`. Uses the data URL uploader
// so the demo works fully in-browser without a server-side persistence
// dependency. The `?e2e=asset-manager` harness keeps its own instance.
const liveAssetManagerPlugin = createAssetManagerPlugin({
	uploader: dataUrlUploader(),
	dataUrlAllowlistOptIn: true,
});
const assetManagerTestStudioConfig = StudioConfigSchema.parse({});
const aiCopilotPlugin = createAiCopilotPlugin({
	puckConfig: demoConfig as unknown as Config,
	generatePage: createMockGeneratePage({ delayMs: 300 }),
	generateSection: createMockGenerateSection({ delayMs: 300 }),
	timeoutMs: 5_000,
	forwardCurrentData: true,
});

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
		registerAssetResolver: (_resolver) => undefined,
	};
}

async function createAssetManagerTestHarness(): Promise<AssetManagerTestHarness> {
	const ctx = createHeadlessStudioContext();
	const runtime = await compilePlugins(
		[
			createAssetManagerPlugin({
				uploader: dataUrlUploader(),
				dataUrlAllowlistOptIn: true,
			}),
			createHtmlExportPlugin(),
			createReactExportPlugin({
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
	const [publishedData, setPublishedData] = useState<Data<DemoComponents>>(() =>
		createDemoData(),
	);
	// Demo-only Save Draft / Publish state for the consolidated header
	// publish panel. Real apps would persist drafts to a backend; here we
	// just stamp a timestamp and route the panel's "Publish to live"
	// action through the same `handlePublish` flow used by Puck's own
	// publish button.
	const [isSavingDraft, setIsSavingDraft] = useState(false);
	const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
	const [assetManagerTestMode, setAssetManagerTestMode] = useState(false);
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
	const [prompt, setPrompt] = useState("");
	const [aiError, setAiError] = useState<string | null>(null);
	const [aiStatus, setAiStatus] = useState<"idle" | "pending">("idle");
	const [aiIssues, setAiIssues] = useState<readonly AiPromptPanelIssue[]>([]);
	// Phase 6 / M9 demo: a manual toggle stands in for Puck-driven
	// selection until the plan-§5.4 selection bridge lands. Flipping
	// this state is what swaps the AI panel between "Generate page"
	// and "Regenerate selection".
	const [aiSelectionActive, setAiSelectionActive] = useState(false);
	const [collabEnabled, setCollabEnabled] = useState(false);
	const [collabQueryReady, setCollabQueryReady] = useState(false);
	const [collabPeerOverride, setCollabPeerOverride] = useState<string | null>(
		null,
	);
	const [collabRelayUrl, setCollabRelayUrl] = useState<string | null>(null);
	const [collabRoom, setCollabRoom] = useState("demo-room");
	const [showRemoteCursors, setShowRemoteCursors] = useState(true);
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
	// Phase G E2E hook: `?messageOverrides=<urlencoded JSON>` drives
	// `<Studio messages>` so the sidebar-modules spec can exercise the
	// PRD §10.2 alias map at runtime (legacy `studio.tab.*` keys
	// resolve through the new `studio.module.*` namespace).
	const [messageOverrides, setMessageOverrides] = useState<
		Readonly<Record<string, string>> | undefined
	>(undefined);
	// Default labels owned by the demo (not the core catalog) — covers
	// the demo-only plugin keys. Merged with query-param overrides so
	// the alias-map spec can layer on top.
	const demoMessages = useMemo<Readonly<Record<string, string>>>(
		() => ({
			"demo.layer.quickadd.hero": "Add demo Hero",
		}),
		[],
	);
	const studioMessages = useMemo<Readonly<Record<string, string>>>(
		() => ({ ...demoMessages, ...(messageOverrides ?? {}) }),
		[demoMessages, messageOverrides],
	);
	const renderHref = createDemoModeHref("/puck/render", publishedData);

	// Per-mount in-memory pages source for the layer sidebar module.
	// Stable identity (`useMemo` with no deps) so the source's internal
	// active-page state survives re-renders. The source itself owns
	// active-page tracking and re-emits via `subscribe()` on `onSelect`.
	const pagesSource = useMemo(() => createDemoPagesSource(), []);

	// Transport bundle: host owns the `Y.Doc`, `Awareness`, and (for the
	// relay path) the `WebsocketProvider`. The adapter is constructed
	// internally by `createCollabPlugin()` — see the `plugins` memo
	// below.
	const collabTransport = useMemo<CollabTransportBundle | null>(() => {
		if (!collabEnabled) return null;
		if (!demoIdentityReady) return null;
		if (collabRelayUrl) {
			return createCollabRelayTransport({
				room: collabRoom,
				relayUrl: collabRelayUrl,
			});
		}
		return createCollabDemoTransport();
	}, [collabEnabled, collabRelayUrl, collabRoom, demoIdentityReady]);

	useEffect(() => {
		if (!collabTransport) return;
		// Bundle owns its own transport teardown (WebSocket close,
		// awareness destroy, doc destroy). Fires on peer rename, relay
		// toggle, or page unmount.
		return () => collabTransport.destroy();
	}, [collabTransport]);

	// Memoized so the plugins array reference stays stable across
	// renders. Without this, each render passes a fresh array literal
	// to `<Studio>`, whose compile effect re-fires, unmounts the
	// runtime, and resets Puck's data back to the `publishedData`
	// prop — wiping any AI-generated content instantly.
	//
	// `createCollabStudioPlugin` no longer takes the adapter as an
	// argument — it reads it from `<CollabUIProvider>` context (which
	// `createCollabPlugin` provides). Same constructor on every render.
	const collabStudioPlugin = useMemo(
		() => (collabTransport ? createCollabStudioPlugin() : null),
		[collabTransport],
	);

	const plugins = useMemo(() => {
		const base = [
			smokeTestPlugin,
			htmlExportPlugin,
			reactExportPlugin,
			aiCopilotPlugin,
			liveAssetManagerPlugin,
			demoCopySnippetPlugin,
			demoLayerQuickAddPlugin,
		];
		if (collabTransport && collabStudioPlugin) {
			const collabPlugin = createCollabPlugin({
				doc: collabTransport.doc,
				awareness: collabTransport.awareness,
				connectionSource: collabTransport.connectionSource,
				self: demoIdentity,
				puckConfig: demoConfig as unknown as Config,
				onIdentityChange: (next) => {
					if (
						typeof next.displayName === "string" &&
						next.displayName.length > 0
					) {
						setDemoIdentityName(next.displayName);
					}
				},
				presence: {
					className: "!fixed z-[9999]",
					showCursors: showRemoteCursors,
					resolveSelectionRect: resolvePuckSelectionRect,
				},
				// Host supplies a richer collaborator widget via
				// `collaboratorsSlot` on `<Studio>`; suppress the plugin's
				// default `PeerAvatarStack` slot so the two don't fight.
				collaboratorsStack: { enabled: false },
			});
			return [...base, collabPlugin, collabStudioPlugin];
		}
		return base;
	}, [
		collabTransport,
		collabStudioPlugin,
		demoIdentity,
		setDemoIdentityName,
		showRemoteCursors,
	]);

	const collaboratorsSlot = useMemo(
		() =>
			collabTransport ? (
				<DemoCollaboratorsSlot
					roomId={collabRoom}
					showRemoteCursors={showRemoteCursors}
					onShowRemoteCursorsChange={setShowRemoteCursors}
				/>
			) : null,
		[collabTransport, collabRoom, showRemoteCursors],
	);

	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const incomingData = params.get(demoDataSearchParam);
		setAssetManagerTestMode(params.get("e2e") === "asset-manager");
		setPuckDragE2eMode(params.get("e2e") === "puck-drag");
		const rogueUrlParam = params.get("rogueUrl");
		if (rogueUrlParam !== null && rogueUrlParam.length > 0) {
			setAssetManagerRogueUrl(rogueUrlParam);
		}
		if (incomingData !== null) {
			setPublishedData(getDemoDataFromSearchParam(incomingData));
		}
		setCollabEnabled(params.get("collab") === "1");
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
		// `?relay=ws` switches the demo onto the y-websocket reference
		// relay (port comes from `?relayPort=` or NEXT_PUBLIC_COLLAB_RELAY_PORT,
		// defaulting to 11234). Without it the demo runs in single-tab
		// in-memory mode and only proves the SnapshotAdapter wiring.
		if (params.get("relay") === "ws") {
			const port =
				params.get("relayPort") ??
				process.env.NEXT_PUBLIC_COLLAB_RELAY_PORT ??
				"11234";
			setCollabRelayUrl(`ws://localhost:${port}`);
		} else {
			setCollabRelayUrl(null);
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
			// Stand-in for a real persistence call. The demo just stamps a
			// timestamp so the publish panel's "Saved Xm ago" line updates.
			await new Promise((resolve) => setTimeout(resolve, 300));
			setLastSavedAt(new Date());
			console.log("[demo] draft saved");
		} finally {
			setIsSavingDraft(false);
		}
	}

	function handlePublishClick() {
		// Demo: route the panel's "Publish to live" through the same
		// flow Puck's own publish button uses. Real apps typically POST
		// to a backend here.
		handlePublish(publishedData);
	}

	function handlePublish(nextPublishedData: Data) {
		// `<Studio>` narrows its callback to Puck's default `Data` type.
		// The demo knows the shape is `Data<DemoComponents>` because
		// `demoConfig` is the source of truth; assert through `unknown`
		// so the editor state stays strongly typed without forking the
		// public Studio surface.
		const typedData = nextPublishedData as unknown as Data<DemoComponents>;
		setPublishedData(typedData);
		router.push(createDemoModeHref("/puck/render", typedData));
		console.log("[demo] publish", typedData);
	}

	async function handleExportHtml() {
		try {
			const ir = puckDataToIR(publishedData, demoConfig as unknown as Config);
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
			const ir = puckDataToIR(publishedData, demoConfig as unknown as Config);
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
			const ir = puckDataToIR(publishedData, demoConfig as unknown as Config);
			if (formatId === "html") {
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

	async function handleGenerate(trimmedPrompt: string) {
		setAiError(null);
		setAiIssues([]);
		setAiStatus("pending");
		try {
			await aiCopilotPlugin.runGeneration(trimmedPrompt);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setAiError(message);
			console.error("[demo] ai generation failed", error);
		} finally {
			setAiStatus("idle");
		}
	}

	async function handleRegenerate(
		trimmedPrompt: string,
		selection: AiPromptPanelSelection,
	) {
		setAiError(null);
		setAiIssues([]);
		setAiStatus("pending");
		try {
			const irSelection: AiSectionSelection = {
				zoneId: selection.zoneId,
				nodeIds: selection.nodeIds,
			};
			await aiCopilotPlugin.regenerateSelection(trimmedPrompt, irSelection);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setAiError(message);
			console.error("[demo] ai section regeneration failed", error);
		} finally {
			setAiStatus("idle");
		}
	}

	return (
		<main className={styles.shell}>
			<section className={styles.masthead}>
				<div>
					<p className={styles.eyebrow}>Editor Validation</p>
					<h1 className={styles.title}>
						Puck editor mode for the shared navbar, hero, pricing, Bento Grid,
						section, statistics, blog list, helps, and logo cloud demo.
					</h1>
					<p className={styles.lede}>
						This route mounts {"`<Studio>`"} from `@anvilkit/core` with the same
						consumer-owned Puck `Config` used by render mode. The demo
						`smokeTestPlugin` logs every lifecycle event so you can verify the
						plugin pipeline end-to-end from the browser console.
					</p>
				</div>
				<div className={styles.actions}>
					<Link href="/" className={styles.secondaryAction}>
						Back to demo hub
					</Link>
					<Link href={renderHref} className={styles.primaryAction}>
						Open render mode
					</Link>
				</div>
			</section>

			<section
				className={styles.masthead}
				aria-labelledby="demo-copilot-heading"
			>
				<div>
					<p className={styles.eyebrow}>Plugins</p>
					<h2
						id="demo-copilot-heading"
						className={styles.title}
						style={{ fontSize: "1.4rem" }}
					>
						AI copilot + HTML export
					</h2>
					<p className={styles.lede}>
						Type a prompt that matches a mock fixture (e.g. &ldquo;a hero for a
						SaaS landing page&rdquo;) and hit Generate to see the canvas update.
						Toggle &ldquo;Simulate hero selection&rdquo; to switch the panel
						into Phase 6 / M9 section-regeneration mode and rewrite just the
						hero subtree.
					</p>
				</div>
				<div className={styles.actions}>
					<button
						type="button"
						data-testid="ai-toggle-section"
						className={styles.secondaryAction}
						aria-pressed={aiSelectionActive}
						onClick={() => setAiSelectionActive((prev) => !prev)}
					>
						{aiSelectionActive
							? "Clear hero selection"
							: "Simulate hero selection"}
					</button>
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
				<AiPromptPanel
					prompt={prompt}
					onPromptChange={setPrompt}
					selection={
						aiSelectionActive
							? {
									zoneId: "root-zone",
									nodeIds: ["hero-primary"],
									nodeLabels: ["Hero"],
								}
							: null
					}
					status={aiStatus}
					error={aiError}
					issues={aiIssues}
					onGenerate={(trimmed) => {
						void handleGenerate(trimmed);
					}}
					onRegenerate={(trimmed, selection) => {
						void handleRegenerate(trimmed, selection);
					}}
				/>
				{aiError !== null ? (
					<p role="alert" data-testid="ai-error" style={{ display: "none" }}>
						{aiError}
					</p>
				) : null}
			</section>

			{assetManagerTestMode ? (
				<section className={styles.snapshot} data-testid="asset-manager-e2e">
					<div className={styles.snapshotHeader}>
						<h2>Asset manager export harness</h2>
						<p>
							Test-only route wiring for resolver/export end-to-end coverage.
						</p>
					</div>
					<div
						style={{
							display: "grid",
							gap: "0.75rem",
							marginBottom: "1rem",
						}}
					>
						<div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
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
						<label style={{ display: "grid", gap: "0.5rem" }}>
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
						<div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
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
				className={styles.panel}
				style={{ position: "relative" }}
				data-testid="studio-mount"
				data-collab={collabEnabled ? "1" : "0"}
				data-chrome={chromeMode}
			>
				<div
					style={{
						display: "flex",
						gap: "0.5rem",
						padding: "0.5rem 0.75rem",
						borderBottom: "1px solid var(--demo-panel-border)",
						alignItems: "center",
						fontSize: "0.85rem",
					}}
				>
					<span style={{ color: "var(--demo-muted-text)" }}>Chrome:</span>
					<a
						href="?chrome=anvilkit"
						aria-current={chromeMode === "anvilkit" ? "page" : undefined}
						className={styles.secondaryAction}
						data-testid="chrome-toggle-anvilkit"
					>
						AnvilKit
					</a>
					<a
						href="?chrome=puck"
						aria-current={chromeMode === "puck" ? "page" : undefined}
						className={styles.secondaryAction}
						data-testid="chrome-toggle-puck"
					>
						Raw Puck
					</a>
				</div>
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
					puckConfig={demoConfig}
					data={publishedData}
					plugins={plugins}
					onPublish={handlePublish}
					onPublishClick={handlePublishClick}
					onSaveDraft={handleSaveDraft}
					isSavingDraft={isSavingDraft}
					lastSavedAt={lastSavedAt}
					onExport={handleExport}
					chrome={chromeMode}
					pages={pagesSource}
					messages={studioMessages}
					collaboratorsSlot={collaboratorsSlot}
				/>
			</section>

			<section className={styles.snapshot}>
				<div className={styles.snapshotHeader}>
					<h2>Published data snapshot</h2>
					<p>
						The editor keeps its own draft state; this snapshot updates when you
						publish.
					</p>
				</div>
				<pre className={styles.codeBlock}>
					{JSON.stringify(publishedData, null, 2)}
				</pre>
			</section>
		</main>
	);
}

/**
 * Replaces the placeholder `<CollaboratorStack>` in the StudioHeader
 * with real-time peer avatars + a settings popover that lets the user
 * rename themselves and copy the room URL. Reads peers from the
 * surrounding `<CollabUIProvider>` context.
 */
function DemoCollaboratorsSlot({
	roomId,
	showRemoteCursors,
	onShowRemoteCursorsChange,
}: {
	roomId: string;
	showRemoteCursors: boolean;
	onShowRemoteCursorsChange: (show: boolean) => void;
}): ReactNode {
	const roomLink =
		typeof window === "undefined" ? undefined : window.location.href;
	return (
		<div data-testid="collab-peer-stack" className="flex items-center gap-2">
			<PeerAvatarStack maxVisible={4} />
			<CollabSettingsPopover
				roomId={roomId}
				roomLink={roomLink}
				initialShowRemoteCursors={showRemoteCursors}
				onShowRemoteCursorsChange={onShowRemoteCursorsChange}
			/>
		</div>
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
