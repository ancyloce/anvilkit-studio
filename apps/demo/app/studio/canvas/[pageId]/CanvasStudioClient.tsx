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
import {
	canvasToJson,
	canvasToPdf,
	canvasToPng,
	canvasToSvg,
} from "@anvilkit/plugin-export-canvas";
import type { BrandKit } from "@anvilkit/canvas-editor";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import "@anvilkit/canvas-editor/styles.css";
import { selectAiImageProvider } from "../../../../lib/ai-image/provider-selection";
import type { StageHandle } from "./CanvasEditorSurface";

// The whole editor surface (CanvasStudio + Konva + the host toolbar/panels)
// loads behind an ssr:false dynamic boundary so Konva and the canvas-editor
// barrel stay out of this route's static bundle (MVP exit: own chunk).
const CanvasEditorSurface = dynamic(() => import("./CanvasEditorSurface"), {
	ssr: false,
	loading: () => (
		<div data-testid="canvas-studio-loading">Loading Canvas Studio…</div>
	),
});

// Demo brand kit (I3-4). This standalone route renders <CanvasStudio> outside
// a <Studio> shell, so there's no StudioConfig to read here — we hand it a
// small fixed kit to exercise the editor's `useBrandKit()` surface. Hosts that
// mount the canvas inside <Studio> get this mapped from their Studio config by
// plugin-canvas-studio's CanvasModeOverlay instead.
const DEMO_BRAND_KIT: BrandKit = {
	colors: [
		{ name: "Primary", value: "#2563eb" },
		{ name: "Accent", value: "#f59e0b" },
		{ name: "Ink", value: "#0f172a" },
	],
	fonts: ["Inter", "Poppins"],
};

// The image tool resolves `onPickAsset()` to an asset id and places a node
// referencing it. Seeding a real (1×1 transparent PNG) asset under that id in
// every blank design means the placed image resolves to a renderable asset.
const HOST_IMAGE_ASSET_ID = "demo-host-image";
const HOST_IMAGE_DATA_URL =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function makeBlankIR(pageId: string): CanvasIR {
	const ir = createCanvasIR({
		id: pageId,
		title: pageId,
		pages: [createPage({ id: pageId, name: pageId })],
	});
	ir.assets[HOST_IMAGE_ASSET_ID] = {
		id: HOST_IMAGE_ASSET_ID,
		uri: HOST_IMAGE_DATA_URL,
	};
	return ir;
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

/** Trigger a browser download for an export result. */
function downloadExport(
	filename: string,
	content: string | Uint8Array,
	mimeType: string,
): void {
	const blob = new Blob([content as BlobPart], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	anchor.click();
	URL.revokeObjectURL(url);
}

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
	// The image tool's asset picker. Returns the seeded host image asset id so
	// placing an image needs no UI picker in the demo (PRD §9.2 #1/#2).
	const onPickAsset = useCallback(async () => HOST_IMAGE_ASSET_ID, []);

	const activePageRef = useRef<string>(pageId);
	const getLayerContext = useCallback<() => AiLayerContext | null>(
		() =>
			activePageRef.current ? { artboardId: activePageRef.current } : null,
		[],
	);

	// I2-3 canvas export. The live Konva stage (captured via onStageReady)
	// supplies the raster for PNG/PDF; SVG/JSON serialize the IR headlessly via
	// @anvilkit/plugin-export-canvas. The active artboard is exported.
	const stageRef = useRef<StageHandle | null>(null);
	const currentIRRef = useRef<CanvasIR | null>(null);
	const exportActive = useCallback(
		async (format: "png" | "json" | "svg" | "pdf") => {
			const ir = currentIRRef.current;
			if (!ir) return;
			const name = ir.title || pageId;
			const activePage = activePageRef.current;
			try {
				if (format === "json") {
					downloadExport(
						`${name}.json`,
						canvasToJson(ir, { pretty: true }),
						"application/json",
					);
					return;
				}
				if (format === "svg") {
					const { svg } = await canvasToSvg(ir, activePage);
					downloadExport(`${name}.svg`, svg, "image/svg+xml");
					return;
				}
				const stage = stageRef.current;
				if (!stage) return;
				const dataUrl = stage.toDataURL({
					pixelRatio: 2,
					mimeType: "image/png",
				});
				if (format === "png") {
					downloadExport(`${name}.png`, canvasToPng(dataUrl), "image/png");
					return;
				}
				const { pdf } = await canvasToPdf(ir, {
					rasters: [{ pageId: activePage, image: dataUrl }],
					pages: [activePage],
				});
				downloadExport(`${name}.pdf`, pdf, "application/pdf");
			} catch (err) {
				console.error("canvas export failed", err);
			}
		},
		[pageId],
	);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			const stored = await Promise.resolve(adapter.load(pageId));
			if (cancelled) return;
			const next = stored ?? makeBlankIR(pageId);
			currentIRRef.current = next;
			setInitialIR(next);
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
					height: "80vh",
				}}
			>
				<div
					style={{
						flex: 1,
						minWidth: 0,
						height: "100%",
						borderRadius: 12,
						overflow: "hidden",
						border: "1px solid var(--demo-border, #e2e8f0)",
					}}
				>
					<CanvasEditorSurface
						initialIR={initialIR}
						initialActivePageId={pageId}
						brandKit={DEMO_BRAND_KIT}
						onPickAsset={onPickAsset}
						onExport={(format) => {
							void exportActive(format);
						}}
						onChange={(ir) => {
							currentIRRef.current = ir;
							adapter.save(pageId, ir);
						}}
						onActivePageChange={(id) => {
							activePageRef.current = id;
						}}
						onStageReady={(stage) => {
							stageRef.current = stage;
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
