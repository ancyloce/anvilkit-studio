/**
 * @file P2-07 — Phase 2 integration tests over a real `<Puck>`
 * (0.22.4, jsdom): one commit = one history entry; undo/redo restores
 * appearance AND root design system exactly; duplication carries
 * appearance under a regenerated id with matching compiled targets;
 * movement and slot reordering preserve appearance and leave the
 * deterministic CSS fingerprint unchanged; and a remount from
 * persisted Data restores the identical canvas stylesheet — the
 * phase exit gate.
 */

import type {
	AnvilAppearance,
	DesignSystem,
} from "@anvilkit/contracts/editor";
import type { Config, Data, PuckApi } from "@puckeditor/core";
import { Puck, useGetPuck } from "@puckeditor/core";
import { act, cleanup, render } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { commitAppearanceUpdate } from "../../../../puck/update-appearance.js";
import { commitDesignSystemUpdate } from "../../../../puck/update-design-system.js";
import { compileDocumentAppearance } from "../../../../style-compiler/compile.js";
import { AppearanceIframeOverride } from "../AppearanceIframeOverride.js";

const ROOT_ZONE = "root:default-zone";

const config: Config = {
	components: {
		Box: {
			fields: { body: { type: "slot" } },
			metadata: {
				anvilkit: {
					editor: {
						version: "2",
						styleTargets: {
							root: {
								label: "Box",
								responsive: true,
								properties: ["display", "gap", "opacity"],
							},
						},
					},
				},
			},
			render: () => <div data-testid="box-render" />,
		},
	},
} as unknown as Config;

const flexAppearance: AnvilAppearance = {
	targets: { root: { style: { base: { layout: { display: "flex" } } } } },
};

const gridAppearance: AnvilAppearance = {
	targets: { root: { style: { base: { layout: { display: "grid" } } } } },
};

const designSystem: DesignSystem = {
	breakpoints: [
		{ id: "bp-sm", label: "S", maxWidth: 640, order: 0, enabled: true },
	],
	tokens: {},
	tokenModes: { light: { id: "light", name: "Light" } },
	defaultTokenMode: "light",
	styleDefinitions: {},
};

function baseData(): Data {
	return {
		content: [
			{
				type: "Box",
				props: { id: "box-1", appearance: flexAppearance, body: [] },
			},
			{
				type: "Box",
				props: {
					id: "box-2",
					body: [
						{
							type: "Box",
							props: { id: "inner-1", appearance: gridAppearance, body: [] },
						},
						{ type: "Box", props: { id: "inner-2", body: [] } },
					],
				},
			},
		],
		root: { props: { designSystem } },
		zones: {},
	} as unknown as Data;
}

let getPuck: (() => PuckApi) | null = null;

function ApiProbe(): React.ReactElement {
	getPuck = useGetPuck();
	return <span hidden />;
}

function api(): PuckApi {
	if (getPuck === null) throw new Error("ApiProbe never mounted");
	return getPuck();
}

function mountEditor(data: Data = baseData()) {
	return render(
		<Puck config={config} data={data} iframe={{ enabled: false }}>
			<ApiProbe />
			<AppearanceIframeOverride>
				<Puck.Preview />
			</AppearanceIframeOverride>
		</Puck>,
	);
}

function liveData(): Data {
	return api().appState.data as Data;
}

function liveJson(): string {
	return JSON.stringify(liveData());
}

function commitDisplay(nodeIds: readonly string[], value: string): void {
	act(() => {
		commitAppearanceUpdate(
			{ getPuckApi: getPuck as () => PuckApi },
			{
				config,
				nodeIds,
				targetId: "root",
				layer: "base",
				patch: { kind: "set-property", property: "display", value },
			},
		);
	});
}

afterEach(() => {
	cleanup();
	getPuck = null;
});

/**
 * Puck 0.22.4 records history through a ~300 ms trailing debounce
 * (`record = debounce(fn, 300)` in the app store), so entries land
 * shortly AFTER a commit, and commits inside one debounce window
 * coalesce into one entry — which is Puck natively providing the §8.3
 * slider-coalescing behavior. Human-paced intents (>300 ms apart)
 * record one entry each; these tests pace commits accordingly.
 */
async function settleHistory(): Promise<void> {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 400));
	});
}

describe("history (P2-07)", () => {
	it("one commit produces exactly one history entry (after the record debounce)", async () => {
		mountEditor();
		const before = api().history.histories.length;
		expect(api().history.hasPast).toBe(false);
		commitDisplay(["box-1"], "grid");
		await settleHistory();
		expect(api().history.histories.length).toBe(before + 1);
		expect(api().history.hasPast).toBe(true);
	});

	it("undo/redo restores appearance AND root design system exactly", async () => {
		mountEditor();
		const pristine = liveJson();
		commitDisplay(["box-1"], "grid");
		await settleHistory();
		act(() => {
			commitDesignSystemUpdate(
				{ getPuckApi: getPuck as () => PuckApi },
				(current) => ({
					...(current as DesignSystem),
					tokenModes: {
						...(current as DesignSystem).tokenModes,
						dark: { id: "dark", name: "Dark" },
					},
				}),
			);
		});
		await settleHistory();
		const edited = liveJson();
		expect(edited).not.toBe(pristine);

		act(() => {
			api().history.back();
		});
		act(() => {
			api().history.back();
		});
		expect(liveJson()).toBe(pristine);

		act(() => {
			api().history.forward();
		});
		act(() => {
			api().history.forward();
		});
		expect(liveJson()).toBe(edited);
	});
});

