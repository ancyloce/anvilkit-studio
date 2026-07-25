/**
 * §27.3 command matrix for the Phase 0/1A subset
 * (PLAN-0020 CORE-P0-008): revision gate, validation, reduction,
 * noop detection, batch atomicity, determinism, immutability.
 */

import type {
	AtomicEditorCommand,
	AuthoringStateV1,
	BatchEditorCommand,
	EditorCommandBase,
} from "@anvilkit/contracts/editor";
import { describe, expect, it } from "vitest";
import {
	applyEditorCommand,
	createEmptyAuthoringState,
	diffAuthoringState,
} from "../index.js";

function deepFreeze<T>(value: T): T {
	if (typeof value === "object" && value !== null) {
		for (const entry of Object.values(value)) {
			deepFreeze(entry);
		}
		Object.freeze(value);
	}
	return value;
}

let commandCounter = 0;
function base(expectedRevision: number): EditorCommandBase {
	commandCounter += 1;
	return {
		id: `cmd-${commandCounter}`,
		expectedRevision,
		source: "inspector",
		timestamp: 1_750_000_000_000,
	};
}

function px(value: number) {
	return { kind: "unit", value, unit: "px" } as const;
}

function stateWithBreakpoint(): AuthoringStateV1 {
	return {
		...createEmptyAuthoringState(),
		breakpoints: [
			{ id: "tablet", label: "Tablet", maxWidth: 991, order: 0, enabled: true },
			{
				id: "legacy",
				label: "Legacy",
				maxWidth: 640,
				order: 1,
				enabled: false,
			},
		],
	};
}

describe("revision gate", () => {
	it("rejects on expectedRevision mismatch with EDITOR_COMMAND_CONFLICT", () => {
		const state = createEmptyAuthoringState();
		const result = applyEditorCommand(state, {
			...base(5),
			type: "node.rename",
			nodeId: "n1",
			name: "Hello",
		});
		expect(result.status).toBe("rejected");
		expect(result.errors[0]?.code).toBe("EDITOR_COMMAND_CONFLICT");
		expect(result.state).toBe(state);
	});

	it("increments the revision by exactly 1 on commit", () => {
		const result = applyEditorCommand(createEmptyAuthoringState(), {
			...base(0),
			type: "node.rename",
			nodeId: "n1",
			name: "Hello",
		});
		expect(result.status).toBe("changed");
		expect(result.state.revision).toBe(1);
		expect(result.changes.changedNodeIds).toEqual(["n1"]);
	});
});

