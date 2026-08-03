/**
 * @file CORE-P1A-008 — responsive editing model: `breakpoints.set`
 * §12.2 invariants and reduction (§27.4 edge rows: deletion with
 * merge-to-base/discard, duplicate widths, disabled, cap), the
 * viewport controller (write target, follow mode, never-in-history),
 * the default preset, materialization batching, and the host
 * `maxBreakpoints` tighten-only policy.
 */

import type {
	AuthoringStateV1,
	BreakpointDefinition,
	SetBreakpointsCommand,
} from "@anvilkit/contracts/editor";
import { describe, expect, it } from "vitest";
import {
	applyEditorCommand,
	createEmptyAuthoringState,
} from "../../../editor/index.js";
import {
	buildLegacyPuckData,
	buildPuckDataWithSidecar,
	createHistoryRecordingProbe,
} from "../../../testing/editor/index.js";
import { createEditorCommandPort } from "../command-port.js";
import { withBreakpointMaterialization } from "../responsive/materialize.js";
import {
	DEFAULT_BREAKPOINT_PRESET,
	effectiveBreakpoints,
} from "../responsive/preset.js";
import {
	createStudioViewportController,
	deriveFollowTarget,
} from "../responsive/viewport-controller.js";
import {
	applyPuckDataAction,
	type PuckDataAction,
} from "./puck-store-double.js";

let seq = 0;
function setCommand(
	expectedRevision: number,
	breakpoints: readonly BreakpointDefinition[],
	removedOverrides?: SetBreakpointsCommand["removedOverrides"],
): SetBreakpointsCommand {
	seq += 1;
	return {
		id: `bp-${seq}`,
		expectedRevision,
		source: "inspector",
		timestamp: seq,
		type: "breakpoints.set",
		breakpoints,
		...(removedOverrides !== undefined ? { removedOverrides } : {}),
	};
}

function bp(
	id: string,
	maxWidth: number,
	enabled = true,
): BreakpointDefinition {
	return { id, label: id, maxWidth, order: 0, enabled };
}

describe("breakpoints.set — §12.2 invariants (§27.4 edge rows)", () => {
	const empty = createEmptyAuthoringState();

	it("creates a set with order normalized widest-first", () => {
		const result = applyEditorCommand(
			empty,
			setCommand(0, [bp("mobile", 479), bp("tablet", 991)]),
		);
		expect(result.status).toBe("changed");
		expect(result.state.breakpoints.map((b) => [b.id, b.order])).toEqual([
			["tablet", 0],
			["mobile", 1],
		]);
	});

	it("rejects duplicate widths, duplicate ids, the reserved id, and out-of-range widths", () => {
		for (const invalid of [
			[bp("a", 700), bp("b", 700)],
			[bp("a", 700), bp("a", 800)],
			[bp("base", 700)],
			[bp("a", 100)],
			[bp("a", 9000)],
			[bp("a", 700.5)],
		]) {
			const result = applyEditorCommand(empty, setCommand(0, invalid));
			expect(result.status).toBe("rejected");
		}
	});

	it("rejects more than eight breakpoints (design cap)", () => {
		const nine = Array.from({ length: 9 }, (_, index) =>
			bp(`b-${index}`, 300 + index * 100),
		);
		const result = applyEditorCommand(empty, setCommand(0, nine));
		expect(result.status).toBe("rejected");
		expect(result.errors[0]?.code).toBe("EDITOR_LIMIT_EXCEEDED");
	});

	it("keeps disabled breakpoints in the set (they gate writes elsewhere)", () => {
		const result = applyEditorCommand(
			empty,
			setCommand(0, [bp("tablet", 991, false)]),
		);
		expect(result.status).toBe("changed");
		expect(result.state.breakpoints[0]?.enabled).toBe(false);
	});

	it("deletion discards overrides by default and can merge-to-base", () => {
		const seeded: AuthoringStateV1 = {
			...createEmptyAuthoringState(),
			breakpoints: [
				{ ...bp("tablet", 991), order: 0 },
				{ ...bp("mobile", 767), order: 1 },
			],
			nodes: {
				"n-1": {
					version: "1",
					layout: {
						base: { display: "flex", overflow: "auto" },
						overrides: { tablet: { display: "grid" } },
					},
				},
				"n-2": {
					version: "1",
					hidden: { overrides: { tablet: true } },
				},
			},
		};

		const discarded = applyEditorCommand(
			seeded,
			setCommand(0, [bp("mobile", 767)]),
		);
		expect(discarded.status).toBe("changed");
		expect(discarded.state.nodes["n-1"]?.layout).toEqual({
			base: { display: "flex", overflow: "auto" },
		});
		// The record whose only content was the removed override collapses.
		expect(discarded.state.nodes["n-2"]).toBeUndefined();

		const merged = applyEditorCommand(
			seeded,
			setCommand(0, [bp("mobile", 767)], { tablet: "merge-to-base" }),
		);
		expect(merged.status).toBe("changed");
		// Property-wise fold: the removed layer's value wins.
		expect(merged.state.nodes["n-1"]?.layout).toEqual({
			base: { display: "grid", overflow: "auto" },
		});
		expect(merged.state.nodes["n-2"]?.hidden).toEqual({ base: true });
	});
});

