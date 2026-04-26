"use client";

import { Studio, StudioConfigSchema, compilePlugins } from "@anvilkit/core";
import type { ExportWarning, PageIR, StudioPluginContext } from "@anvilkit/core/types";
import { puckDataToIR } from "@anvilkit/ir";
import { createAiCopilotPlugin } from "@anvilkit/plugin-ai-copilot";
import { createMockGeneratePage } from "@anvilkit/plugin-ai-copilot/mock";
import {
	createAssetManagerPlugin,
	dataUrlUploader,
	getAssetRegistry,
	type UploadResult,
	uploadAsset,
} from "@anvilkit/plugin-asset-manager";
import { createHtmlExportPlugin, htmlFormat } from "@anvilkit/plugin-export-html";
import {
	createReactExportPlugin,
	reactFormat,
} from "@anvilkit/plugin-export-react";
import type { Config, Data } from "@puckeditor/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
	createDemoData,
	createDemoModeHref,
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
const htmlExportPlugin = createHtmlExportPlugin();
const reactExportPlugin = createReactExportPlugin({
	syntax: "tsx",
	assetStrategy: "url-prop",
});
const assetManagerTestStudioConfig = StudioConfigSchema.parse({});
const aiCopilotPlugin = createAiCopilotPlugin({
	puckConfig: demoConfig as unknown as Config,
	generatePage: createMockGeneratePage({ delayMs: 300 }),
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
				urlAllowlist: ["http", "https", "blob", "data"],
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

function formatWarnings(warnings: readonly ExportWarning[] | undefined): string {
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
	const [assetManagerTestMode, setAssetManagerTestMode] = useState(false);
	const [assetManagerUploadMode, setAssetManagerUploadMode] = useState<
		"safe" | "rogue"
	>("safe");
	const [assetManagerStatus, setAssetManagerStatus] = useState("Idle.");
	const [assetManagerHtmlOutput, setAssetManagerHtmlOutput] = useState("");
	const [assetManagerHtmlWarnings, setAssetManagerHtmlWarnings] = useState("none");
	const [assetManagerReactOutput, setAssetManagerReactOutput] = useState("");
	const [assetManagerReactWarnings, setAssetManagerReactWarnings] =
		useState("none");
	const [prompt, setPrompt] = useState("");
	const [aiError, setAiError] = useState<string | null>(null);
	const [aiStatus, setAiStatus] = useState<"idle" | "pending">("idle");
	const renderHref = createDemoModeHref("/puck/render", publishedData);
	// Memoized so the plugins array reference stays stable across
	// renders. Without this, each render passes a fresh array literal
	// to `<Studio>`, whose compile effect re-fires, unmounts the
	// runtime, and resets Puck's data back to the `publishedData`
	// prop — wiping any AI-generated content instantly.
	const plugins = useMemo(
		() => [smokeTestPlugin, htmlExportPlugin, reactExportPlugin, aiCopilotPlugin],
		[],
	);

	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const incomingData = params.get(demoDataSearchParam);
		setAssetManagerTestMode(params.get("e2e") === "asset-manager");
		if (incomingData !== null) {
			setPublishedData(getDemoDataFromSearchParam(incomingData));
		}
	}, []);

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
				setAssetManagerStatus(`Uploaded ${harness.asset.id} through dataUrlUploader.`);
			} else {
				const registry = getAssetRegistry(harness.ctx);
				if (!registry) {
					throw new Error("Asset registry unavailable in test harness.");
				}

				harness.asset = registry.register({
					id: "asset-rogue",
					url: "javascript:alert(1)",
					meta: {
						size: file.size,
						...(file.type ? { mimeType: file.type } : {}),
					},
				});
				setAssetManagerStatus(
					'Seeded asset-rogue to simulate a rogue uploader bypassing upload validation.',
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
			const ir = puckDataToIR(
				publishedData,
				demoConfig as unknown as Config,
			);
			const result = await htmlFormat.run(ir, { title: "Exported Page" });
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
			const ir = puckDataToIR(
				publishedData,
				demoConfig as unknown as Config,
			);
			const result = await reactFormat.run(ir, { syntax: "tsx" });
			const blobPart =
				typeof result.content === "string"
					? result.content
					: new Uint8Array(result.content);
			const blob = new Blob([blobPart], { type: reactFormat.mimeType });
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = result.filename;
			document.body.appendChild(anchor);
			anchor.click();
			anchor.remove();
			URL.revokeObjectURL(url);
			console.log("[demo] exported react", {
				filename: result.filename,
				byteLength: result.content.length,
			});
		} catch (error) {
			console.error("[demo] export react failed", error);
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
			console.error("[demo] ai generation failed", error);
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
						This route mounts {"`<Studio>`"} from `@anvilkit/core` with the
						same consumer-owned Puck `Config` used by render mode. The demo
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

			<section className={styles.masthead} aria-labelledby="demo-copilot-heading">
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
						SaaS landing page&rdquo;) and hit Generate to see the canvas
						update. Use Download HTML to export the current canvas as a
						standalone document.
					</p>
				</div>
				<label htmlFor="ai-prompt" style={{ display: "grid", gap: "0.5rem" }}>
					<span className={styles.eyebrow}>Prompt</span>
					<textarea
						id="ai-prompt"
						name="ai-prompt"
						value={prompt}
						onChange={(event) => setPrompt(event.target.value)}
						rows={3}
						placeholder="a hero for a SaaS landing page"
						style={{
							padding: "0.75rem",
							borderRadius: "0.75rem",
							border: "1px solid var(--demo-panel-border)",
							fontFamily: "inherit",
							fontSize: "0.95rem",
							resize: "vertical",
						}}
					/>
				</label>
				<div className={styles.actions}>
					<button
						type="button"
						className={styles.primaryAction}
						onClick={handleGenerate}
						disabled={aiStatus === "pending"}
					>
						{aiStatus === "pending" ? "Generating…" : "Generate"}
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
				{aiError !== null ? (
					<p role="alert" data-testid="ai-error" style={{ color: "crimson" }}>
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

			<section className={styles.panel}>
				<Studio
					puckConfig={demoConfig}
					data={publishedData}
					plugins={plugins}
					onPublish={handlePublish}
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
