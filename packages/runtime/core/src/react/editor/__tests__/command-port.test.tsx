/**
 * @file CORE-P1A-001 — `createEditorCommandPort` over a stateful fake
 * Puck store (§27.3 command matrix for the Phase 1A subset).
 *
 * The fake store implements the exact contract the port relies on:
 * `dispatch({ type: "setData", recordHistory })` with a Puck-style
 * history stack (record-flagged snapshots only), `history.back/
 * forward` restoring recorded snapshots, and fresh `appState.data`
 * per `getPuck()` call. Every intent is asserted through the shared
 * `createHistoryRecordingProbe` (single-intent history rule, §10.5).
 * Assertions use "≤1 recording dispatch per isolated intent", not
 * exact global counts, per the debounce-window tolerance rule.
 */

import type {
	AtomicEditorCommand,
	AuthoringStateV1,
	EditorCommand,
	EditorError,
} from "@anvilkit/contracts/editor";
import { ANVILKIT_AUTHORING_KEY } from "@anvilkit/contracts/editor";
import type { PuckApi, Data as PuckData } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import { createEmptyAuthoringState } from "../../../editor/index.js";
import {
	buildLegacyPuckData,
	buildPuckDataWithSidecar,
	buildUnknownVersionSidecar,
	createHistoryRecordingProbe,
} from "../../../testing/editor/index.js";
import {
	createEditorCommandPort,
	type EditorCommandPortDeps,
	type InternalEditorCommandPort,
} from "../command-port.js";

interface FakePuck {
	readonly getPuckApi: () => PuckApi;
	readonly getData: () => PuckData;
	readonly back: () => PuckData;
	readonly forward: () => PuckData;
	readonly recordingCount: () => number;
	readonly resetProbe: () => void;
}

function createFakePuck(initialData: PuckData): FakePuck {
	let data = initialData;
	const histories: PuckData[] = [initialData];
	let index = 0;
	const probe = createHistoryRecordingProbe();
	const dispatch = probe.wrap(
		(action: {
			readonly type: string;
			readonly recordHistory?: boolean;
			readonly data?: PuckData;
		}) => {
			if (action.type !== "setData" || action.data === undefined) {
				throw new Error(`fake puck got unexpected action "${action.type}"`);
			}
			data = action.data;
			if (action.recordHistory === true) {
				histories.splice(index + 1);
				histories.push(data);
				index = histories.length - 1;
			}
		},
	);
	return {
		getPuckApi: () =>
			({
				appState: { data },
				dispatch,
			}) as unknown as PuckApi,
		getData: () => data,
		back: () => {
			if (index > 0) {
				index -= 1;
				data = histories[index] as PuckData;
			}
			return data;
		},
		forward: () => {
			if (index < histories.length - 1) {
				index += 1;
				data = histories[index] as PuckData;
			}
			return data;
		},
		recordingCount: () => probe.count(),
		resetProbe: () => probe.reset(),
	};
}

function createPort(
	initialData: PuckData,
	overrides?: Partial<EditorCommandPortDeps>,
): { port: InternalEditorCommandPort; puck: FakePuck } {
	const puck = createFakePuck(initialData);
	const port = createEditorCommandPort({
		getPuckApi: puck.getPuckApi,
		getData: puck.getData,
		editor: { features: { enabled: true } },
		...overrides,
	});
	return { port, puck };
}

let commandSeq = 0;
function command<T extends { readonly type: AtomicEditorCommand["type"] }>(
	expectedRevision: number,
	payload: T,
): EditorCommand {
	commandSeq += 1;
	return {
		id: `cmd-${commandSeq}`,
		expectedRevision,
		source: "inspector",
		timestamp: 1_700_000_000_000 + commandSeq,
		...payload,
	} as unknown as EditorCommand;
}

/** A valid v1 sidecar carrying one enabled tablet breakpoint. */
function sidecarWithBreakpoint(): AuthoringStateV1 {
	return {
		...createEmptyAuthoringState(),
		breakpoints: [
			{
				id: "bp-tablet",
				label: "Tablet",
				maxWidth: 991,
				order: 0,
				enabled: true,
			},
		],
	};
}

function readSidecar(data: PuckData): AuthoringStateV1 | undefined {
	return (data.root?.props as Record<string, unknown> | undefined)?.[
		ANVILKIT_AUTHORING_KEY
	] as AuthoringStateV1 | undefined;
}

function codes(errors: readonly EditorError[]): readonly string[] {
	return errors.map((error) => error.code);
}

