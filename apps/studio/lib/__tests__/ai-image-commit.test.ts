/**
 * cp5-R03 — the AI result → canvas commit, at the command layer.
 *
 * Drives the REAL builder `@anvilkit/plugin-ai-image` calls on a completed job
 * (`commitImageReplace`) into the host's `buildAiImageReplaceCommands`, then
 * applies the result through canvas-core's own engine. That chain is the whole
 * claim this task makes: no bespoke mutation, geometry preserved, one undo.
 */
import {
	applyCommand,
	type CanvasCommand,
	type CanvasImageNode,
	type CanvasIR,
	createCanvasIR,
	createGroup,
	createImage,
	createPage,
} from "@anvilkit/canvas-core";
import { commitImageReplace } from "@anvilkit/plugin-ai-image/commit";
import type { AiImageResultPreview } from "@anvilkit/plugin-ai-image/react";
import { describe, expect, it, vi } from "vitest";

import {
	AI_INSERT_COPY_BATCH_LABEL,
	AI_REPLACE_BATCH_LABEL,
	applyAiImageResult,
	buildAiImageApplyCommands,
	buildAiImageReplaceCommands,
} from "../ai-image/ai-image-commit";

const SOURCE_ASSET = "demo-host-image";
const RESULT_ASSET = "mock-asset-bg-remove-1";
const RESULT_URI = "data:image/png;base64,AAAA";

/** A page holding ONE image node with deliberately non-default geometry. */
function seedIR(): CanvasIR {
	const ir = createCanvasIR({
		id: "d1",
		title: "d1",
		pages: [
			createPage({
				id: "p1",
				root: createGroup({
					id: "p1-root",
					bounds: { width: 1080, height: 1080 },
					children: [
						createImage({
							id: "img1",
							assetId: SOURCE_ASSET,
							bounds: { width: 321, height: 123 },
							transform: { x: 41, y: 67, rotation: 17 },
							crop: { x: 5, y: 6, width: 70, height: 80 },
						}),
					],
				}),
			}),
		],
		now: () => "2026-01-01T00:00:00.000Z",
	});
	ir.assets[SOURCE_ASSET] = {
		id: SOURCE_ASSET,
		uri: "data:image/png;base64,B",
	};
	return ir;
}

function imageNode(ir: CanvasIR): CanvasImageNode {
	const node = ir.pages[0]?.root.children[0];
	if (node?.type !== "image") throw new Error("no image node");
	return node;
}

/** What `useAiImage` hands the injected `commit` when a job completes. */
function replaceCommandFromJob() {
	return commitImageReplace({
		commit: (cmd) => cmd,
		nodeId: "img1",
		fromAssetId: SOURCE_ASSET,
		toAssetId: RESULT_ASSET,
	});
}

function editingPreview(): AiImageResultPreview {
	return {
		request: { kind: "bg-remove", sourceAssetId: SOURCE_ASSET },
		context: {
			artboardId: "p1",
			selectedNodeId: "img1",
			selectedNodeKind: "image",
			selectedAssetId: SOURCE_ASSET,
		},
		originalAssetId: SOURCE_ASSET,
		result: {
			jobId: "job-1",
			status: "complete",
			resultAssetId: RESULT_ASSET,
			startedAt: 0,
			finishedAt: 1,
		},
	};
}

function generationPreview(): AiImageResultPreview {
	return {
		request: { kind: "text-to-image", prompt: "a product photo" },
		context: { artboardId: "p1" },
		originalAssetId: null,
		result: {
			jobId: "job-2",
			status: "complete",
			resultAssetId: RESULT_ASSET,
			startedAt: 0,
			finishedAt: 1,
			metadata: {
				width: 640,
				height: 480,
				safety: { status: "approved" },
			},
		},
	};
}

