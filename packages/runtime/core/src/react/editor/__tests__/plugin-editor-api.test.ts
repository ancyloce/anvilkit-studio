/**
 * @file CORE-P1A-003 — `StudioPluginContext.editor` facade, capability
 * registry, and the diagnostic center: presence gating, deterministic
 * pre-mount degradation, delegation after mount, and metadata lookup.
 */

import type {
	EditorCapabilityMetadata,
	EditorEvent,
} from "@anvilkit/contracts/editor";
import type { PuckApi } from "@puckeditor/core";
import { describe, expect, it, vi } from "vitest";
import { createEmptyAuthoringState } from "../../../editor/index.js";
import { createStudioEditorBridge } from "../bridge.js";
import { createEditorCapabilityRegistry } from "../capability-registry.js";
import { createEditorDiagnosticCenter } from "../diagnostics/center.js";
import { createPluginEditorApi } from "../plugin-editor-api.js";
import { createEditorSelectionController } from "../selection.js";

const CAPABLE_METADATA: EditorCapabilityMetadata = {
	version: "1",
	styleTarget: "root",
	capabilities: { layoutItem: true, visualStyle: true },
};

function fakePuckApi(): PuckApi {
	return {
		config: {
			components: {
				Hero: { metadata: { editor: CAPABLE_METADATA } },
				Legacy: {},
				Broken: { metadata: { editor: { version: "2" } } },
			},
		},
		getItemById: (id: string) =>
			id === "node-hero" ? { type: "Hero", props: { id } } : undefined,
	} as unknown as PuckApi;
}

describe("createEditorCapabilityRegistry (CORE-P1A-003)", () => {
	it("resolves declared metadata per component and per node", () => {
		const registry = createEditorCapabilityRegistry({
			getPuckApi: fakePuckApi,
			readAuthoring: createEmptyAuthoringState,
		});
		expect(registry.forComponent("Hero")).toEqual(CAPABLE_METADATA);
		// Legacy and malformed metadata read as undefined (≡ none).
		expect(registry.forComponent("Legacy")).toBeUndefined();
		expect(registry.forComponent("Broken")).toBeUndefined();
		expect(registry.forComponent("Unknown")).toBeUndefined();
		expect(registry.forNode("node-hero")).toEqual(CAPABLE_METADATA);
		expect(registry.forNode("node-missing")).toBeUndefined();
	});

	it("lists used features from the authoring state (shared ir projection)", () => {
		const registry = createEditorCapabilityRegistry({
			getPuckApi: fakePuckApi,
			readAuthoring: () => ({
				...createEmptyAuthoringState(),
				breakpoints: [
					{
						id: "bp-a",
						label: "A",
						maxWidth: 767,
						order: 0,
						enabled: true,
					},
				],
				tokens: {
					"t-1": {
						id: "t-1",
						path: ["color", "primary"],
						name: "Primary",
						type: "color",
						values: {
							default: {
								kind: "literal",
								value: { kind: "hex", value: "#112233" },
							},
						},
					},
				},
			}),
		});
		expect(registry.listUsedFeatures()).toEqual(["responsive", "tokens"]);
	});

	it("survives a throwing Puck id index (undo-crash regression)", () => {
		// Puck's `getItemById` throws while its app state is mid-
		// transition — observed in the browser on the render right
		// after undoing a tree mutation, where the throw propagated out
		// of a render path and took the whole Studio chrome down.
		const registry = createEditorCapabilityRegistry({
			getPuckApi: () =>
				({
					config: { components: { Hero: {} } },
					getItemById: () => {
						throw new TypeError("Cannot read properties of undefined");
					},
				}) as unknown as PuckApi,
			readAuthoring: () => createEmptyAuthoringState(),
		});
		expect(() => registry.forNode("node-hero")).not.toThrow();
		expect(registry.forNode("node-hero")).toBeUndefined();
	});

	it("survives a throwing Puck config accessor", () => {
		const registry = createEditorCapabilityRegistry({
			getPuckApi: () =>
				({
					get config(): never {
						throw new TypeError("config unavailable mid-transition");
					},
					getItemById: () => undefined,
				}) as unknown as PuckApi,
			readAuthoring: () => createEmptyAuthoringState(),
		});
		expect(() => registry.forComponent("Hero")).not.toThrow();
		expect(registry.forComponent("Hero")).toBeUndefined();
	});

	it("degrades to undefined/empty before <Puck> binds", () => {
		const registry = createEditorCapabilityRegistry({
			getPuckApi: () => {
				throw new Error("unbound");
			},
			readAuthoring: createEmptyAuthoringState,
		});
		expect(registry.forComponent("Hero")).toBeUndefined();
		expect(registry.forNode("node-hero")).toBeUndefined();
		expect(registry.listUsedFeatures()).toEqual([]);
	});
});

