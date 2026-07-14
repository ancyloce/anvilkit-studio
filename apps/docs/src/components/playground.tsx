// Puck's own styles are injected at runtime by `<Puck>` (Puck 0.22+), so we
// no longer import `@puckeditor/core/puck.css` here — importing it would only
// trigger Puck's "styles already loaded" warning.
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
import { Studio, StudioLoadingScreen } from "@anvilkit/core";
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
import { usePlaygroundCollab } from "../lib/use-playground-collab";
import { PlaygroundAiPanel } from "./playground/playground-ai-panel";
import { PlaygroundCollabStatus } from "./playground/playground-collab-status";
import { PlaygroundHeader } from "./playground/playground-header";

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
// `apps/studio/app/puck/editor/page.tsx` plugin set so the docs
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

const DEFAULT_MOCK_PROMPT = "a hero for a SaaS landing page";

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

	// Opt-in collaboration (`?collab=1`) — see `usePlaygroundCollab` for the
	// relay-probe / transport-import / plugin-wiring flow.
	const { collabPlugins, collabMode, collabStatus } = usePlaygroundCollab(
		playgroundConfig as unknown as Config,
		setSaveStatus,
	);

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
			<PlaygroundHeader
				onExportHtml={handleExportHtml}
				onResetDraft={handleResetDraft}
			/>

			<PlaygroundAiPanel
				aiEnabled={aiEnabled}
				onAiEnabledChange={setAiEnabled}
				prompt={prompt}
				onPromptChange={setPrompt}
				aiStatus={aiStatus}
				onGenerate={handleGenerate}
				aiError={aiError}
			/>

			<PlaygroundCollabStatus
				collabMode={collabMode}
				collabStatus={collabStatus}
			/>

			<section className="anvilkit-playground__canvas">
				<Studio
					puckConfig={playgroundConfig as unknown as Config}
					data={data}
					plugins={plugins}
					onChange={handleChange}
					onPublish={handlePublish}
					// 3.4 Part 1: render the core `<StudioLoadingScreen>` skeleton
					// (skeleton rail/panel/header + spinner-and-text canvas) in
					// place of the shell's bare `null` while the (now lazy — 3.2)
					// plugin chunks stream in and the runtime compiles. Disappears
					// once `<Puck>` mounts, so it never interferes with the
					// playground E2E's `[data-testid="puck-editor"]` wait.
					loading={<StudioLoadingScreen />}
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
