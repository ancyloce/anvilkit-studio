import "@puckeditor/core/puck.css";
// Canvas Studio's overlay mounts `<CanvasWorkspace>` from
// `@anvilkit/canvas-editor`; its compiled (preflight-free) chrome
// stylesheet must be loaded by the host or the overlay renders blank.
import "@anvilkit/canvas-editor/styles.css";
import "@anvilkit/bento-grid/styles.css";
import "@anvilkit/blog-list/styles.css";
import "@anvilkit/helps/styles.css";
import "@anvilkit/hero/styles.css";
import "@anvilkit/logo-clouds/styles.css";
import "@anvilkit/navbar/styles.css";
import "@anvilkit/pricing-minimal/styles.css";
import "@anvilkit/section/styles.css";
import "@anvilkit/statistics/styles.css";
import "@anvilkit/core/styles.css";

import {
	type BentoGridProps,
	componentConfig as bentoGridComponentConfig,
} from "@anvilkit/bento-grid";
import {
	type BlogListProps,
	componentConfig as blogListComponentConfig,
} from "@anvilkit/blog-list";
import {
	type ButtonProps,
	componentConfig as buttonComponentConfig,
} from "@anvilkit/button";
import type { StudioPlugin } from "@anvilkit/core";
import { Studio } from "@anvilkit/core";
import {
	type HelpsProps,
	componentConfig as helpsComponentConfig,
} from "@anvilkit/helps";
import {
	type HeroProps,
	componentConfig as heroComponentConfig,
	defaultProps as heroDefaultProps,
} from "@anvilkit/hero";
import {
	type InputProps,
	componentConfig as inputComponentConfig,
} from "@anvilkit/input";
import { puckDataToIR } from "@anvilkit/ir";
import {
	type LogoCloudsProps,
	componentConfig as logoCloudsComponentConfig,
} from "@anvilkit/logo-clouds";
import {
	type NavbarProps,
	componentConfig as navbarComponentConfig,
} from "@anvilkit/navbar";
import { createAiCopilotPlugin } from "@anvilkit/plugin-ai-copilot";
import {
	createMockGeneratePage,
	createMockGenerateSection,
} from "@anvilkit/plugin-ai-copilot/mock";
import type {
	ConnectionSource,
	ConnectionStatus,
} from "@anvilkit/plugin-collab-yjs";
// Asset-manager / export-html / export-react are loaded lazily — see the
// `lazy*` wrappers + `loadExportHtml` in `../lib/canvas-studio-lazy`.
import { createDesignSystemPlugin } from "@anvilkit/plugin-design-system";
import {
	type PricingMinimalProps,
	componentConfig as pricingMinimalComponentConfig,
} from "@anvilkit/pricing-minimal";
import {
	type SectionProps,
	componentConfig as sectionComponentConfig,
} from "@anvilkit/section";
import {
	type StatisticsProps,
	componentConfig as statisticsComponentConfig,
} from "@anvilkit/statistics";
import type { Config, Data } from "@puckeditor/core";
import { useEffect, useMemo, useState } from "react";
import {
	createLazyDemoVersionHistoryPlugins,
	lazyAssetManagerNoHeaderPlugin,
	lazyCanvasStudioPlugin,
	lazyHtmlExportPlugin,
	lazyReactExportPlugin,
	loadExportHtml,
} from "../lib/canvas-studio-lazy";

type PlaygroundComponents = {
	BentoGrid: BentoGridProps;
	BlogList: BlogListProps;
	Button: ButtonProps;
	Hero: HeroProps;
	Helps: HelpsProps;
	Input: InputProps;
	LogoClouds: LogoCloudsProps;
	Navbar: NavbarProps;
	PricingMinimal: PricingMinimalProps;
	Section: SectionProps;
	Statistics: StatisticsProps;
};

