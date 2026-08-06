/**
 * @file P2-02 — `StylePanel` read-path tests.
 *
 * Mounts the panel under a real `<Puck>` and proves the read contract:
 * selection and capability data arrive exclusively through
 * `createUsePuck` selectors, capability gating uses the shared
 * metadata-v2 reader (same allowlist as the compiler), and the §8.5
 * honest states render for no-selection and undeclared components.
 */

import type { Config, Data, PuckApi } from "@puckeditor/core";
import { Puck, useGetPuck } from "@puckeditor/core";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StylePanel } from "../StylePanel.js";

const config: Config = {
	components: {
		Box: {
			fields: { label: { type: "text" } },
			metadata: {
				anvilkit: {
					editor: {
						version: "2",
						styleTargets: {
							root: {
								label: "Box frame",
								responsive: true,
								properties: ["display", "padding", "opacity"],
							},
							content: {
								label: "Box content",
								properties: ["color", "textAlign"],
							},
							// Malformed target: must be skipped, never guessed at.
							broken: { properties: "nope" },
						},
					},
				},
			},
			render: () => <div data-testid="box-render" />,
		},
		Plain: {
			fields: {},
			render: () => <div data-testid="plain-render" />,
		},
	},
} as unknown as Config;

const data = {
	content: [
		{
			type: "Box",
			props: {
				id: "box-1",
				label: "A",
				appearance: {
					version: "1",
					targets: {
						root: {
							style: {
								base: {
									layout: { display: "flex" },
									visual: { opacity: 0.5 },
								},
								overrides: { "bp-sm": { layout: { display: "block" } } },
							},
						},
					},
				},
			},
		},
		{ type: "Plain", props: { id: "plain-1" } },
	],
	root: {
		props: {
			designSystem: {
				version: "1",
				breakpoints: [
					{ id: "bp-sm", label: "S", maxWidth: 640, order: 0, enabled: true },
				],
				tokens: {},
				tokenModes: { light: { id: "light", name: "Light" } },
				defaultTokenMode: "light",
				styleDefinitions: {},
			},
		},
	},
	zones: {},
} as unknown as Data;

let getPuck: (() => PuckApi) | null = null;

function ApiProbe(): React.ReactElement {
	getPuck = useGetPuck();
	return <span hidden />;
}

function mountPanel() {
	return render(
		<Puck config={config} data={data} iframe={{ enabled: false }}>
			<ApiProbe />
			<StylePanel />
		</Puck>,
	);
}

function selectIndex(index: number): void {
	if (getPuck === null) throw new Error("ApiProbe never mounted");
	const api = getPuck();
	act(() => {
		api.dispatch({
			type: "setUi",
			ui: { itemSelector: { index, zone: "root:default-zone" } },
		});
	});
}

afterEach(() => {
	cleanup();
	getPuck = null;
});

describe("StylePanel (P2-02)", () => {
	it("shows the no-selection state before anything is selected", () => {
		mountPanel();
		expect(screen.getByTestId("ak-style-panel-empty")).toBeInTheDocument();
	});

	it("shows the undeclared state for a component without metadata v2 — never fabricates support", () => {
		mountPanel();
		selectIndex(1);
		expect(screen.getByTestId("ak-style-panel-undeclared")).toBeInTheDocument();
		expect(screen.queryByTestId("ak-style-panel")).not.toBeInTheDocument();
	});

	it("renders one section per valid declared target, skipping malformed ones", () => {
		mountPanel();
		selectIndex(0);
		const panel = screen.getByTestId("ak-style-panel");
		expect(panel.dataset.nodeId).toBe("box-1");
		expect(panel.dataset.nodeType).toBe("Box");
		// appState.data projection: the document's breakpoint count.
		expect(panel.dataset.breakpoints).toBe("1");

		expect(screen.getByTestId("ak-style-target-root")).toBeInTheDocument();
		expect(screen.getByTestId("ak-style-target-content")).toBeInTheDocument();
		expect(
			screen.queryByTestId("ak-style-target-broken"),
		).not.toBeInTheDocument();
		// Labels come from the component's own declaration.
		expect(screen.getByText("Box frame")).toBeInTheDocument();
		expect(screen.getByText("Box content")).toBeInTheDocument();
	});

	it("summarizes the authored appearance per target from selectedItem props", () => {
		mountPanel();
		selectIndex(0);
		const root = screen.getByTestId("ak-style-target-root");
		expect(root.dataset.responsive).toBe("true");
		expect(root.dataset.authoredBase).toBe("2");
		expect(root.dataset.authoredOverrides).toBe("1");
		const content = screen.getByTestId("ak-style-target-content");
		expect(content.dataset.responsive).toBe("false");
		expect(content.dataset.authoredBase).toBe("0");
	});

	it("re-reads through the selector when the selection moves", () => {
		mountPanel();
		selectIndex(0);
		expect(screen.getByTestId("ak-style-panel")).toBeInTheDocument();
		selectIndex(1);
		expect(screen.getByTestId("ak-style-panel-undeclared")).toBeInTheDocument();
	});
});