describe("buildAiImageReplaceCommands (cp5-R03)", () => {
	it("registers the produced asset and swaps it in, as one batch", () => {
		const ir = seedIR();
		const commands = buildAiImageReplaceCommands({
			ir,
			replace: replaceCommandFromJob(),
			asset: { id: RESULT_ASSET, uri: RESULT_URI },
		});

		expect(commands.map((c) => c.type)).toEqual(["asset.put", "image.replace"]);
	});

	it("preserves bounds, transform and crop — only assetId moves", () => {
		const ir = seedIR();
		const before = imageNode(ir);
		const commands = buildAiImageReplaceCommands({
			ir,
			replace: replaceCommandFromJob(),
			asset: { id: RESULT_ASSET, uri: RESULT_URI },
		});

		const { ir: next } = applyCommand(ir, {
			type: "batch",
			label: AI_REPLACE_BATCH_LABEL,
			commands,
		});
		const after = imageNode(next);

		expect(after.assetId).toBe(RESULT_ASSET);
		expect(after.bounds).toEqual(before.bounds);
		expect(after.transform).toEqual(before.transform);
		expect(after.crop).toEqual(before.crop);
		// Nothing else about the node moved either — the strongest form of the
		// claim, and the one that would catch a "helpful" resize being added.
		expect({ ...after, assetId: SOURCE_ASSET }).toEqual(before);
		// The produced bytes are now IN the document, so the node resolves.
		expect(next.assets[RESULT_ASSET]).toEqual({
			id: RESULT_ASSET,
			uri: RESULT_URI,
		});
	});

	it("is ONE undo entry: the batch's single inverse restores everything", () => {
		const ir = seedIR();
		const commands = buildAiImageReplaceCommands({
			ir,
			replace: replaceCommandFromJob(),
			asset: { id: RESULT_ASSET, uri: RESULT_URI },
		});

		const applied = applyCommand(ir, {
			type: "batch",
			label: AI_REPLACE_BATCH_LABEL,
			commands,
		});
		// One command in, one inverse out — that is what makes it one history
		// entry rather than an `asset.put` the user has to undo separately.
		expect(applied.inverse.type).toBe("batch");

		const undone = applyCommand(applied.ir, applied.inverse).ir;
		expect(imageNode(undone).assetId).toBe(SOURCE_ASSET);
		expect(imageNode(undone)).toEqual(imageNode(ir));
		// The asset entry the batch introduced is withdrawn too.
		expect(undone.assets[RESULT_ASSET]).toBeUndefined();
		expect(undone.assets[SOURCE_ASSET]).toEqual(ir.assets[SOURCE_ASSET]);
	});

	it("emits the bare image.replace when the document already has the asset", () => {
		const ir = seedIR();
		ir.assets[RESULT_ASSET] = { id: RESULT_ASSET, uri: RESULT_URI };

		const commands = buildAiImageReplaceCommands({
			ir,
			replace: replaceCommandFromJob(),
			asset: { id: RESULT_ASSET, uri: RESULT_URI },
		});
		expect(commands.map((c) => c.type)).toEqual(["image.replace"]);
	});

	it("throws rather than committing a dangling asset reference", () => {
		const ir = seedIR();
		expect(() =>
			buildAiImageReplaceCommands({
				ir,
				replace: replaceCommandFromJob(),
				asset: undefined,
			}),
		).toThrow(/has no image data/);
		// Nothing was applied, so the node still points at its original asset.
		expect(imageNode(ir).assetId).toBe(SOURCE_ASSET);
	});

	it("throws when the resolved asset is not the one the command targets", () => {
		expect(() =>
			buildAiImageReplaceCommands({
				ir: seedIR(),
				replace: replaceCommandFromJob(),
				asset: { id: "some-other-asset", uri: RESULT_URI },
			}),
		).toThrow(/mismatch/);
	});
});

describe("accepted AI result transactions (E7-T4)", () => {
	it("applies asset insertion and replacement through exactly one batch", () => {
		let current = seedIR();
		const commitBatch = vi.fn(
			(commands: readonly CanvasCommand[], label?: string) => {
				current = applyCommand(current, {
					type: "batch",
					commands: [...commands],
					...(label ? { label } : {}),
				}).ir;
				return current;
			},
		);

		applyAiImageResult({
			document: { getIR: () => current, commitBatch },
			preview: editingPreview(),
			mode: "replace",
			asset: { id: RESULT_ASSET, uri: RESULT_URI },
		});

		expect(commitBatch).toHaveBeenCalledTimes(1);
		expect(
			commitBatch.mock.calls[0]?.[0].map((command) => command.type),
		).toEqual(["asset.put", "image.replace"]);
		expect(commitBatch.mock.calls[0]?.[1]).toBe(AI_REPLACE_BATCH_LABEL);
		expect(imageNode(current).assetId).toBe(RESULT_ASSET);
	});

	it("inserts a generated copy without changing the original and one inverse undoes all of it", () => {
		const ir = seedIR();
		const commands = buildAiImageApplyCommands({
			ir,
			preview: generationPreview(),
			mode: "insert-copy",
			asset: { id: RESULT_ASSET, uri: RESULT_URI },
			createNodeId: () => "ai-copy-1",
		});
		expect(commands.map((command) => command.type)).toEqual([
			"asset.put",
			"node.create",
		]);

		const applied = applyCommand(ir, {
			type: "batch",
			label: AI_INSERT_COPY_BATCH_LABEL,
			commands,
		});
		expect(imageNode(applied.ir)).toEqual(imageNode(ir));
		const inserted = applied.ir.pages[0]?.root.children[1];
		expect(inserted).toMatchObject({
			id: "ai-copy-1",
			type: "image",
			assetId: RESULT_ASSET,
			bounds: { width: 640, height: 480 },
			transform: { x: 24, y: 24 },
		});
		expect(applied.inverse.type).toBe("batch");

		const undone = applyCommand(applied.ir, applied.inverse).ir;
		expect(undone.pages[0]?.root.children).toHaveLength(1);
		expect(imageNode(undone)).toEqual(imageNode(ir));
		expect(undone.assets[RESULT_ASSET]).toBeUndefined();
	});

	it("copies selected-image geometry with an offset and preserves the source", () => {
		const ir = seedIR();
		const commands = buildAiImageApplyCommands({
			ir,
			preview: editingPreview(),
			mode: "insert-copy",
			asset: { id: RESULT_ASSET, uri: RESULT_URI },
			createNodeId: () => "ai-copy-2",
		});
		const applied = applyCommand(ir, {
			type: "batch",
			commands,
		}).ir;
		const inserted = applied.pages[0]?.root.children[1];
		expect(inserted).toMatchObject({
			id: "ai-copy-2",
			type: "image",
			bounds: { width: 321, height: 123 },
			transform: { x: 65, y: 91, rotation: 17 },
			zIndex: 1,
		});
		expect(imageNode(applied)).toEqual(imageNode(ir));
	});

	it("fails closed when the selected original changed before acceptance", () => {
		const ir = seedIR();
		imageNode(ir).assetId = "newer-asset";
		expect(() =>
			buildAiImageApplyCommands({
				ir,
				preview: editingPreview(),
				mode: "replace",
				asset: { id: RESULT_ASSET, uri: RESULT_URI },
			}),
		).toThrow(/original image changed/);
		expect(ir.assets[RESULT_ASSET]).toBeUndefined();
	});
});