describe("createEditorCommandPort — commit path (§10.2–§10.5)", () => {
	it("commits a rename through exactly one history-recording setData", async () => {
		const { port, puck } = createPort(buildLegacyPuckData());
		const result = await port.execute(
			command(0, { type: "node.rename", nodeId: "legacy-0", name: "Hero" }),
		);

		expect(result.status).toBe("committed");
		expect(result.revision).toBe(1);
		expect(result.changedNodeIds).toEqual(["legacy-0"]);
		expect(puck.recordingCount()).toBe(1);

		const sidecar = readSidecar(puck.getData());
		expect(sidecar?.revision).toBe(1);
		expect(sidecar?.nodes["legacy-0"]?.name).toBe("Hero");
	});

	it("runs the full Phase 1A command matrix, one recording dispatch per intent (§27.3)", async () => {
		const { port, puck } = createPort(
			buildPuckDataWithSidecar(sidecarWithBreakpoint()),
		);

		const matrix: ReadonlyArray<Record<string, unknown>> = [
			{
				type: "node.layout.set",
				nodeIds: ["legacy-0"],
				breakpointId: "base",
				patch: {
					display: "flex",
					gap: { kind: "unit", value: 16, unit: "px" },
				},
			},
			{
				type: "node.layout.set",
				nodeIds: ["legacy-0"],
				breakpointId: "bp-tablet",
				patch: { display: "block" },
			},
			{
				type: "node.style.set",
				nodeIds: ["legacy-0", "legacy-1"],
				breakpointId: "base",
				patch: { opacity: 0.5 },
			},
			{
				type: "node.typography.set",
				nodeIds: ["legacy-1"],
				breakpointId: "base",
				patch: { fontWeight: { kind: "literal", value: 700 } },
			},
			{
				type: "node.visibility.set",
				nodeIds: ["legacy-1"],
				breakpointId: "bp-tablet",
				hidden: true,
			},
			{ type: "node.lock.set", nodeIds: ["legacy-2"], locked: true },
			{ type: "node.lock.set", nodeIds: ["legacy-2"], locked: false },
			{ type: "node.rename", nodeId: "legacy-2", name: "Footer" },
			{
				type: "node.responsiveOverride.set",
				nodeIds: ["legacy-0"],
				breakpointId: "bp-tablet",
				family: "layout",
			},
		];

		let revision = 0;
		for (const payload of matrix) {
			puck.resetProbe();
			const result = await port.execute(
				command(revision, payload as { type: AtomicEditorCommand["type"] }),
			);
			expect(result.status, JSON.stringify(payload)).toBe("committed");
			revision += 1;
			expect(result.revision).toBe(revision);
			// Single-intent history rule: ≤1 recording dispatch per intent.
			expect(puck.recordingCount()).toBeLessThanOrEqual(1);
		}

		const state = port.getSnapshot().authoring;
		expect(state.revision).toBe(matrix.length);
		// The bp-tablet layout override was removed again by the
		// responsiveOverride.set (family removal resumes inheritance).
		expect(state.nodes["legacy-0"]?.layout?.overrides).toBeUndefined();
		expect(state.nodes["legacy-0"]?.layout?.base).toMatchObject({
			display: "flex",
		});
		expect(state.nodes["legacy-1"]?.hidden?.overrides?.["bp-tablet"]).toBe(true);
		// lock → unlock collapsed back to no record for node-3 name only.
		expect(state.nodes["legacy-2"]?.locked).toBeUndefined();
		expect(state.nodes["legacy-2"]?.name).toBe("Footer");
	});

	it("commits a batch atomically as one dispatch and one revision bump (freeze §5)", async () => {
		const { port, puck } = createPort(buildLegacyPuckData());
		puck.resetProbe();
		const result = await port.execute(
			command(0, {
				type: "batch",
				label: "style two nodes",
				commands: [
					command(999, {
						type: "node.rename",
						nodeId: "legacy-0",
						name: "A",
					}) as AtomicEditorCommand,
					command(999, {
						type: "node.rename",
						nodeId: "legacy-1",
						name: "B",
					}) as AtomicEditorCommand,
				],
			} as unknown as { type: AtomicEditorCommand["type"] }),
		);
		expect(result.status).toBe("committed");
		// Member expectedRevision fields (999) are deliberately ignored.
		expect(result.revision).toBe(1);
		expect(puck.recordingCount()).toBe(1);
		const state = port.getSnapshot().authoring;
		expect(state.nodes["legacy-0"]?.name).toBe("A");
		expect(state.nodes["legacy-1"]?.name).toBe("B");
	});

	it("rejects a stale expectedRevision with EDITOR_COMMAND_CONFLICT and no dispatch", async () => {
		const { port, puck } = createPort(buildLegacyPuckData());
		await port.execute(
			command(0, { type: "node.rename", nodeId: "legacy-0", name: "A" }),
		);
		puck.resetProbe();
		const result = await port.execute(
			command(0, { type: "node.rename", nodeId: "legacy-0", name: "B" }),
		);
		expect(result.status).toBe("rejected");
		expect(codes(result.errors)).toContain("EDITOR_COMMAND_CONFLICT");
		expect(puck.recordingCount()).toBe(0);
		expect(port.getSnapshot().authoring.nodes["legacy-0"]?.name).toBe("A");
	});

	it("returns noop (no dispatch, no revision bump) for a value-identical write", async () => {
		const { port, puck } = createPort(buildLegacyPuckData());
		await port.execute(
			command(0, { type: "node.rename", nodeId: "legacy-0", name: "Hero" }),
		);
		puck.resetProbe();
		const result = await port.execute(
			command(1, { type: "node.rename", nodeId: "legacy-0", name: "Hero" }),
		);
		expect(result.status).toBe("noop");
		expect(result.revision).toBe(1);
		expect(puck.recordingCount()).toBe(0);
	});

	it("rejects writes on an unsupported-version sidecar (read-only safe mode)", async () => {
		const { port, puck } = createPort(
			buildPuckDataWithSidecar(buildUnknownVersionSidecar()),
		);
		puck.resetProbe();
		const result = await port.execute(
			command(0, { type: "node.rename", nodeId: "legacy-0", name: "A" }),
		);
		expect(result.status).toBe("rejected");
		expect(codes(result.errors)).toContain(
			"EDITOR_CONTRACT_UNSUPPORTED_VERSION",
		);
		expect(puck.recordingCount()).toBe(0);
		expect(port.isReadOnly()).toBe(true);
		// Invariant 9: the raw sidecar is never overwritten.
		expect(
			(readSidecar(puck.getData()) as unknown as Record<string, unknown>)
				.version,
		).toBe("2");
	});

	it("rejects writes while the writer gate is closed (collab gate seam)", async () => {
		const gateError: EditorError = {
			code: "EDITOR_COLLAB_ENCODING_UNSUPPORTED",
			message: "a registered collab transport does not support authoring",
			severity: "error",
			recoverable: true,
		};
		const { port, puck } = createPort(buildLegacyPuckData(), {
			getWriterGateError: () => gateError,
		});
		puck.resetProbe();
		const result = await port.execute(
			command(0, { type: "node.rename", nodeId: "legacy-0", name: "A" }),
		);
		expect(result.status).toBe("rejected");
		expect(codes(result.errors)).toEqual([
			"EDITOR_COLLAB_ENCODING_UNSUPPORTED",
		]);
		expect(puck.recordingCount()).toBe(0);
	});
});

