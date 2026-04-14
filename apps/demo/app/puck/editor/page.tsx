"use client";

import { Studio } from "@anvilkit/core";
import { puckDataToIR } from "@anvilkit/ir";
import { createAiCopilotPlugin } from "@anvilkit/plugin-ai-copilot";
import { createMockGeneratePage } from "@anvilkit/plugin-ai-copilot/mock";
import { createHtmlExportPlugin, htmlFormat } from "@anvilkit/plugin-export-html";
import type { Config, Data } from "@puckeditor/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
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
const aiCopilotPlugin = createAiCopilotPlugin({
	puckConfig: demoConfig as unknown as Config,
	generatePage: createMockGeneratePage({ delayMs: 300 }),
	timeoutMs: 5_000,
	forwardCurrentData: true,
});

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
	const [publishedData, setPublishedData] = useState<Data<DemoComponents>>(() =>
		createDemoData(),
	);
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
		() => [smokeTestPlugin, htmlExportPlugin, aiCopilotPlugin],
		[],
	);

	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const incomingData = params.get(demoDataSearchParam);
		if (incomingData !== null) {
			setPublishedData(getDemoDataFromSearchParam(incomingData));
		}
	}, []);

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
				</div>
				{aiError !== null ? (
					<p role="alert" data-testid="ai-error" style={{ color: "crimson" }}>
						{aiError}
					</p>
				) : null}
			</section>

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
