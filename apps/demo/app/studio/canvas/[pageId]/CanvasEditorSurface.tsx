"use client";

import type { CanvasIR } from "@anvilkit/canvas-core";
import {
	type BrandKit,
	CanvasWorkspace,
	useCanvasStudio,
} from "@anvilkit/canvas-editor";
import { useSyncExternalStore } from "react";

/**
 * Minimal structural view of the Konva stage the host needs for raster export.
 * Konva.Stage is a structural superset, so `<CanvasStudio onStageReady>` (which
 * hands back a real `Konva.Stage`) satisfies it without a cast.
 */
export type StageHandle = {
	toDataURL: (config?: {
		pixelRatio?: number;
		mimeType?: string;
		quality?: number;
	}) => string;
};

export type ExportFormat = "png" | "json" | "svg" | "pdf";

export interface CanvasEditorSurfaceProps {
	initialIR: CanvasIR;
	initialActivePageId: string;
	brandKit: BrandKit;
	/** Mirrors `<CanvasStudio onChange>`; the host persists + tracks the IR. */
	onChange: (ir: CanvasIR) => void;
	onActivePageChange: (pageId: string) => void;
	onStageReady: (stage: StageHandle | null) => void;
	/** Required by the `image` tool — resolves the asset id to place. */
	onPickAsset: () => Promise<string>;
	/** Export the active artboard in the given format (wired to the stage bar). */
	onExport: (format: ExportFormat) => void;
}

const EXPORT_FORMATS: readonly ExportFormat[] = ["png", "json", "svg", "pdf"];

/** Stage-bar export actions (reference Share/Publish slot). */
function StageBarActions({
	onExport,
}: {
	onExport: (format: ExportFormat) => void;
}) {
	return (
		<div className="flex items-center gap-1.5" data-testid="canvas-export-bar">
			{EXPORT_FORMATS.map((format) => (
				<button
					key={format}
					type="button"
					data-testid={`canvas-export-${format}`}
					onClick={() => onExport(format)}
					className="inline-flex h-7 items-center rounded-md border border-border px-2.5 text-xs font-medium text-foreground uppercase hover:bg-muted"
				>
					{format}
				</button>
			))}
		</div>
	);
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
 * single supported layout. The host callbacks and the export bar wire through
 * it; the export bar rides the header `shareSlot` so the `canvas-export-*`
 * testids resolve, and the hidden E2E scene readout rides the host slot.
 */
export default function CanvasEditorSurface({
	initialIR,
	initialActivePageId,
	brandKit,
	onChange,
	onActivePageChange,
	onStageReady,
	onPickAsset,
	onExport,
}: CanvasEditorSurfaceProps) {
	return (
		<CanvasWorkspace
			initialIR={initialIR}
			initialActivePageId={initialActivePageId}
			storeId={initialActivePageId}
			brandKit={brandKit}
			onPickAsset={onPickAsset}
			onChange={(ir) => onChange(ir)}
			onActivePageChange={onActivePageChange}
			onStageReady={(stage) => onStageReady(stage)}
			shareSlot={<StageBarActions onExport={onExport} />}
		>
			<div className="sr-only">
				<HostSceneReadout />
			</div>
		</CanvasWorkspace>
	);
}
