/**
 * @file CORE-P1A-015 — the cross-feature undo/redo integration matrix:
 * every Phase 1A command type × undo × redo, asserting the sidecar
 * (and with it every derived surface) restores exactly — including
 * the revision, which travels with the history entry (freeze §9/§10).
 */

import type { AuthoringStateV1 } from "@anvilkit/contracts/editor";
import type { Data as PuckData } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import { deepEqualJson } from "../../../editor/index.js";
import {
	buildLegacyPuckData,
	createHistoryRecordingProbe,
} from "../../../testing/editor/index.js";
import {
	createEditorCommandPort,
	type InternalEditorCommandPort,
} from "../command-port.js";

function harness(initial: PuckData) {
	let data = initial;
	const histories: PuckData[] = [initial];
	let index = 0;
	const probe = createHistoryRecordingProbe();
	const dispatch = probe.wrap(
		(action: {
			readonly recordHistory?: boolean;
			readonly data?: PuckData;
		}) => {
			if (action.data !== undefined) {
				data = action.data;
				if (action.recordHistory === true) {
					histories.splice(index + 1);
					histories.push(data);
					index = histories.length - 1;
				}
			}
		},
	);
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
	}) as InternalEditorCommandPort;
	return {
		port,
		back: () => {
			if (index > 0) {
				index -= 1;
				data = histories[index] as PuckData;
				port.handleDataChange(data);
			}
		},
		forward: () => {
			if (index < histories.length - 1) {
				index += 1;
				data = histories[index] as PuckData;
				port.handleDataChange(data);
			}
		},
	};
}

const sidecar = (state: AuthoringStateV1 | undefined): unknown =>
	state === undefined ? undefined : JSON.parse(JSON.stringify(state));

/** Every Phase 1A command type as a payload factory (rev-agnostic). */
const MATRIX: ReadonlyArray<{
	readonly name: string;
	readonly payload: Record<string, unknown>;
}> = [
	{
		name: "node.layout.set",
		payload: {
			type: "node.layout.set",
			nodeIds: ["legacy-0"],
			breakpointId: "base",
			patch: { display: "flex" },
		},
	},
	{
		name: "node.style.set",
		payload: {
			type: "node.style.set",
			nodeIds: ["legacy-0"],
			breakpointId: "base",
			patch: { opacity: 0.25 },
		},
	},
	{
		name: "node.typography.set",
		payload: {
			type: "node.typography.set",
			nodeIds: ["legacy-1"],
			breakpointId: "base",
			patch: { textAlign: "center" },
		},
	},
	{
		name: "node.visibility.set",
		payload: {
			type: "node.visibility.set",
			nodeIds: ["legacy-1"],
			breakpointId: "base",
			hidden: true,
		},
	},
	{
		name: "node.lock.set",
		payload: { type: "node.lock.set", nodeIds: ["legacy-2"], locked: true },
	},
	{
		name: "node.rename",
		payload: { type: "node.rename", nodeId: "legacy-0", name: "Named" },
	},
	{
		name: "breakpoints.set",
		payload: {
			type: "breakpoints.set",
			breakpoints: [
				{
					id: "tablet",
					label: "Tablet",
					maxWidth: 991,
					order: 0,
					enabled: true,
				},
			],
		},
	},
	{
		name: "node.layout.set at a breakpoint layer",
		payload: {
			type: "node.layout.set",
			nodeIds: ["legacy-0"],
			breakpointId: "tablet",
			patch: { display: "grid" },
		},
	},
	{
		name: "node.responsiveOverride.set",
		payload: {
			type: "node.responsiveOverride.set",
			nodeIds: ["legacy-0"],
			breakpointId: "tablet",
			family: "layout",
		},
	},
];

describe("Phase 1A undo/redo integration matrix (CORE-P1A-015)", () => {
	it("restores the sidecar exactly across undo and redo for every command", async () => {
		const h = harness(buildLegacyPuckData());
		let seq = 0;

		for (const entry of MATRIX) {
			const before = sidecar(h.port.getSnapshot().authoring);
			const beforeRevision = h.port.getSnapshot().revision;
			seq += 1;
			const result = await h.port.execute({
				id: `matrix-${seq}`,
				expectedRevision: beforeRevision,
				source: "inspector",
				timestamp: seq,
				...entry.payload,
			} as never);
			expect(result.status, entry.name).toBe("committed");
			const after = sidecar(h.port.getSnapshot().authoring);
			expect(h.port.getSnapshot().revision, entry.name).toBe(
				beforeRevision + 1,
			);

			// Undo: full sidecar (including revision) restores.
			h.back();
			expect(
				deepEqualJson(sidecar(h.port.getSnapshot().authoring), before),
				`${entry.name} undo`,
			).toBe(true);
			expect(h.port.getSnapshot().revision).toBe(beforeRevision);

			// Redo: the committed state returns bit-for-bit.
			h.forward();
			expect(
				deepEqualJson(sidecar(h.port.getSnapshot().authoring), after),
				`${entry.name} redo`,
			).toBe(true);
			expect(h.port.getSnapshot().revision).toBe(beforeRevision + 1);
		}
	});
});