describe("viewport controller (CORE-P1A-008)", () => {
	const BPS = [
		{ ...bp("tablet", 991), order: 0 },
		{ ...bp("mobile", 767), order: 1 },
	];

	it("derives the follow target from the viewport width", () => {
		expect(deriveFollowTarget(BPS, 1280)).toBe("base");
		expect(deriveFollowTarget(BPS, 900)).toBe("tablet");
		expect(deriveFollowTarget(BPS, 500)).toBe("mobile");
	});

	it("follows the viewport until an explicit write target pins it", () => {
		const controller = createStudioViewportController();
		controller.setBreakpoints(BPS);
		controller.notifyViewportWidth(900);
		expect(controller.getState().activeBreakpoint).toBe("tablet");

		controller.setWriteTarget("base");
		expect(controller.getState().followViewport).toBe(false);
		controller.notifyViewportWidth(500);
		expect(controller.getState().activeBreakpoint).toBe("base");

		controller.setFollowViewport(true);
		expect(controller.getState().activeBreakpoint).toBe("mobile");
	});

	it("switching the write target never dispatches to Puck (never enters history)", async () => {
		const probe = createHistoryRecordingProbe();
		const data = buildLegacyPuckData();
		const port = createEditorCommandPort({
			getPuckApi: () =>
				({
					appState: { data },
					dispatch: probe.wrap(() => undefined),
				}) as never,
			getData: () => data,
			editor: { features: { enabled: true } },
		});
		const controller = createStudioViewportController();
		controller.setBreakpoints(port.getSnapshot().breakpoints);
		controller.setWriteTarget("tablet");
		controller.setWriteTarget("mobile");
		controller.setWriteTarget("base");
		controller.setFollowViewport(true);
		controller.notifyViewportWidth(500);
		expect(probe.count()).toBe(0);
	});
});

describe("default preset + materialization (CORE-P1A-008)", () => {
	it("effective breakpoints: sidecar wins, then host config, then the preset", () => {
		const empty = createEmptyAuthoringState();
		expect(effectiveBreakpoints(empty, { features: { enabled: true } })).toBe(
			DEFAULT_BREAKPOINT_PRESET,
		);
		const host = [bp("host", 700)];
		expect(
			effectiveBreakpoints(empty, {
				features: { enabled: true },
				breakpoints: host,
			}),
		).toBe(host);
		const owned: AuthoringStateV1 = {
			...empty,
			breakpoints: [{ ...bp("own", 600), order: 0 }],
		};
		expect(
			effectiveBreakpoints(owned, {
				features: { enabled: true },
				breakpoints: host,
			}).map((b) => b.id),
		).toEqual(["own"]);
	});

	it("first breakpoint write materializes the preset in one intent", async () => {
		const probe = createHistoryRecordingProbe();
		let data = buildLegacyPuckData();
		const port = createEditorCommandPort({
			getPuckApi: () =>
				({
					appState: {
						get data() {
							return data;
						},
					},
					dispatch: probe.wrap((action: PuckDataAction) => {
						data = applyPuckDataAction(data, action);
					}),
				}) as never,
			getData: () => data,
			editor: { features: { enabled: true } },
		});
		const snapshot = port.getSnapshot();
		const command = withBreakpointMaterialization(
			{
				id: "w1",
				expectedRevision: snapshot.revision,
				source: "inspector",
				timestamp: 1,
				type: "node.visibility.set",
				nodeIds: ["legacy-0"],
				breakpointId: "tablet",
				hidden: true,
			},
			snapshot.authoring,
			snapshot.breakpoints,
		);
		expect(command.type).toBe("batch");

		const result = await port.execute(command);
		expect(result.status).toBe("committed");
		// One intent: exactly one history-recording dispatch.
		expect(probe.count()).toBe(1);
		const after = port.getSnapshot();
		expect(after.authoring.breakpoints.map((b) => b.id)).toEqual([
			"tablet",
			"mobile",
			"mobile-small",
		]);
		expect(after.authoring.nodes["legacy-0"]?.hidden?.overrides?.tablet).toBe(
			true,
		);

		// Subsequent breakpoint writes stay atomic (no re-materialization).
		const again = withBreakpointMaterialization(
			{
				id: "w2",
				expectedRevision: after.revision,
				source: "inspector",
				timestamp: 2,
				type: "node.visibility.set",
				nodeIds: ["legacy-0"],
				breakpointId: "mobile",
				hidden: true,
			},
			after.authoring,
			after.breakpoints,
		);
		expect(again.type).toBe("node.visibility.set");
	});

	it("enforces the tighten-only maxBreakpoints host policy", async () => {
		const data = buildPuckDataWithSidecar(createEmptyAuthoringState());
		const port = createEditorCommandPort({
			getPuckApi: () =>
				({ appState: { data }, dispatch: () => undefined }) as never,
			getData: () => data,
			editor: {
				features: { enabled: true },
				policies: { maxBreakpoints: 2 },
			},
		});
		const result = await port.execute(
			setCommand(0, [bp("a", 500), bp("b", 700), bp("c", 900)]),
		);
		expect(result.status).toBe("rejected");
		expect(result.errors[0]?.details?.limitKey).toBe("maxBreakpoints");
	});
});
