import "@puckeditor/core/puck.css";
import "@anvilkit/bento-grid/styles.css";
import "@anvilkit/blog-list/styles.css";
import "@anvilkit/helps/styles.css";
import "@anvilkit/hero/styles.css";
import "@anvilkit/logo-clouds/styles.css";
import "@anvilkit/navbar/styles.css";
import "@anvilkit/pricing-minimal/styles.css";
import "@anvilkit/section/styles.css";
import "@anvilkit/statistics/styles.css";

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
import { createMockGeneratePage } from "@anvilkit/plugin-ai-copilot/mock";
import { createHtmlExportPlugin, htmlFormat } from "@anvilkit/plugin-export-html";
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
// compilePlugins inside <Studio>).
const htmlExportPlugin = createHtmlExportPlugin();
const aiCopilotPlugin = createAiCopilotPlugin({
	puckConfig: playgroundConfig as unknown as Config,
	generatePage: createMockGeneratePage({ delayMs: 300 }),
	timeoutMs: 5_000,
	forwardCurrentData: true,
});

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

	// Always include the AI plugin so its WeakMap cache stays stable
	// across toggles. The toggle only gates the UI that triggers
	// generation; the plugin itself is inert until `runGeneration`
	// fires.
	const plugins = useMemo(
		() => [htmlExportPlugin, aiCopilotPlugin],
		[],
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
			setAiError(
				error instanceof Error ? error.message : "HTML export failed",
			);
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
						canvas, export the result as standalone HTML, or try the mock AI
						copilot to inject a fixture page. Your draft is kept in{" "}
						<code>localStorage</code>.
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

			<section className="anvilkit-playground__canvas">
				<Studio
					puckConfig={playgroundConfig}
					data={data}
					plugins={plugins}
					onChange={handleChange}
					onPublish={handlePublish}
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
