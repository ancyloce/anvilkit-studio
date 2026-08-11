"use client";

import {
	type AiLayerContext,
	type CanvasIR,
	createCanvasIR,
	createPage,
} from "@anvilkit/canvas-core";
import {
	type BrandKit,
	type CanvasAssetUploader,
	type CanvasRecoveryAdapter,
	type CanvasStudioStableValue,
	createCanvasExportPlugin,
	createIndexedDbRecoveryAdapter,
	type CanvasPersistenceAdapter as EditorPersistenceAdapter,
} from "@anvilkit/canvas-editor";
import type {
	CommitCanvasCommandFn,
	PostProcessUpload,
} from "@anvilkit/plugin-ai-image";
import { createAiJobClient } from "@anvilkit/plugin-ai-image";
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

import "@anvilkit/canvas-editor/styles.css";
import {
	AI_REPLACE_BATCH_LABEL,
	buildAiImageReplaceCommands,
} from "@/lib/ai-image/ai-image-commit";
import {
	isRealAiImageEnabled,
	selectAiImageProvider,
} from "@/lib/ai-image/provider-selection";
import { createDataUrlCanvasUploader } from "@/lib/canvas-asset-uploader";

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

// cp5-R03: stand-in pixels for the OFFLINE MOCK provider's results.
//
// `createMockAiImageProvider` returns an asset id (`mock-asset-<kind>-<n>`)
// that names no bytes anywhere — it never touches the host registry. Committing
// that id alone would point the node at an asset the document has never heard
// of, so the editor would draw its "Missing image" placeholder and fire the
// FR-170 missing-asset toast: a working round-trip that looks like a failure.
// The demo therefore materialises the mock's result as a visibly-synthetic
// 2×2 indigo swatch, exactly as it seeds `HOST_IMAGE_DATA_URL` above so a
// placed image resolves to something. NEVER used on the real provider path
// (`isRealAiImageEnabled()`), which assetizes its own output — there, an
// unresolvable result id is a genuine error and is surfaced as one.
const MOCK_AI_RESULT_DATA_URL =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR42mNITvuYnPaRAUIBAC4uBunjGwSLAAAAAElFTkSuQmCC";

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

	// The image tool's asset picker. Returns the seeded host image asset id so
	// placing an image needs no UI picker in the demo (PRD §9.2 #1/#2).
	const onPickAsset = useCallback(async () => HOST_IMAGE_ASSET_ID, []);

	// The active artboard, mirrored out of `<CanvasStudio onActivePageChange>`.
	const activePageRef = useRef<string>(pageId);
	// cp5-R03: the selected node, mirrored out of `<CanvasStudio
	// onSelectionChange>`. Both a ref and state, for two different readers: the
	// ref feeds `getLayerContext`, which is read at job time and must be current
	// without re-creating its closure; the state drives the visible commit-target
	// line below, which is how a user with nothing selected learns that a result
	// will not land on a node.
	const selectedNodeIdRef = useRef<string | null>(null);
	const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
	const onSelectionChange = useCallback((nodeId: string | null) => {
		selectedNodeIdRef.current = nodeId;
		setSelectedNodeId(nodeId);
	}, []);

	const getLayerContext = useCallback<() => AiLayerContext | null>(() => {
		const artboardId = activePageRef.current;
		if (!artboardId) return null;
		const nodeId = selectedNodeIdRef.current;
		return { artboardId, ...(nodeId ? { selectedNodeId: nodeId } : {}) };
	}, []);

	// cp5-R03: the AI result → canvas commit, i.e. the last mile.
	//
	// `useAiImage` builds the `image.replace` itself (`commitImageReplace`) when
	// a non-`text-to-image` job completes against the selected node, and hands
	// it to this injected `commit`. The host's only job is to land it on the
	// document — through the editor's OWN command pipeline, so the result is the
	// same transaction FR-093 drag-to-replace commits: `image.replace` touches
	// only `assetId` (bounds, transform and crop survive untouched), and the
	// `asset.put` that registers the produced bytes rides in the same batch, so
	// one undo reverts the whole thing.
	//
	// Throwing is deliberate: `useAiImage` catches whatever `commit` throws and
	// renders it in the panel's error line, so a commit that cannot happen is
	// visible rather than a silent no-op.
	const editorApiRef = useRef<CanvasStudioStableValue | null>(null);
	const commitAiResult = useCallback<CommitCanvasCommandFn<void>>(
		(replace) => {
			const editor = editorApiRef.current;
			if (!editor) {
				throw new Error(
					"Canvas editor is not mounted — the AI result was not committed.",
				);
			}
			const uri =
				getAssetUrl(replace.toAssetId) ??
				(isRealAiImageEnabled() ? undefined : MOCK_AI_RESULT_DATA_URL);
			const commands = buildAiImageReplaceCommands({
				ir: editor.getIR(),
				replace,
				asset: uri ? { id: replace.toAssetId, uri } : undefined,
			});
			const only = commands.length === 1 ? commands[0] : undefined;
			if (only) editor.commit(only);
			else editor.commitBatch(commands, AI_REPLACE_BATCH_LABEL);
		},
		[getAssetUrl],
	);

	// PRD 0012 §15.16: hand persistence to the editor's built-in save pipeline
	// (save pill, dirty state, debounced auto-save, beforeunload guard, unmount
	// flush) instead of saving on every onChange. The bridge keys saves by this
	// route's pageId — the same key `adapter.load` reads — never by `ir.id`.
	const persistenceAdapter = useMemo<EditorPersistenceAdapter>(
		() => ({
			save: async ({ ir }) => {
				await Promise.resolve(adapter.save(pageId, ir));
				return {};
			},
		}),
		[adapter, pageId],
	);
	// FR-164: crash recovery in IndexedDB (absent under SSR/jsdom).
	const recoveryAdapter = useMemo<CanvasRecoveryAdapter | undefined>(
		() =>
			typeof indexedDB === "undefined"
				? undefined
				: createIndexedDbRecoveryAdapter(),
		[],
	);
	// FR-091: drag-and-drop / Uploads-panel transport (shared bridge; default
	// 1 MB cap sized for this route's localStorage persistence).
	const assetUploader = useMemo<CanvasAssetUploader>(
		() => createDataUrlCanvasUploader(),
		[],
	);

	// PRD 0012 FR-151/§15.16: the editor now ships built-in SVG/PDF/PNG/JPEG/
	// WebP/JSON exporters (SVG via core's serializer, PDF via multi-page
	// raster-embed), so the host no longer injects serializers here — the
	// default plugin covers all six formats and honors page scope. Brand
	// tokens resolve against the `brandKit` passed to `<CanvasEditorSurface>`.
	const headerPlugins = useMemo(() => [createCanvasExportPlugin()], []);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			const stored = await Promise.resolve(adapter.load(pageId));
			if (cancelled) return;
			const next = stored ?? makeBlankIR(pageId);
			setInitialIR(next);
		})();
		return () => {
			cancelled = true;
		};
	}, [adapter, pageId]);

	if (!initialIR) {
		return (
			<main data-testid="canvas-studio-mount-loading" className="p-6">
				Loading design…
			</main>
		);
	}

	return (
		<main data-testid="canvas-studio-mount" className="flex flex-col gap-4 p-6">
			<header>
				<h1 className="text-[1.25rem]">
					Canvas Studio · page <code>{pageId}</code>
				</h1>
				<p className="mt-1 [color:var(--demo-muted-text)]">
					Edits autosave to <code>localStorage</code> under the{" "}
					<code>demo-canvas</code> namespace.
				</p>
			</header>
			<div className="flex gap-4 items-stretch h-[80vh]">
				<div className="flex-1 min-w-0 h-full rounded-[12px] overflow-hidden border border-[#e2e8f0]">
					<CanvasEditorSurface
						initialIR={initialIR}
						initialActivePageId={pageId}
						brandKit={DEMO_BRAND_KIT}
						onPickAsset={onPickAsset}
						headerPlugins={headerPlugins}
						persistenceAdapter={persistenceAdapter}
						{...(recoveryAdapter ? { recoveryAdapter } : {})}
						assetUploader={assetUploader}
						onActivePageChange={(id) => {
							activePageRef.current = id;
						}}
						onSelectionChange={onSelectionChange}
						editorApiRef={editorApiRef}
					/>
				</div>
				<aside
					data-testid="ai-image-panel-host"
					className="w-[340px] shrink-0 overflow-y-auto border-l border-[#e2e8f0] pl-4"
				>
					{/*
					 * cp5-R03: where an AI result will land, stated up front.
					 * Editing ops (everything but text-to-image) replace the
					 * SELECTED image node, so with nothing selected the panel
					 * still surfaces the result and commits nothing — correct,
					 * but indistinguishable from a failure unless it is said out
					 * loud. This line says it before the user presses Run.
					 */}
					<p
						data-testid="ai-commit-target"
						data-selected-node-id={selectedNodeId ?? ""}
						className="mb-2 text-[0.75rem] [color:var(--demo-muted-text)]"
					>
						{selectedNodeId
							? `Editing ops will replace the selected node (${selectedNodeId}).`
							: "No node selected — results are shown here but not applied to the canvas. Select an image node first."}
					</p>
					<AiImagePanel
						jobClient={jobClient}
						getLayerContext={getLayerContext}
						commit={commitAiResult}
					/>
				</aside>
			</div>
		</main>
	);
}