describe("createPluginEditorApi (CORE-P1A-003)", () => {
	it("degrades deterministically before the editor chunk mounts", async () => {
		const bridge = createStudioEditorBridge();
		const api = createPluginEditorApi(bridge, {
			features: { enabled: true },
			breakpoints: [
				{ id: "bp-a", label: "A", maxWidth: 767, order: 0, enabled: true },
			],
		});
		expect(api.version).toBe("1");

		const result = await api.commands.execute({
			id: "c1",
			expectedRevision: 0,
			source: "plugin",
			timestamp: 1,
			type: "node.rename",
			nodeId: "n1",
			name: "X",
		});
		expect(result.status).toBe("rejected");
		expect(result.errors[0]?.details?.reason).toBe("port-not-ready");

		const snapshot = api.commands.getSnapshot();
		expect(snapshot.revision).toBe(0);
		expect(snapshot.breakpoints.map((b) => b.id)).toEqual(["bp-a"]);
		expect(api.selection.getState().selectedIds).toEqual([]);
		expect(api.capabilities.forComponent("Hero")).toBeUndefined();
		expect(api.capabilities.listUsedFeatures()).toEqual([]);
	});

	it("delegates to the live port and selection once installed", async () => {
		const bridge = createStudioEditorBridge();
		const api = createPluginEditorApi(bridge, { features: { enabled: true } });

		const execute = vi.fn().mockResolvedValue({
			status: "committed",
			revision: 1,
			changedNodeIds: ["n1"],
			errors: [],
		});
		bridge.port = {
			execute,
			preview: vi.fn(),
			validate: vi.fn().mockReturnValue([]),
			getSnapshot: vi.fn().mockReturnValue({
				revision: 5,
				authoring: createEmptyAuthoringState(),
				selection: { selectedIds: [], scope: "page" },
				breakpoints: [],
			}),
		};
		const selection = createEditorSelectionController({
			syncPrimaryToPuck: () => undefined,
			onChange: () => bridge.notify(),
		});
		bridge.selection = selection;

		expect(api.commands.getSnapshot().revision).toBe(5);
		await api.commands.execute({
			id: "c2",
			expectedRevision: 5,
			source: "plugin",
			timestamp: 2,
			type: "node.rename",
			nodeId: "n1",
			name: "Y",
		});
		expect(execute).toHaveBeenCalledTimes(1);

		// A subscription armed BEFORE mount-completion still delivers.
		const seen: string[] = [];
		const unsubscribe = api.selection.subscribe((state) => {
			seen.push(state.primaryId ?? "-");
		});
		selection.select("n2");
		expect(api.selection.getState().primaryId).toBe("n2");
		expect(seen).toEqual(["n2"]);
		unsubscribe();
	});
});

describe("createEditorDiagnosticCenter (CORE-P1A-003/-004)", () => {
	it("keeps per-source slices and emits content-free diagnostic.changed", () => {
		const center = createEditorDiagnosticCenter();
		const events: EditorEvent[] = [];
		center.subscribe((event) => events.push(event));

		center.setDiagnostics("collab-gate", [
			{
				code: "EDITOR_COLLAB_ENCODING_UNSUPPORTED",
				severity: "error",
				message: "writers disabled",
				recoverable: true,
			},
		]);
		center.setDiagnostics("byte-limits", [
			{
				code: "EDITOR_LIMIT_EXCEEDED",
				severity: "warning",
				message: "sidecar approaching the byte limit",
				recoverable: true,
			},
		]);
		expect(center.getDiagnostics()).toHaveLength(2);
		expect(events.at(-1)).toEqual({
			type: "diagnostic.changed",
			severity: "error",
			count: 2,
		});

		// Clearing one source leaves the other slice intact.
		center.setDiagnostics("collab-gate", []);
		expect(center.getDiagnostics()).toHaveLength(1);
		expect(events.at(-1)).toEqual({
			type: "diagnostic.changed",
			severity: "warning",
			count: 1,
		});

		// Clearing an already-empty source emits nothing.
		const count = events.length;
		center.setDiagnostics("collab-gate", []);
		expect(events).toHaveLength(count);
	});

	it("isolates throwing subscribers", () => {
		const center = createEditorDiagnosticCenter();
		const seen: EditorEvent[] = [];
		center.subscribe(() => {
			throw new Error("bad subscriber");
		});
		center.subscribe((event) => seen.push(event));
		expect(() =>
			center.emit({
				type: "gesture.completed",
				gesture: "drag",
				durationMs: 5,
			}),
		).not.toThrow();
		expect(seen).toHaveLength(1);
	});
});