describe("duplication (P2-07)", () => {
	it("duplicate carries appearance, regenerates the id, and compiles matching targets", () => {
		mountEditor();
		act(() => {
			api().dispatch({
				type: "duplicate",
				sourceIndex: 0,
				sourceZone: ROOT_ZONE,
			});
		});
		const content = (
			liveData() as unknown as {
				content: { props: { id: string; appearance?: unknown } }[];
			}
		).content;
		expect(content).toHaveLength(3);
		const clone = content[1];
		expect(clone?.props.id).not.toBe("box-1");
		expect(clone?.props.appearance).toEqual(flexAppearance);

		const compiled = compileDocumentAppearance({ data: liveData(), config });
		expect(compiled.styledNodeIds).toContain("box-1");
		expect(compiled.styledNodeIds).toContain(clone?.props.id);
		expect(compiled.targetManifest[clone?.props.id as string]).toEqual([
			"root",
		]);
	});
});

describe("movement and slot reordering (P2-07)", () => {
	it("top-level reorder preserves appearance and the CSS fingerprint", () => {
		mountEditor();
		const before = compileDocumentAppearance({ data: liveData(), config });
		act(() => {
			api().dispatch({
				type: "reorder",
				sourceIndex: 0,
				destinationIndex: 1,
				destinationZone: ROOT_ZONE,
			});
		});
		const moved = api().getItemById("box-1");
		expect(
			(moved?.props as { appearance?: unknown } | undefined)?.appearance,
		).toEqual(flexAppearance);
		const after = compileDocumentAppearance({ data: liveData(), config });
		expect(after.fingerprint).toBe(before.fingerprint);
	});

	it("moving a node into a slot zone keeps its appearance and fingerprint", () => {
		mountEditor();
		const before = compileDocumentAppearance({ data: liveData(), config });
		act(() => {
			api().dispatch({
				type: "move",
				sourceIndex: 0,
				sourceZone: ROOT_ZONE,
				destinationIndex: 0,
				destinationZone: "box-2:body",
			});
		});
		// box-1 now lives inside box-2's slot.
		const moved = api().getItemById("box-1");
		expect(moved).toBeDefined();
		expect(
			(moved?.props as { appearance?: unknown } | undefined)?.appearance,
		).toEqual(flexAppearance);
		const parent = api().getParentById("box-1");
		expect(parent?.props.id).toBe("box-2");
		const after = compileDocumentAppearance({ data: liveData(), config });
		expect(after.fingerprint).toBe(before.fingerprint);
	});

	it("reordering inside a slot preserves nested appearance and fingerprint", () => {
		mountEditor();
		const before = compileDocumentAppearance({ data: liveData(), config });
		act(() => {
			api().dispatch({
				type: "reorder",
				sourceIndex: 0,
				destinationIndex: 1,
				destinationZone: "box-2:body",
			});
		});
		const inner = api().getItemById("inner-1");
		expect(
			(inner?.props as { appearance?: unknown } | undefined)?.appearance,
		).toEqual(gridAppearance);
		const after = compileDocumentAppearance({ data: liveData(), config });
		expect(after.fingerprint).toBe(before.fingerprint);
	});
});

describe("phase exit gate: refresh restores the same canvas (P2-07)", () => {
	it("a fresh <Puck> mounted from persisted Data compiles the identical stylesheet", async () => {
		const first = mountEditor();
		commitDisplay(["box-1", "inner-2"], "grid");
		await act(async () => {
			await Promise.resolve();
		});
		const persisted = JSON.parse(liveJson()) as Data;
		const firstCompiled = compileDocumentAppearance({
			data: liveData(),
			config,
		});
		const firstCss = first.container.ownerDocument.querySelector(
			"style[data-anvilkit-appearance]",
		)?.textContent;
		expect(firstCss).toContain("display: grid;");
		first.unmount();
		cleanup();

		const second = mountEditor(persisted);
		await act(async () => {
			await Promise.resolve();
		});
		const secondCompiled = compileDocumentAppearance({
			data: liveData(),
			config,
		});
		expect(secondCompiled.fingerprint).toBe(firstCompiled.fingerprint);
		const secondCss = second.container.ownerDocument.querySelector(
			"style[data-anvilkit-appearance]",
		)?.textContent;
		expect(secondCss).toBe(firstCss);
	});
});