describe("createEditorCommandPort — undo/redo and the parsed-state cache", () => {
	it("undo/redo restores both data and snapshot (revision travels with history)", async () => {
		const { port, puck } = createPort(buildLegacyPuckData());
		await port.execute(
			command(0, { type: "node.rename", nodeId: "legacy-0", name: "First" }),
		);
		await port.execute(
			command(1, { type: "node.rename", nodeId: "legacy-0", name: "Second" }),
		);
		expect(port.getSnapshot().revision).toBe(2);

		// Undo: the controller feeds the restored data back into the port.
		port.handleDataChange(puck.back());
		let snapshot = port.getSnapshot();
		expect(snapshot.revision).toBe(1);
		expect(snapshot.authoring.nodes["legacy-0"]?.name).toBe("First");

		// Undo to the initial (sidecar-less) document.
		port.handleDataChange(puck.back());
		snapshot = port.getSnapshot();
		expect(snapshot.revision).toBe(0);
		expect(snapshot.authoring.nodes["legacy-0"]).toBeUndefined();

		// Redo restores the first commit.
		port.handleDataChange(puck.forward());
		snapshot = port.getSnapshot();
		expect(snapshot.revision).toBe(1);
		expect(snapshot.authoring.nodes["legacy-0"]?.name).toBe("First");

		// A follow-up command builds on the redone revision.
		const result = await port.execute(
			command(1, { type: "node.rename", nodeId: "legacy-0", name: "Third" }),
		);
		expect(result.status).toBe("committed");
		expect(result.revision).toBe(2);
	});

	it("keeps the reducer-output state (no re-parse) on self-originated echoes", async () => {
		const { port, puck } = createPort(buildLegacyPuckData());
		await port.execute(
			command(0, { type: "node.rename", nodeId: "legacy-0", name: "Hero" }),
		);
		const before = port.getSnapshot().authoring;
		// The controller echoes the exact dispatched data back.
		port.handleDataChange(puck.getData());
		// Reference equality proves the cache was NOT invalidated: a
		// re-parse would produce a structurally-equal but fresh object.
		expect(port.getSnapshot().authoring).toBe(before);
	});

	it("re-parses after a foreign sidecar write", async () => {
		const { port, puck } = createPort(buildLegacyPuckData());
		await port.execute(
			command(0, { type: "node.rename", nodeId: "legacy-0", name: "Hero" }),
		);
		const before = port.getSnapshot().authoring;

		// A plugin/host swaps the sidecar object wholesale.
		const foreign = buildPuckDataWithSidecar({
			...createEmptyAuthoringState(),
			revision: 7,
		});
		port.handleDataChange(foreign);
		// The port reads through its data source — point it at the new doc.
		puck.getPuckApi().dispatch({
			type: "setData",
			data: foreign,
		} as unknown as Parameters<PuckApi["dispatch"]>[0]);

		const after = port.getSnapshot();
		expect(after.authoring).not.toBe(before);
		expect(after.revision).toBe(7);
	});

	it("tolerates unrelated data changes without invalidating (sidecar reference unchanged)", async () => {
		const { port, puck } = createPort(buildLegacyPuckData());
		await port.execute(
			command(0, { type: "node.rename", nodeId: "legacy-0", name: "Hero" }),
		);
		const before = port.getSnapshot().authoring;
		// Simulate an unrelated Puck edit: new data object, spread-cloned
		// root props, same sidecar member reference.
		const current = puck.getData();
		const unrelated = {
			...current,
			content: [...(current.content ?? [])],
			root: { ...current.root, props: { ...current.root?.props } },
		} as PuckData;
		port.handleDataChange(unrelated);
		expect(port.getSnapshot().authoring).toBe(before);
	});
});

