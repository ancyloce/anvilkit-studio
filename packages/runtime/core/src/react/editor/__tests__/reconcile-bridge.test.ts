/**
 * @file CORE-P1A-016 — native-mutation ↔ sidecar reconciliation:
 * tier (a) one-dispatch duplicate/delete via `commitNative` (no
 * orphaned records, exactly one history entry per intent, undo
 * restores tree + sidecar coherently, invariant 5 copies authoring)
 * and tier (b) lazy GC (plugin-mutation divergence folded into the
 * NEXT command commit, never a standalone history entry; resolvers
 * tolerate the interim).
 */

import type { AuthoringStateV1 } from "@anvilkit/contracts/editor";
import { ANVILKIT_AUTHORING_KEY } from "@anvilkit/contracts/editor";
import type { Data as PuckData } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import {
	collectLiveNodeIds,
	createEmptyAuthoringState,
	remapForDuplicate,
} from "../../../editor/index.js";
import {
	buildPuckDataWithSidecar,
	createHistoryRecordingProbe,
} from "../../../testing/editor/index.js";
import {
	createEditorCommandPort,
	type InternalEditorCommandPort,
} from "../command-port.js";
import { duplicateNode, removeNode } from "../native-tree.js";
import {
	applyPuckDataAction,
	type PuckDataAction,
} from "./puck-store-double.js";

/** A document with a zone-nested child under legacy-1. */
function nestedDoc(sidecar?: AuthoringStateV1): PuckData {
	const base = buildPuckDataWithSidecar(sidecar ?? createEmptyAuthoringState());
	return {
		...base,
		zones: {
			"legacy-1:content": [
				{ type: "Box", props: { id: "child-1", label: "Child" } },
			],
		},
	} as PuckData;
}

interface Harness {
	readonly port: InternalEditorCommandPort;
	readonly getData: () => PuckData;
	readonly back: () => void;
	readonly count: () => number;
	readonly setDataExternally: (next: PuckData) => void;
}

function harness(initial: PuckData): Harness {
	let data = initial;
	const histories: PuckData[] = [initial];
	let index = 0;
	const probe = createHistoryRecordingProbe();
	const dispatch = probe.wrap((action: PuckDataAction) => {
		const next = applyPuckDataAction(data, action);
		if (next === data) {
			return;
		}
		data = next;
		if (action.recordHistory === true) {
			histories.splice(index + 1);
			histories.push(data);
			index = histories.length - 1;
		}
	});
	const port = createEditorCommandPort({
		getPuckApi: () =>
			({
				appState: {
					get data() {
						return data;
					},
				},
				dispatch,
			}) as never,
		getData: () => data,
		editor: { features: { enabled: true } },
	});
	return {
		port,
		getData: () => data,
		back: () => {
			if (index > 0) {
				index -= 1;
				data = histories[index] as PuckData;
				port.handleDataChange(data);
			}
		},
		count: () => probe.count(),
		setDataExternally: (next) => {
			data = next;
			port.handleDataChange(next);
		},
	};
}

const sidecarOf = (data: PuckData): AuthoringStateV1 =>
	((data.root?.props ?? {}) as Record<string, unknown>)[
		ANVILKIT_AUTHORING_KEY
	] as AuthoringStateV1;

describe("tier (a) — one-dispatch duplicate (CORE-P1A-016)", () => {
	it("copies the subtree with fresh ids and carries authoring (invariant 5)", async () => {
		const h = harness(nestedDoc());
		// Author the source and its nested child first.
		await h.port.execute({
			id: "seed",
			expectedRevision: 0,
			source: "inspector",
			timestamp: 1,
			type: "batch",
			label: "seed",
			commands: [
				{
					id: "seed-a",
					expectedRevision: 0,
					source: "inspector",
					timestamp: 1,
					type: "node.rename",
					nodeId: "legacy-1",
					name: "Original",
				},
				{
					id: "seed-b",
					expectedRevision: 0,
					source: "inspector",
					timestamp: 1,
					type: "node.style.set",
					nodeIds: ["child-1"],
					breakpointId: "base",
					patch: { opacity: 0.5 },
				},
			],
		});

		const before = h.count();
		let newRootId = "";
		const status = h.port.commitNative((data, authoring) => {
			const duplicated = duplicateNode(data, "legacy-1");
			if (duplicated === null) return null;
			newRootId = duplicated.newRootId;
			return {
				data: duplicated.data,
				authoring: remapForDuplicate(authoring, duplicated.idMap).state,
			};
		});
		expect(status).toBe("committed");
		// Exactly one history-recording dispatch for the whole intent.
		expect(h.count() - before).toBe(1);

		const data = h.getData();
		const live = collectLiveNodeIds(data);
		expect(live.has(newRootId)).toBe(true);
		const sidecar = sidecarOf(data);
		// The copy carries the source's name; the nested child's style
		// came along under its remapped id.
		expect(sidecar.nodes[newRootId]?.name).toBe("Original");
		const copiedChildIds = Object.keys(sidecar.nodes).filter(
			(id) => id !== "legacy-1" && id !== "child-1" && id !== newRootId,
		);
		expect(copiedChildIds).toHaveLength(1);
		// No orphans: every record references a live node.
		for (const id of Object.keys(sidecar.nodes)) {
			expect(live.has(id), id).toBe(true);
		}
		// Revision bumped so held snapshots conflict.
		expect(sidecar.revision).toBe(2);
	});
});

