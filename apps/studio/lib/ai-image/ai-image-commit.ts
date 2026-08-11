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

/** Undo-history label for the AI commit, mirroring the drag-to-replace one. */
export const AI_REPLACE_BATCH_LABEL = "Replace image";

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