describe("createEditorCommandPort — validate/preview/snapshot (§10.2)", () => {
	it("validate reports conflicts and command errors without dispatching", async () => {
		const { port, puck } = createPort(buildLegacyPuckData());
		expect(
			codes(
				port.validate(
					command(3, { type: "node.rename", nodeId: "legacy-0", name: "A" }),
				),
			),
		).toContain("EDITOR_COMMAND_CONFLICT");
		expect(
			codes(
				port.validate(
					command(0, {
						type: "node.layout.set",
						nodeIds: ["legacy-0"],
						breakpointId: "bp-missing",
						patch: {},
					}),
				),
			),
		).toContain("EDITOR_BREAKPOINT_INVALID");
		expect(
			port.validate(
				command(0, { type: "node.rename", nodeId: "legacy-0", name: "A" }),
			),
		).toEqual([]);
		expect(puck.recordingCount()).toBe(0);
	});

	it("preview reports validity and changed nodes without dispatching", () => {
		const { port, puck } = createPort(buildLegacyPuckData());
		const preview = port.preview(
			command(0, { type: "node.rename", nodeId: "legacy-0", name: "A" }),
		);
		expect(preview.valid).toBe(true);
		expect(preview.changedNodeIds).toEqual(["legacy-0"]);
		expect(puck.recordingCount()).toBe(0);
		expect(port.getSnapshot().revision).toBe(0);
	});

	it("getSnapshot exposes effective breakpoints (authoring first, config fallback)", async () => {
		const configBreakpoints = [
			{ id: "bp-host", label: "Host", maxWidth: 767, order: 0, enabled: true },
		];
		const { port } = createPort(buildLegacyPuckData(), {
			editor: { features: { enabled: true }, breakpoints: configBreakpoints },
		});
		expect(port.getSnapshot().breakpoints).toEqual(configBreakpoints);

		const seeded = createPort(
			buildPuckDataWithSidecar(sidecarWithBreakpoint()),
			{
				editor: { features: { enabled: true }, breakpoints: configBreakpoints },
			},
		);
		expect(seeded.port.getSnapshot().breakpoints.map((b) => b.id)).toEqual([
			"bp-tablet",
		]);
	});

	it("rejects execution before <Puck> binds instead of throwing", async () => {
		const data = buildLegacyPuckData();
		const port = createEditorCommandPort({
			getPuckApi: () => {
				throw new Error("unbound");
			},
			getData: () => data,
			editor: { features: { enabled: true } },
		});
		const result = await port.execute(
			command(0, { type: "node.rename", nodeId: "legacy-0", name: "A" }),
		);
		expect(result.status).toBe("rejected");
		expect(result.errors[0]?.details?.reason).toBe("port-not-ready");
	});
});