const playgroundConfig: Config<PlaygroundComponents> = {
	categories: {
		navigation: { title: "Navigation", components: ["Navbar"] },
		marketing: {
			title: "Marketing",
			components: [
				"Hero",
				"PricingMinimal",
				"BentoGrid",
				"Section",
				"Statistics",
				"BlogList",
				"Helps",
				"LogoClouds",
			],
		},
		actions: { title: "Actions", components: ["Button"] },
		forms: { title: "Forms", components: ["Input"] },
	},
	components: {
		BentoGrid: bentoGridComponentConfig,
		BlogList: blogListComponentConfig,
		Button: buttonComponentConfig,
		Hero: heroComponentConfig,
		Helps: helpsComponentConfig,
		Input: inputComponentConfig,
		LogoClouds: logoCloudsComponentConfig,
		Navbar: navbarComponentConfig,
		PricingMinimal: pricingMinimalComponentConfig,
		Section: sectionComponentConfig,
		Statistics: statisticsComponentConfig,
	},
};

function createInitialData(): Data<PlaygroundComponents> {
	return {
		root: {},
		content: [
			{
				type: "Hero",
				props: { id: "hero-primary", ...heroDefaultProps },
			},
		],
	};
}

const STORAGE_KEY = "anvilkit-playground-data-v1";

// Module-scope singletons so React re-renders don't re-instantiate
// plugins (which would bust the copilot's WeakMap cache and re-run
// compilePlugins inside <Studio>). This mirrors the demo's
// `apps/demo/app/puck/editor/page.tsx` plugin set so the docs
// playground demonstrates the full @anvilkit plugin surface live.
//
// Step 3.2 — pluggable lazy loading: export-html, export-react,
// asset-manager, the version-history pair, and canvas-studio are
// deferred via `lazyPlugin` wrappers (see `../lib/canvas-studio-lazy`),
// so their package chunks stay out of the playground island's entry
// bundle until `<Studio>` compiles its plugins. AI Copilot stays eager
// (`handleGenerate` calls `aiCopilotPlugin.runGeneration` on the live
// instance) and Design System stays eager (token-bound field renderers).
const aiCopilotPlugin = createAiCopilotPlugin({
	puckConfig: playgroundConfig as unknown as Config,
	generatePage: createMockGeneratePage({ delayMs: 300 }),
	generateSection: createMockGenerateSection({ delayMs: 300 }),
	timeoutMs: 5_000,
	forwardCurrentData: true,
});
// Design System: token-bound field renderers + off-token / WCAG-AA
// contrast validators wired through the plugin lifecycle.
const designSystemPlugin = createDesignSystemPlugin();
// Version History: lazy headless plugin (header action stripped) paired
// with a lazy sidebar-panel registration; both share one deferred
// `import()` of the demo factory and its `/ui` chunk.
const { versionHistoryPlugin, historySidebarPlugin } =
	createLazyDemoVersionHistoryPlugins(playgroundConfig as unknown as Config);

// Always-on base plugin set. Canvas Studio, the export plugins, and the
// asset manager are lazy (their chunks are fetched at compile time).
// Collaboration is opt-in via `?collab=1` — mirrors the demo and keeps
// the yjs stack out of the default load.
const basePlugins: readonly StudioPlugin[] = [
	lazyHtmlExportPlugin,
	lazyReactExportPlugin,
	aiCopilotPlugin,
	lazyAssetManagerNoHeaderPlugin,
	designSystemPlugin,
	versionHistoryPlugin,
	historySidebarPlugin,
	lazyCanvasStudioPlugin,
];

// Stable local peer identity for the collaboration demo. Generated once
// at module load; the island is `client:only`, so there is no SSR pass
// to diverge from.
const playgroundPeer = {
	id: `playground-${Math.random().toString(36).slice(2, 10)}`,
	displayName: "You",
	color: "#6366f1",
};

const DEFAULT_MOCK_PROMPT = "a hero for a SaaS landing page";

// Port of the local Hocuspocus relay that the `collabRelay()` Astro
// integration starts automatically during `astro dev` / `astro preview`
// (integrations/collab-relay.mjs). MUST stay in sync with its
// `DEFAULT_RELAY_PORT`. Overridable with PUBLIC_COLLAB_WS_PORT.
const COLLAB_RELAY_PORT = import.meta.env.PUBLIC_COLLAB_WS_PORT ?? "41234";
const COLLAB_DEFAULT_ROOM = "playground-room";
// Full URL of the PRODUCTION relay (deployed apps/collab).
// Set at build time on the docs deployment; when present it takes
// priority over the local dev-relay port so the deployed static site
// gets a real multi-user backend. Empty on local/un-configured builds.
const COLLAB_WS_URL = import.meta.env.PUBLIC_COLLAB_WS_URL?.trim() ?? "";
const COLLAB_WS_TOKEN = import.meta.env.PUBLIC_COLLAB_WS_TOKEN?.trim() ?? "";