describe("tier (a) — one-dispatch delete + undo coherence", () => {
	it("strips the subtree's records atomically and undo restores both", async () => {
		const h = harness(nestedDoc());
		await h.port.execute({
			id: "seed",
			expectedRevision: 0,
			source: "inspector",
			timestamp: 1,
			type: "node.rename",
			nodeId: "child-1",
			name: "Nested child",
		});

		const before = h.count();
		const status = h.port.commitNative((data, authoring) => {
			const next = removeNode(data, "legacy-1");
			return next === null ? null : { data: next, authoring };
		});
		expect(status).toBe("committed");
		expect(h.count() - before).toBe(1);

		const afterDelete = h.getData();
		expect(collectLiveNodeIds(afterDelete).has("legacy-1")).toBe(false);
		expect((afterDelete as { zones?: Record<string, unknown> }).zones).toEqual(
			{},
		);
		// The nested child's record stripped in the SAME commit.
		expect(sidecarOf(afterDelete).nodes["child-1"]).toBeUndefined();

		// Undo restores tree AND sidecar coherently (one history entry).
		h.back();
		const restored = h.getData();
		expect(collectLiveNodeIds(restored).has("legacy-1")).toBe(true);
		expect(sidecarOf(restored).nodes["child-1"]?.name).toBe("Nested child");
		expect(h.port.getSnapshot().authoring.nodes["child-1"]?.name).toBe(
			"Nested child",
		);
	});

	it("rejects while writers are gated (native Puck editing remains the path)", () => {
		const gated = createEditorCommandPort({
			getPuckApi: () => ({ appState: { data: nestedDoc() } }) as never,
			getData: () => nestedDoc(),
			editor: { features: { enabled: true } },
			getWriterGateError: () => ({
				code: "EDITOR_COLLAB_ENCODING_UNSUPPORTED",
				severity: "error",
				message: "gated",
				recoverable: true,
			}),
		});
		expect(gated.writersDisabled()).toBe(true);
		expect(gated.commitNative(() => null)).toBe("rejected");
	});
});

describe("tier (b) — lazy GC on the next commit", () => {
	it("folds external-mutation divergence into the next command commit", async () => {
		const h = harness(nestedDoc());
		await h.port.execute({
			id: "seed",
			expectedRevision: 0,
			source: "inspector",
			timestamp: 1,
			type: "node.rename",
			nodeId: "child-1",
			name: "Doomed",
		});

		// A plugin removes the node via raw setData (external mutation):
		// the record dangles — tolerated, no standalone history entry.
		const current = h.getData();
		const diverged = {
			...current,
			zones: {},
		} as PuckData;
		h.setDataExternally(diverged);
		expect(h.port.getSnapshot().authoring.nodes["child-1"]?.name).toBe(
			"Doomed",
		);
		const before = h.count();

		// The NEXT commit carries the GC in the same dispatch.
		await h.port.execute({
			id: "next",
			expectedRevision: 1,
			source: "inspector",
			timestamp: 2,
			type: "node.rename",
			nodeId: "legacy-0",
			name: "Unrelated",
		});
		expect(h.count() - before).toBe(1);
		const sidecar = sidecarOf(h.getData());
		expect(sidecar.nodes["child-1"]).toBeUndefined();
		expect(sidecar.nodes["legacy-0"]?.name).toBe("Unrelated");
	});
});
