"use client";

import type { CanvasIR } from "@anvilkit/canvas-core";
import {
	type BrandKit,
	type CanvasAssetUploader,
	type CanvasHeaderPlugin,
	type CanvasPersistenceAdapter,
	type CanvasRecoveryAdapter,
	CanvasWorkspace,
	useCanvasStudio,
} from "@anvilkit/canvas-editor";
// Private workspace catalog consumed as plain data (canvas-m0-009). This file
// is a client-only dynamic chunk, so the JSON stays out of the eager bundle.
import { canvasTemplates } from "@anvilkit/canvas-templates";
import { useSyncExternalStore } from "react";

const DEMO_TEMPLATES = Object.values(canvasTemplates);

export interface CanvasEditorSurfaceProps {
	initialIR: CanvasIR;
	initialActivePageId: string;
	brandKit: BrandKit;
	onActivePageChange: (pageId: string) => void;
	/** Required by the `image` tool — resolves the asset id to place. */
	onPickAsset: () => Promise<string>;
	/**
	 * Header plugins rendered in the workspace header. The host passes the
	 * built-in export popup here (wired with the SVG/PDF serializers from
	 * `@anvilkit/plugin-export-canvas`).
	 */
	headerPlugins: readonly CanvasHeaderPlugin[];
	/**
	 * PRD 0012 §15.16: the editor's built-in save pipeline (save pill, dirty
	 * state, debounced auto-save, beforeunload guard, unmount flush) owns
	 * persistence now — the host supplies storage, not save timing. Replaces
	 * the former host-level `onChange → adapter.save()` path.
	 */
	persistenceAdapter: CanvasPersistenceAdapter;
	/** FR-164: local crash-recovery store (absent where IndexedDB is). */
	recoveryAdapter?: CanvasRecoveryAdapter;
	/** FR-091: upload transport behind drag-and-drop and the Uploads panel. */
	assetUploader: CanvasAssetUploader;
}

/**
 * Machine-readable scene readout + imperative controls for the Playwright
 * suite (PRD §9.2). The reference editor shows none of this, so it rides along
 * visually-hidden via `<CanvasWorkspace>`'s host slot; assertions read it off
 * the DOM (`canvas-ir-debug`) without reaching into Konva.
 */
function HostSceneReadout() {
	const ctx = useCanvasStudio();
	const selectedIds = useSyncExternalStore(
		ctx.selectionStore.subscribe,
		() => ctx.selectionStore.getState().selectedIds,
		() => ctx.selectionStore.getState().selectedIds,
	);
	const activePage = ctx.ir.pages.find((p) => p.id === ctx.activePageId);
	const nodes = activePage ? activePage.root.children : [];
	const activeTool = useSyncExternalStore(
		ctx.toolStore.subscribe,
		() => ctx.toolStore.getState().activeTool,
		() => ctx.toolStore.getState().activeTool,
	);
	const selectedSet = new Set(selectedIds);

	const sceneJson = JSON.stringify({
		count: nodes.length,
		selected: selectedIds.length,
		activeTool,
		nodes: nodes.map((n) => ({
			id: n.id,
			type: n.type,
			x: n.transform.x,
			y: n.transform.y,
			text: n.type === "text" ? n.text : undefined,
		})),
	});

	const selectAll = () =>
		ctx.selectionStore.getState().setSelection(nodes.map((n) => n.id));
	const nudgeX = () => {
		const ir = ctx.getIR();
		const page = ir.pages.find((p) => p.id === ctx.activePageId);
		if (!page) return;
		for (const node of page.root.children) {
			if (!selectedSet.has(node.id)) continue;
			ctx.commit({
				type: "node.move",
				nodeId: node.id,
				from: { x: node.transform.x, y: node.transform.y },
				to: { x: node.transform.x + 100, y: node.transform.y },
			});
		}
	};
	const undo = () => {
		const next = ctx.historyStore.getState().undo(ctx.getIR());
		ctx.sceneStore?.getState().setIR(next);
	};
	const redo = () => {
		const next = ctx.historyStore.getState().redo(ctx.getIR());
		ctx.sceneStore?.getState().setIR(next);
	};

	return (
		<div data-testid="canvas-host-ui">
			<button type="button" data-testid="host-select-all" onClick={selectAll}>
				Select all
			</button>
			<button
				type="button"
				data-testid="host-nudge-x"
				onClick={nudgeX}
				disabled={selectedIds.length === 0}
			>
				Nudge +100x
			</button>
			<button type="button" data-testid="host-undo" onClick={undo}>
				Undo
			</button>
			<button type="button" data-testid="host-redo" onClick={redo}>
				Redo
			</button>
			<span data-testid="canvas-node-count">{nodes.length}</span>
			<span data-testid="canvas-selected-count">{selectedIds.length}</span>
			<pre data-testid="canvas-ir-debug">{sceneJson}</pre>
		</div>
	);
}

/**
 * The reference editor, mounted behind the route's `ssr:false` dynamic
 * boundary. Renders the Canva-style `<CanvasWorkspace>` shell — the editor's
 * single supported layout. Export now ships *inside* the editor as a header
 * plugin (the `canvas-export-*` testids resolve off the header popover); the
 * host only supplies the SVG/PDF serializers via `headerPlugins`. The hidden
 * E2E scene readout rides the host slot.
 */
export default function CanvasEditorSurface({
	initialIR,
	initialActivePageId,
	brandKit,
	onActivePageChange,
	onPickAsset,
	headerPlugins,
	persistenceAdapter,
	recoveryAdapter,
	assetUploader,
}: CanvasEditorSurfaceProps) {
	return (
		<CanvasWorkspace
			initialIR={initialIR}
			initialActivePageId={initialActivePageId}
			storeId={initialActivePageId}
			brandKit={brandKit}
			templates={DEMO_TEMPLATES}
			onPickAsset={onPickAsset}
			onActivePageChange={onActivePageChange}
			headerPlugins={headerPlugins}
			persistenceAdapter={persistenceAdapter}
			{...(recoveryAdapter ? { recoveryAdapter } : {})}
			assetUploader={assetUploader}
		>
			<div className="sr-only">
				<HostSceneReadout />
			</div>
		</CanvasWorkspace>
	);
}