const PEER_ADJECTIVES = [
	"Curious",
	"Daring",
	"Eager",
	"Gentle",
	"Jolly",
	"Keen",
	"Lively",
	"Nimble",
	"Playful",
	"Quick",
	"Sunny",
	"Swift",
	"Witty",
	"Bright",
] as const;
const PEER_ANIMALS = [
	"Falcon",
	"Otter",
	"Panda",
	"Lynx",
	"Heron",
	"Badger",
	"Puffin",
	"Quokka",
	"Raven",
	"Seal",
	"Tapir",
	"Wombat",
	"Yak",
	"Zebra",
] as const;

function randomPeerName(): string {
	const adjective =
		PEER_ADJECTIVES[Math.floor(Math.random() * PEER_ADJECTIVES.length)];
	const animal = PEER_ANIMALS[Math.floor(Math.random() * PEER_ANIMALS.length)];
	return `${adjective} ${animal}`;
}

type CollabMode = "off" | "relay" | "memory";

function describeConnection(status: ConnectionStatus | null): string {
	if (status === null) return "Connecting…";
	switch (status.kind) {
		case "synced":
			return "Synced";
		case "connecting":
			return "Connecting…";
		case "reconnecting":
			return `Reconnecting (attempt ${status.attempt})`;
		case "offline":
			return "Offline";
		case "error":
			return `Error: ${status.message}`;
	}
}

function connectionTone(status: ConnectionStatus | null): string {
	switch (status?.kind) {
		case "synced":
			return "#22c55e";
		case "connecting":
		case "reconnecting":
		case undefined:
			return "#f59e0b";
		default:
			return "#ef4444";
	}
}

/**
 * Briefly open a raw WebSocket to decide whether the local relay is
 * reachable before committing to the Hocuspocus transport. Avoids the
 * provider's perpetual reconnect noise on the deployed static site,
 * where no relay exists and we should silently fall back to in-memory.
 */
function probeWebSocket(url: string, timeoutMs: number): Promise<boolean> {
	return new Promise((resolve) => {
		let settled = false;
		let socket: WebSocket | null = null;
		const finish = (ok: boolean) => {
			if (settled) return;
			settled = true;
			window.clearTimeout(timer);
			try {
				socket?.close();
			} catch {
				// noop
			}
			resolve(ok);
		};
		const timer = window.setTimeout(() => finish(false), timeoutMs);
		try {
			socket = new WebSocket(url);
		} catch {
			finish(false);
			return;
		}
		socket.onopen = () => finish(true);
		socket.onerror = () => finish(false);
		socket.onclose = () => finish(false);
	});
}

