/**
 * cp5-R03 — the AI-result → canvas commit, as a pure function.
 *
 * `@anvilkit/plugin-ai-image`'s `useAiImage` already builds the
 * `image.replace` command (`commitImageReplace`) and hands it to whatever
 * `commit` the host injected; this module is that host's half. It exists
 * separately from the route component so the command shape is unit-testable
 * without a DOM, a Konva stage, or a live editor.
 *
 * WHY A BATCH AND NOT A BARE `image.replace`.
 *
 * `image.replace` only swaps `assetId` — that is precisely why bounds,
 * transform and `crop` survive it. But the AI result's *bytes* live in the
 * host's per-mount asset registry, not in the document, so a bare replace
 * would point the node at an id `ir.assets` has never heard of and the editor
 * would render its "Missing image" placeholder. The document therefore needs
 * an `asset.put` alongside the replace, in ONE `batch` so the pair is a single
 * undo entry — the exact shape FR-093 drag-to-replace already commits
 * (`canvas-editor/src/workspace/uploads/CanvasDropZone.tsx`, "One atomic undo
 * entry: register the uploaded asset AND swap the target"). No new mutation
 * path is introduced: both commands are canvas-core built-ins.
 */
import type {
	CanvasAssetRef,
	CanvasCommand,
	CanvasImageReplaceCommand,
	CanvasIR,
} from "@anvilkit/canvas-core";
import { createImage, findNode, parentOf } from "@anvilkit/canvas-core";
import type {
	AiImageApplyMode,
	AiImageResultPreview,
} from "@anvilkit/plugin-ai-image/react";

/** Undo-history label for the AI commit, mirroring the drag-to-replace one. */
export const AI_REPLACE_BATCH_LABEL = "Replace image";
export const AI_INSERT_COPY_BATCH_LABEL = "Insert AI image";

export interface AiImageApplyDocument {
	getIR(): CanvasIR;
	commitBatch(commands: readonly CanvasCommand[], label?: string): CanvasIR;
}

export interface BuildAiImageApplyCommandsOptions {
	readonly ir: CanvasIR;
	readonly preview: AiImageResultPreview;
	readonly mode: AiImageApplyMode;
	readonly asset: CanvasAssetRef | undefined;
	/** Deterministic seam for tests; production uses the Core builder's id. */
	readonly createNodeId?: () => string;
}

export interface ApplyAiImageResultOptions
	extends Omit<BuildAiImageApplyCommandsOptions, "ir"> {
	readonly document: AiImageApplyDocument;
}

export interface BuildAiImageReplaceCommandsOptions {
	/** The document the commands will be applied to. */
	readonly ir: CanvasIR;
	/**
	 * The command `commitImageReplace` built from the completed job. Passed
	 * through untouched — the host never re-derives the swap.
	 */
	readonly replace: CanvasImageReplaceCommand;
	/**
	 * The result's bytes as the host knows them, or `undefined` when the host
	 * cannot resolve the produced asset id to a URL.
	 */
	readonly asset: CanvasAssetRef | undefined;
}

/**
 * The commands that land an AI result on an existing image node, as ONE
 * logical action. Callers hand a multi-command result to `commitBatch` so the
 * whole thing is a single undo step.
 *
 * Two shapes, by whether the document already carries the produced asset:
 *   - already in `ir.assets` (e.g. a re-run producing a deterministic id) →
 *     just the `image.replace`;
 *   - not yet in the document → `asset.put` + `image.replace`.
 *
 * Throws when the result asset is absent from BOTH the document and the host,
 * rather than committing a dangling reference. `useAiImage` catches whatever
 * the injected `commit` throws and surfaces it in the panel's error line, so
 * this failure is visible rather than silent.
 */
export function buildAiImageReplaceCommands(
	options: BuildAiImageReplaceCommandsOptions,
): CanvasCommand[] {
	const { ir, replace, asset } = options;
	if (ir.assets[replace.toAssetId]) return [replace];
	if (!asset) {
		throw new Error(
			`AI result asset "${replace.toAssetId}" has no image data — nothing was committed.`,
		);
	}
	if (asset.id !== replace.toAssetId) {
		throw new Error(
			`AI result asset id mismatch: command targets "${replace.toAssetId}" but the resolved asset is "${asset.id}".`,
		);
	}
	return [{ type: "asset.put", asset }, replace];
}

