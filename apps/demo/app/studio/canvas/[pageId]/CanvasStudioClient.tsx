"use client";

import {
	type AiLayerContext,
	type CanvasIR,
	createCanvasIR,
	createPage,
} from "@anvilkit/canvas-core";
import { createAiJobClient } from "@anvilkit/plugin-ai-image";
import type { PostProcessUpload } from "@anvilkit/plugin-ai-image";
import { AiImagePanel } from "@anvilkit/plugin-ai-image/react";
import {
	createAssetRegistry,
	dataUrlUploader,
} from "@anvilkit/plugin-asset-manager";
import {
	type CanvasPersistenceAdapter,
	localStorageCanvasAdapter,
} from "@anvilkit/plugin-canvas-studio";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { selectAiImageProvider } from "../../../../lib/ai-image/provider-selection";

const CanvasStudio = dynamic(
	() => import("@anvilkit/canvas-editor").then((m) => m.CanvasStudio),
	{
		ssr: false,
		loading: () => (
			<div data-testid="canvas-studio-loading">Loading Canvas Studio…</div>
		),
	},
);

function makeBlankIR(pageId: string): CanvasIR {
	return createCanvasIR({
		id: pageId,
		title: pageId,
		pages: [createPage({ id: pageId, name: pageId })],
	});
}

// SSR-safe fallback. The real adapter requires `globalThis.localStorage`,
// which is only available client-side; before hydration this no-op keeps
// the constructor pure so the page can still render the loading state.
const noopAdapter: CanvasPersistenceAdapter = {
	save: () => undefined,
	load: () => null,
	list: () => [],
	delete: () => undefined,
};

export function CanvasStudioClient({ pageId }: { pageId: string }) {
	const adapter = useMemo<CanvasPersistenceAdapter>(
		() =>
			typeof globalThis.localStorage === "undefined"
				? noopAdapter
				: localStorageCanvasAdapter({ namespace: "demo-canvas" }),
		[],
	);
	const [initialIR, setInitialIR] = useState<CanvasIR | null>(null);

	// AI-image wiring (task I1-11). A per-mount asset registry holds the
	// generated images; the provider assetizes route output into it. The
	// real Replicate provider is used when NEXT_PUBLIC_AI_IMAGE_REAL=1,
	// otherwise the deterministic mock provider keeps the demo offline-safe.
	const registry = useMemo(() => createAssetRegistry(), []);
	const upload = useMemo<PostProcessUpload>(() => {
		// AI outputs routinely exceed the data-URL adapter's 1 MB default.
		const adapt = dataUrlUploader({ maxBytes: 25_000_000 });
		return async (file) => registry.register(await adapt(file));
	}, [registry]);
	const getAssetUrl = useCallback(
		(assetId: string) => registry.get(assetId)?.url,
		[registry],
	);
	const jobClient = useMemo(() => {
		const provider = selectAiImageProvider({ getAssetUrl, upload });
		return createAiJobClient({ provider });
	}, [getAssetUrl, upload]);

	// The active artboard, mirrored out of `<CanvasStudio onActivePageChange>`.
	// `<CanvasStudio>` exposes no selection callback, so `selectedNodeId` is
	// unavailable from this mount — the panel surfaces results but the optional
	// `image.replace` commit (which needs a selected node) does not fire here.
	// See plan I1-11 "Known limitation"; wiring it needs an `onSelectionChange`
	// prop on the canvas-editor submodule.
	const activePageRef = useRef<string>(pageId);
	const getLayerContext = useCallback<() => AiLayerContext | null>(
		() =>
			activePageRef.current ? { artboardId: activePageRef.current } : null,
		[],
	);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			const stored = await Promise.resolve(adapter.load(pageId));
			if (cancelled) return;
			setInitialIR(stored ?? makeBlankIR(pageId));
		})();
		return () => {
			cancelled = true;
		};
	}, [adapter, pageId]);

	if (!initialIR) {
		return (
			<main
				data-testid="canvas-studio-mount-loading"
				style={{ padding: "1.5rem" }}
			>
				Loading design…
			</main>
		);
	}

	return (
		<main
			style={{
				display: "flex",
				flexDirection: "column",
				gap: "1rem",
				padding: "1.5rem",
			}}
			data-testid="canvas-studio-mount"
		>
			<header>
				<h1 style={{ fontSize: "1.25rem", margin: 0 }}>
					Canvas Studio · page <code>{pageId}</code>
				</h1>
				<p style={{ color: "var(--demo-muted-text)", margin: "0.25rem 0 0" }}>
					Edits autosave to <code>localStorage</code> under the{" "}
					<code>demo-canvas</code> namespace.
				</p>
			</header>
			<div
				style={{
					display: "flex",
					gap: "1rem",
					alignItems: "stretch",
					minHeight: "600px",
				}}
			>
				<div style={{ flex: 1, minWidth: 0 }}>
					<CanvasStudio
						initialIR={initialIR}
						initialActivePageId={pageId}
						onChange={(ir) => {
							adapter.save(pageId, ir);
						}}
						onActivePageChange={(id) => {
							activePageRef.current = id;
						}}
					/>
				</div>
				<aside
					data-testid="ai-image-panel-host"
					style={{
						width: "340px",
						flexShrink: 0,
						overflowY: "auto",
						borderLeft: "1px solid var(--demo-border, #e2e8f0)",
						paddingLeft: "1rem",
					}}
				>
					<AiImagePanel
						jobClient={jobClient}
						getLayerContext={getLayerContext}
					/>
				</aside>
			</div>
		</main>
	);
}