describe("validation", () => {
	it("rejects unknown breakpoints with EDITOR_BREAKPOINT_INVALID", () => {
		const result = applyEditorCommand(createEmptyAuthoringState(), {
			...base(0),
			type: "node.layout.set",
			nodeIds: ["n1"],
			breakpointId: "ghost",
			patch: { display: "flex" },
		});
		expect(result.status).toBe("rejected");
		expect(result.errors[0]?.code).toBe("EDITOR_BREAKPOINT_INVALID");
	});

	it("rejects disabled breakpoints", () => {
		const result = applyEditorCommand(stateWithBreakpoint(), {
			...base(0),
			type: "node.layout.set",
			nodeIds: ["n1"],
			breakpointId: "legacy",
			patch: { display: "flex" },
		});
		expect(result.status).toBe("rejected");
		expect(result.errors[0]?.code).toBe("EDITOR_BREAKPOINT_INVALID");
	});

	it("rejects mutations on locked nodes but allows unlocking", () => {
		const locked: AuthoringStateV1 = {
			...createEmptyAuthoringState(),
			nodes: { n1: { version: "1", locked: true } },
		};
		const mutate = applyEditorCommand(locked, {
			...base(0),
			type: "node.rename",
			nodeId: "n1",
			name: "New",
		});
		expect(mutate.status).toBe("rejected");
		expect(mutate.errors[0]?.code).toBe("EDITOR_NODE_LOCKED");

		const unlock = applyEditorCommand(locked, {
			...base(0),
			type: "node.lock.set",
			nodeIds: ["n1"],
			locked: false,
		});
		expect(unlock.status).toBe("changed");
		expect(unlock.state.nodes.n1).toBeUndefined();
	});

	it("rejects empty nodeIds", () => {
		const result = applyEditorCommand(createEmptyAuthoringState(), {
			...base(0),
			type: "node.visibility.set",
			nodeIds: [],
			breakpointId: "base",
			hidden: true,
		});
		expect(result.status).toBe("rejected");
		expect(result.errors[0]?.code).toBe("EDITOR_NODE_NOT_FOUND");
	});

	it("rejects invalid typed CSS values with EDITOR_INVALID_CSS_VALUE", () => {
		const result = applyEditorCommand(createEmptyAuthoringState(), {
			...base(0),
			type: "node.layout.set",
			nodeIds: ["n1"],
			breakpointId: "base",
			patch: { gap: "12px" as never },
		});
		expect(result.status).toBe("rejected");
		expect(result.errors[0]?.code).toBe("EDITOR_INVALID_CSS_VALUE");
	});

	it("rejects later-phase commands with EDITOR_CAPABILITY_UNSUPPORTED", () => {
		// `interaction.create` is Phase 3 scope (EP-14); the token
		// commands this test originally used shipped in CORE-P2-001.
		const result = applyEditorCommand(createEmptyAuthoringState(), {
			...base(0),
			type: "interaction.create",
			interaction: {
				version: "1",
				id: "i1",
				name: "Open",
				sourceNodeId: "n1",
				enabled: true,
				trigger: { type: "click" },
				actions: [],
			},
		});
		expect(result.status).toBe("rejected");
		expect(result.errors[0]?.code).toBe("EDITOR_CAPABILITY_UNSUPPORTED");
		expect(result.errors[0]?.details?.commandType).toBe("interaction.create");
	});
});