function resultAssetCommands(
	ir: CanvasIR,
	resultAssetId: string,
	asset: CanvasAssetRef | undefined,
): CanvasCommand[] {
	if (ir.assets[resultAssetId]) return [];
	if (!asset) {
		throw new Error(
			`AI result asset "${resultAssetId}" has no image data — nothing was committed.`,
		);
	}
	if (asset.id !== resultAssetId) {
		throw new Error(
			`AI result asset id mismatch: result is "${resultAssetId}" but the resolved asset is "${asset.id}".`,
		);
	}
	return [{ type: "asset.put", asset }];
}

/**
 * Build the complete document mutation for an accepted preview. Nothing in
 * this function mutates `ir`; callers can validate every prerequisite before
 * the editor opens an undo transaction.
 */
export function buildAiImageApplyCommands(
	options: BuildAiImageApplyCommandsOptions,
): CanvasCommand[] {
	const { ir, preview, mode, asset, createNodeId } = options;
	const resultAssetId = preview.result.resultAssetId;
	const put = resultAssetCommands(ir, resultAssetId, asset);

	if (mode === "replace") {
		const nodeId = preview.context.selectedNodeId;
		const originalAssetId = preview.originalAssetId;
		if (!nodeId || !originalAssetId) {
			throw new Error(
				"Replacing an AI image requires the original selected image.",
			);
		}
		const selected = findNode(ir, nodeId)?.node;
		if (selected?.type !== "image" || selected.assetId !== originalAssetId) {
			throw new Error(
				"The original image changed before the AI result was applied — nothing was committed.",
			);
		}
		return [
			...put,
			{
				type: "image.replace",
				nodeId,
				fromAssetId: originalAssetId,
				toAssetId: resultAssetId,
			},
		];
	}

	const selectedResult = preview.context.selectedNodeId
		? findNode(ir, preview.context.selectedNodeId)
		: null;
	const selectedImage =
		selectedResult?.node.type === "image" ? selectedResult.node : null;
	const page =
		selectedResult?.page ??
		ir.pages.find(({ id }) => id === preview.context.artboardId);
	if (!page) {
		throw new Error(
			"The target page no longer exists — the AI result was not inserted.",
		);
	}
	const parent = selectedImage ? parentOf(ir, selectedImage.id)?.parent : null;
	const bounds = selectedImage?.bounds ?? {
		width:
			preview.context.bounds?.width ?? preview.result.metadata?.width ?? 512,
		height:
			preview.context.bounds?.height ?? preview.result.metadata?.height ?? 512,
	};
	const transform = selectedImage
		? {
				...selectedImage.transform,
				x: selectedImage.transform.x + 24,
				y: selectedImage.transform.y + 24,
			}
		: {
				x: (preview.context.bounds?.x ?? 0) + 24,
				y: (preview.context.bounds?.y ?? 0) + 24,
			};
	const node = createImage({
		...(createNodeId ? { id: createNodeId() } : {}),
		name: "AI image result",
		assetId: resultAssetId,
		bounds,
		transform,
		zIndex: selectedImage
			? (selectedImage.zIndex ?? 0) + 1
			: Math.max(-1, ...page.root.children.map(({ zIndex }) => zIndex ?? 0)) +
				1,
		alt: `AI ${preview.request.kind} result`,
	});

	return [
		...put,
		{
			type: "node.create",
			pageId: page.id,
			parentId: parent?.id ?? page.root.id,
			node,
		},
	];
}

/** Commit every accepted-result command through exactly one undo boundary. */
export function applyAiImageResult(
	options: ApplyAiImageResultOptions,
): CanvasIR {
	const { document, ...buildOptions } = options;
	const commands = buildAiImageApplyCommands({
		...buildOptions,
		ir: document.getIR(),
	});
	return document.commitBatch(
		commands,
		options.mode === "replace"
			? AI_REPLACE_BATCH_LABEL
			: AI_INSERT_COPY_BATCH_LABEL,
	);
}