export default function Playground() {
	const [data, setData] = useState<Data<PlaygroundComponents>>(() =>
		createInitialData(),
	);
	const [aiEnabled, setAiEnabled] = useState(false);
	const [prompt, setPrompt] = useState(DEFAULT_MOCK_PROMPT);
	const [aiStatus, setAiStatus] = useState<"idle" | "pending">("idle");
	const [aiError, setAiError] = useState<string | null>(null);
	const [saveStatus, setSaveStatus] = useState<string>("");
	const [hydrated, setHydrated] = useState(false);
	// Collaboration plugins resolve asynchronously (in-memory Yjs
	// transport + the consolidated `createCollabPlugin()` factory), and
	// only when the page is opened with `?collab=1`. Null until then.
	const [collabPlugins, setCollabPlugins] = useState<
		readonly StudioPlugin[] | null
	>(null);
	// Which transport backs the collab session: a real Hocuspocus relay
	// (multi-tab) or the in-memory single-tab fallback. `off` until
	// `?collab=1` resolves.
	const [collabMode, setCollabMode] = useState<CollabMode>("off");
	const [collabStatus, setCollabStatus] = useState<ConnectionStatus | null>(
		null,
	);

	// Hydrate from localStorage after mount so SSR/first-paint matches
	// the deterministic `createInitialData()` shape — otherwise Astro's
	// prerender and the client mount would diverge.
	useEffect(() => {
		try {
			const raw = window.localStorage.getItem(STORAGE_KEY);
			if (raw !== null) {
				const parsed = JSON.parse(raw) as Data<PlaygroundComponents>;
				setData(parsed);
				setSaveStatus("Loaded saved draft from localStorage");
			}
		} catch {
			// Ignore corrupt payloads — fall back to initial data.
		}
		setHydrated(true);
	}, []);

	// Persist on every change once hydrated. Skipping the pre-hydrate
	// write avoids clobbering a real saved draft with the initial
	// placeholder page on first mount.
	useEffect(() => {
		if (!hydrated) return;
		try {
			window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
		} catch {
			// Quota errors are non-fatal here — the user can still edit.
		}
	}, [data, hydrated]);

	// Opt-in collaboration (`?collab=1`). Prefers the embedded Hocuspocus
	// relay that the `collabRelay()` Astro integration auto-starts during
	// `astro dev` / `astro preview` (real multi-tab backend), and falls
	// back to an in-memory single-tab transport when no relay answers —
	// e.g. the deployed static site, which can't host a WebSocket. The
	// yjs / @hocuspocus/provider stack and the collab-ui factories are
	// dynamically imported so they stay out of the default chunk.
	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		if (params.get("collab") !== "1") return;

		const room = params.get("room") || COLLAB_DEFAULT_ROOM;
		const peerOverride = params.get("peer")?.trim();
		// Distinct id per tab so two tabs of the same browser appear as
		// separate peers; distinct name so cursors are tellable apart.
		const self = {
			id: `playground-${Math.random().toString(36).slice(2, 10)}`,
			displayName:
				peerOverride && peerOverride.length > 0
					? peerOverride.slice(0, 64)
					: randomPeerName(),
			color: playgroundPeer.color,
		};

		let cancelled = false;
		let destroy: (() => void) | null = null;
		void (async () => {
			try {
				let relayUrl: string;
				let relayToken: string;
				let relayReachable: boolean;
				if (COLLAB_WS_URL) {
					// Production relay (apps/collab on Fly). Works over
					// wss on the https docs site; longer probe budget for the real
					// round-trip / a possible scale-to-zero cold start.
					relayUrl = COLLAB_WS_URL;
					relayToken = COLLAB_WS_TOKEN;
					relayReachable = await probeWebSocket(relayUrl, 4000);
				} else {
					// Local dev relay (collabRelay() Astro integration), plain ws.
					// On an https page with no prod URL it can't exist, so skip the
					// probe (it would only stall + log) and fall back to in-memory.
					relayUrl = `ws://${window.location.hostname}:${COLLAB_RELAY_PORT}`;
					relayToken = "";
					relayReachable =
						window.location.protocol === "https:"
							? false
							: await probeWebSocket(relayUrl, 1500);
				}
				if (cancelled) return;

				const {
					createCollabHocuspocusTransport,
					createInMemoryCollabTransport,
				} = await import("../lib/collab-transport");
				if (cancelled) return;

				const transport = relayReachable
					? await createCollabHocuspocusTransport({
							url: relayUrl,
							room,
							token: relayToken,
						})
					: await createInMemoryCollabTransport();
				if (cancelled) {
					transport.destroy();
					return;
				}
				destroy = transport.destroy;

				const [{ createCollabPlugin }, { createCollabStudioPlugin }] =
					await Promise.all([
						import("@anvilkit/collab-ui"),
						import("../lib/collab-studio-plugin"),
					]);
				if (cancelled) {
					transport.destroy();
					destroy = null;
					return;
				}

				// Tee the transport's status emits into the page badge while
				// still forwarding them to the plugin's sync indicator. Capture
				// the source in a local so the closure doesn't re-narrow.
				const source = transport.connectionSource;
				const connectionSource: ConnectionSource | undefined = source
					? (emit) =>
							source((next) => {
								setCollabStatus(next);
								emit(next);
							})
					: undefined;

				const collabPlugin = createCollabPlugin({
					doc: transport.doc,
					awareness: transport.awareness,
					connectionSource,
					self,
					puckConfig: playgroundConfig as unknown as Config,
					presence: { className: "!fixed z-[9999]" },
				});
				// `createCollabStudioPlugin` reads the adapter from the
				// `<CollabUIProvider>` context the consolidated factory provides,
				// so it is registered *after* it (array order preserved).
				setCollabPlugins([collabPlugin, createCollabStudioPlugin()]);
				setCollabMode(relayReachable ? "relay" : "memory");
				setCollabStatus(
					relayReachable
						? { kind: "connecting" }
						: { kind: "synced", since: new Date().toISOString() },
				);
				setSaveStatus(
					relayReachable
						? `Collaboration enabled — Hocuspocus relay (room "${room}")`
						: "Collaboration enabled (in-memory fallback — relay not reachable)",
				);
			} catch (error) {
				console.error("[playground] collab init failed", error);
			}
		})();
		return () => {
			cancelled = true;
			destroy?.();
		};
	}, []);

	// Full plugin parity with the demo's Puck editor. The AI plugin stays
	// resident so its WeakMap cache survives the UI toggle; collab plugins
	// are appended once they resolve (changing the array recompiles the
	// runtime — acceptable here since it happens right after mount).
	const plugins = useMemo(
		() => (collabPlugins ? [...basePlugins, ...collabPlugins] : basePlugins),
		[collabPlugins],
	);

	function handleChange(next: Data) {
		setData(next as unknown as Data<PlaygroundComponents>);
	}

	function handlePublish(next: Data) {
		setData(next as unknown as Data<PlaygroundComponents>);
		setSaveStatus("Published — draft saved to localStorage");
	}

	function handleResetDraft() {
		try {
			window.localStorage.removeItem(STORAGE_KEY);
		} catch {
			// Non-fatal.
		}
		setData(createInitialData());
		setSaveStatus("Reset to default draft");
	}

	async function handleExportHtml() {
		try {
			const ir = puckDataToIR(data, playgroundConfig as unknown as Config);
			const { htmlFormat } = await loadExportHtml();
			const result = await htmlFormat.run(ir, { title: "AnvilKit Playground" });
			const blobPart =
				typeof result.content === "string"
					? result.content
					: new Uint8Array(result.content);
			const blob = new Blob([blobPart], { type: htmlFormat.mimeType });
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = result.filename;
			document.body.appendChild(anchor);
			anchor.click();
			anchor.remove();
			URL.revokeObjectURL(url);
		} catch (error) {
			console.error("[playground] export failed", error);
			setAiError(error instanceof Error ? error.message : "HTML export failed");
		}
	}

	async function handleGenerate() {
		const trimmed = prompt.trim();
		if (trimmed.length === 0) {
			setAiError("Enter a prompt first.");
			return;
		}
		setAiError(null);
		setAiStatus("pending");
		try {
			await aiCopilotPlugin.runGeneration(trimmed);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setAiError(message);
		} finally {
			setAiStatus("idle");
		}
	}

	return (
		<div data-testid="playground-root" className="anvilkit-playground">
			<header className="anvilkit-playground__header">
				<div>
					<p className="anvilkit-playground__eyebrow">Interactive playground</p>
					<h1 className="anvilkit-playground__title">
						Try AnvilKit without cloning the repo
					</h1>
					<p className="anvilkit-playground__lede">
						Drag any of the 11 <code>@anvilkit/*</code> components into the
						canvas, then explore the full plugin surface live in the editor:
						HTML/React export, the mock AI copilot, the asset manager, design
						system, version history, and Canvas Studio. Add{" "}
						<code>?collab=1</code> to the URL to collaborate live — running
						locally (<code>dev</code>/<code>preview</code>) it connects to an
						auto-started WebSocket relay for real multi-tab editing; elsewhere
						it falls back to an in-memory single-tab session. Your draft is kept
						in <code>localStorage</code>.
					</p>
				</div>
				<div className="anvilkit-playground__actions">
					<button
						type="button"
						className="anvilkit-playground__button anvilkit-playground__button--primary"
						onClick={handleExportHtml}
						data-testid="playground-export-html"
					>
						Export HTML
					</button>
					<button
						type="button"
						className="anvilkit-playground__button"
						onClick={handleResetDraft}
						data-testid="playground-reset"
					>
						Reset draft
					</button>
				</div>
			</header>

			<section
				className="anvilkit-playground__panel"
				aria-labelledby="playground-ai-heading"
			>
				<label className="anvilkit-playground__toggle">
					<input
						type="checkbox"
						checked={aiEnabled}
						onChange={(event) => setAiEnabled(event.target.checked)}
						data-testid="playground-ai-toggle"
					/>
					<span>Try AI (mock)</span>
				</label>
				<h2
					id="playground-ai-heading"
					className="anvilkit-playground__panel-title"
				>
					Mock AI copilot
				</h2>
				<p className="anvilkit-playground__panel-lede">
					Uses the bundled fixture harness. Type a prompt matching a known
					fixture (e.g. &ldquo;a hero&rdquo;, &ldquo;pricing table&rdquo;,
					&ldquo;logo cloud&rdquo;) and press Generate.
				</p>
				{aiEnabled ? (
					<div className="anvilkit-playground__ai">
						<label
							htmlFor="playground-ai-prompt"
							className="anvilkit-playground__field"
						>
							<span className="anvilkit-playground__field-label">Prompt</span>
							<textarea
								id="playground-ai-prompt"
								name="playground-ai-prompt"
								value={prompt}
								onChange={(event) => setPrompt(event.target.value)}
								rows={2}
								data-testid="playground-ai-prompt"
							/>
						</label>
						<button
							type="button"
							className="anvilkit-playground__button anvilkit-playground__button--primary"
							onClick={handleGenerate}
							disabled={aiStatus === "pending"}
							data-testid="playground-ai-generate"
						>
							{aiStatus === "pending" ? "Generating…" : "Generate fixture"}
						</button>
					</div>
				) : null}
				{aiError !== null ? (
					<p
						role="alert"
						data-testid="playground-ai-error"
						className="anvilkit-playground__error"
					>
						{aiError}
					</p>
				) : null}
			</section>

			{collabMode !== "off" ? (
				<section
					data-testid="playground-collab-status"
					style={{
						display: "flex",
						alignItems: "center",
						gap: "0.5rem",
						fontSize: "0.875rem",
						margin: "0.25rem 0",
					}}
				>
					<span
						aria-hidden
						style={{
							display: "inline-block",
							width: "0.625rem",
							height: "0.625rem",
							borderRadius: "9999px",
							backgroundColor: connectionTone(collabStatus),
						}}
					/>
					<span style={{ fontWeight: 500 }}>
						{describeConnection(collabStatus)}
					</span>
					<span style={{ color: "#6b7280" }}>
						·{" "}
						{collabMode === "relay" ? "Hocuspocus relay" : "in-memory fallback"}
					</span>
				</section>
			) : null}

			<section className="anvilkit-playground__canvas">
				<Studio
					puckConfig={playgroundConfig as unknown as Config}
					data={data}
					plugins={plugins}
					onChange={handleChange}
					onPublish={handlePublish}
					// 3.4 Part 1: render a skeleton in place of the shell's
					// bare `null` while the (now lazy — 3.2) plugin chunks
					// stream in and the runtime compiles. Disappears once
					// `<Puck>` mounts, so it never interferes with the
					// playground E2E's `[data-testid="puck-editor"]` wait.
					loading={
						<div
							data-testid="playground-loading"
							aria-busy="true"
							style={{
								display: "flex",
								minHeight: 600,
								alignItems: "center",
								justifyContent: "center",
								color: "var(--muted-foreground, #666)",
								fontSize: "0.9rem",
							}}
						>
							Loading editor…
						</div>
					}
				/>
			</section>

			<p
				className="anvilkit-playground__status"
				role="status"
				data-testid="playground-status"
			>
				{saveStatus}
			</p>
		</div>
	);
}