describe("reduction semantics", () => {
	it("writes a base-layer layout patch and creates the record", () => {
		const result = applyEditorCommand(createEmptyAuthoringState(), {
			...base(0),
			type: "node.layout.set",
			nodeIds: ["n1", "n2"],
			breakpointId: "base",
			patch: { display: "flex", gap: px(24) },
		});
		expect(result.status).toBe("changed");
		expect(result.state.nodes.n1?.layout?.base).toEqual({
			display: "flex",
			gap: px(24),
		});
		expect([...result.changes.changedNodeIds].sort()).toEqual(["n1", "n2"]);
	});

	it("writes an override-layer patch without touching base", () => {
		const seeded = applyEditorCommand(stateWithBreakpoint(), {
			...base(0),
			type: "node.layout.set",
			nodeIds: ["n1"],
			breakpointId: "base",
			patch: { gap: px(24) },
		}).state;
		const result = applyEditorCommand(seeded, {
			...base(1),
			type: "node.layout.set",
			nodeIds: ["n1"],
			breakpointId: "tablet",
			patch: { gap: px(16) },
		});
		expect(result.state.nodes.n1?.layout).toEqual({
			base: { gap: px(24) },
			overrides: { tablet: { gap: px(16) } },
		});
	});

	it("removes properties via null patch values (D-8)", () => {
		const seeded = applyEditorCommand(createEmptyAuthoringState(), {
			...base(0),
			type: "node.layout.set",
			nodeIds: ["n1"],
			breakpointId: "base",
			patch: { display: "flex", gap: px(24) },
		}).state;
		const result = applyEditorCommand(seeded, {
			...base(1),
			type: "node.layout.set",
			nodeIds: ["n1"],
			breakpointId: "base",
			patch: { gap: null },
		});
		expect(result.status).toBe("changed");
		expect(result.state.nodes.n1?.layout?.base).toEqual({ display: "flex" });
	});

	it("drops the record entirely when the last value is removed", () => {
		const seeded = applyEditorCommand(createEmptyAuthoringState(), {
			...base(0),
			type: "node.layout.set",
			nodeIds: ["n1"],
			breakpointId: "base",
			patch: { display: "flex" },
		}).state;
		const result = applyEditorCommand(seeded, {
			...base(1),
			type: "node.layout.set",
			nodeIds: ["n1"],
			breakpointId: "base",
			patch: { display: null },
		});
		expect(result.status).toBe("changed");
		expect(result.state.nodes.n1).toBeUndefined();
	});

	it("handles visibility set/clear across layers", () => {
		const hidden = applyEditorCommand(stateWithBreakpoint(), {
			...base(0),
			type: "node.visibility.set",
			nodeIds: ["n1"],
			breakpointId: "tablet",
			hidden: true,
		}).state;
		expect(hidden.nodes.n1?.hidden).toEqual({ overrides: { tablet: true } });
		const cleared = applyEditorCommand(hidden, {
			...base(1),
			type: "node.visibility.set",
			nodeIds: ["n1"],
			breakpointId: "tablet",
			hidden: null,
		}).state;
		expect(cleared.nodes.n1).toBeUndefined();
	});

	it("renames and clears names", () => {
		const named = applyEditorCommand(createEmptyAuthoringState(), {
			...base(0),
			type: "node.rename",
			nodeId: "n1",
			name: "Hero",
		}).state;
		expect(named.nodes.n1?.name).toBe("Hero");
		const cleared = applyEditorCommand(named, {
			...base(1),
			type: "node.rename",
			nodeId: "n1",
			name: null,
		}).state;
		expect(cleared.nodes.n1).toBeUndefined();
	});

	it("removes a whole family override via node.responsiveOverride.set", () => {
		let state = stateWithBreakpoint();
		state = applyEditorCommand(state, {
			...base(0),
			type: "node.layout.set",
			nodeIds: ["n1"],
			breakpointId: "base",
			patch: { gap: px(24) },
		}).state;
		state = applyEditorCommand(state, {
			...base(1),
			type: "node.layout.set",
			nodeIds: ["n1"],
			breakpointId: "tablet",
			patch: { gap: px(16) },
		}).state;
		const result = applyEditorCommand(state, {
			...base(2),
			type: "node.responsiveOverride.set",
			nodeIds: ["n1"],
			breakpointId: "tablet",
			family: "layout",
		});
		expect(result.status).toBe("changed");
		expect(result.state.nodes.n1?.layout).toEqual({ base: { gap: px(24) } });
	});

	it("is a noop when removing an override that does not exist", () => {
		const result = applyEditorCommand(stateWithBreakpoint(), {
			...base(0),
			type: "node.responsiveOverride.set",
			nodeIds: ["n1"],
			breakpointId: "tablet",
			family: "style",
		});
		expect(result.status).toBe("noop");
		expect(result.state.revision).toBe(0);
	});
});

describe("noop detection", () => {
	it("detects value-identical writes without bumping the revision", () => {
		const seeded = applyEditorCommand(createEmptyAuthoringState(), {
			...base(0),
			type: "node.layout.set",
			nodeIds: ["n1"],
			breakpointId: "base",
			patch: { display: "flex" },
		}).state;
		const result = applyEditorCommand(seeded, {
			...base(1),
			type: "node.layout.set",
			nodeIds: ["n1"],
			breakpointId: "base",
			patch: { display: "flex" },
		});
		expect(result.status).toBe("noop");
		expect(result.state).toBe(seeded);
		expect(result.changes.changedNodeIds).toEqual([]);
	});
});

describe("batch semantics (freeze §5)", () => {
	it("validates members sequentially against intermediate state", () => {
		// Member 2 unlocks n1; member 3 renames it — valid only against
		// the intermediate state produced by member 2.
		const locked: AuthoringStateV1 = {
			...createEmptyAuthoringState(),
			nodes: { n1: { version: "1", locked: true } },
		};
		const batch: BatchEditorCommand = {
			...base(0),
			type: "batch",
			label: "unlock and rename",
			commands: [
				{ ...base(0), type: "node.lock.set", nodeIds: ["n1"], locked: false },
				{ ...base(99), type: "node.rename", nodeId: "n1", name: "Freed" },
			],
		};
		const result = applyEditorCommand(locked, batch);
		expect(result.status).toBe("changed");
		expect(result.state.nodes.n1?.name).toBe("Freed");
		expect(result.state.revision).toBe(1);
	});

	it("rejects all-or-nothing with the failing index annotated", () => {
		const batch: BatchEditorCommand = {
			...base(0),
			type: "batch",
			label: "partial failure",
			commands: [
				{ ...base(0), type: "node.rename", nodeId: "n1", name: "Kept?" },
				{
					...base(0),
					type: "node.layout.set",
					nodeIds: ["n1"],
					breakpointId: "ghost",
					patch: {},
				},
			],
		};
		const state = createEmptyAuthoringState();
		const result = applyEditorCommand(state, batch);
		expect(result.status).toBe("rejected");
		expect(result.state).toBe(state);
		expect(result.errors[0]?.details?.batchIndex).toBe(1);
	});

	it("rejects empty and oversized batches and nested batches", () => {
		const state = createEmptyAuthoringState();
		const empty = applyEditorCommand(state, {
			...base(0),
			type: "batch",
			label: "empty",
			commands: [],
		});
		expect(empty.status).toBe("rejected");

		const oversized = applyEditorCommand(state, {
			...base(0),
			type: "batch",
			label: "big",
			commands: Array.from({ length: 201 }, () => ({
				...base(0),
				type: "node.rename" as const,
				nodeId: "n1",
				name: "x",
			})),
		});
		expect(oversized.status).toBe("rejected");
		expect(
			oversized.errors.some((error) => error.code === "EDITOR_LIMIT_EXCEEDED"),
		).toBe(true);

		const nested = applyEditorCommand(state, {
			...base(0),
			type: "batch",
			label: "nested",
			commands: [
				{
					...base(0),
					type: "batch",
					label: "inner",
					commands: [],
				} as unknown as AtomicEditorCommand,
			],
		});
		expect(nested.status).toBe("rejected");
	});

	it("treats a net-zero batch as a noop", () => {
		const result = applyEditorCommand(createEmptyAuthoringState(), {
			...base(0),
			type: "batch",
			label: "lock then unlock",
			commands: [
				{ ...base(0), type: "node.lock.set", nodeIds: ["n1"], locked: true },
				{ ...base(0), type: "node.lock.set", nodeIds: ["n1"], locked: false },
			],
		});
		expect(result.status).toBe("noop");
	});
});

describe("determinism and immutability", () => {
	it("never mutates frozen inputs and is deterministic", () => {
		const state = deepFreeze(stateWithBreakpoint());
		const command = deepFreeze({
			...base(0),
			type: "node.layout.set" as const,
			nodeIds: ["n1"],
			breakpointId: "tablet" as const,
			patch: { gap: px(8) },
		});
		const first = applyEditorCommand(state, command);
		const second = applyEditorCommand(state, command);
		expect(first.status).toBe("changed");
		expect(second.state).toEqual(first.state);
		expect(state.nodes).toEqual({});
	});
});

describe("diffAuthoringState", () => {
	it("returns the empty change set for identical references", () => {
		const state = createEmptyAuthoringState();
		expect(diffAuthoringState(state, state).changedNodeIds).toEqual([]);
	});

	it("reports non-node collection changes", () => {
		const a = createEmptyAuthoringState();
		const b: AuthoringStateV1 = {
			...a,
			breakpoints: [
				{ id: "t", label: "T", maxWidth: 991, order: 0, enabled: true },
			],
		};
		expect(diffAuthoringState(a, b).changedCollections).toContain(
			"breakpoints",
		);
	});
});
