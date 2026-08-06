/**
 * @file P2-01 — `StudioPuckLayout` composition-shell mount tests.
 *
 * Mounts the shell under a real `<Puck>` (iframe disabled, jsdom) and
 * proves the §8.1 contract: all three regions come from Puck's public
 * composition components, the Properties tab is `Puck.Fields` showing
 * the selected item's business fields, injected panels render only
 * while active, and a vanished panel id falls back to Properties.
 */

import type { Config, Data, PuckApi } from "@puckeditor/core";
import { Puck, useGetPuck } from "@puckeditor/core";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
	StudioPuckLayout,
	type StudioPuckLayoutProps,
} from "../StudioPuckLayout.js";

const config: Config = {
	components: {
		Hero: {
			fields: { title: { type: "text" } },
			render: ({ title }: { title?: string }) => (
				<h1 data-testid="hero-render">{title}</h1>
			),
		},
	},
} as unknown as Config;

const data = {
	content: [{ type: "Hero", props: { id: "hero-1", title: "Hello Region" } }],
	root: { props: {} },
	zones: {},
} as Data;

let getPuck: (() => PuckApi) | null = null;

function ApiProbe(): React.ReactElement {
	getPuck = useGetPuck();
	return <span hidden />;
}

function mountShell(props?: StudioPuckLayoutProps) {
	return render(
		<Puck config={config} data={data} iframe={{ enabled: false }}>
			<ApiProbe />
			<StudioPuckLayout {...props} />
		</Puck>,
	);
}

function selectFirstItem(): void {
	if (getPuck === null) throw new Error("ApiProbe never mounted");
	const api = getPuck();
	act(() => {
		api.dispatch({
			type: "setUi",
			ui: { itemSelector: { index: 0, zone: "root:default-zone" } },
		});
	});
}

afterEach(() => {
	// react-library preset runs with globals off — no RTL auto-cleanup.
	cleanup();
	getPuck = null;
});

describe("StudioPuckLayout (P2-01)", () => {
	it("assembles all three regions from Puck composition components", () => {
		mountShell();
		expect(screen.getByTestId("ak-composition-sidebar")).toBeInTheDocument();
		expect(screen.getByTestId("ak-composition-canvas")).toBeInTheDocument();
		expect(screen.getByTestId("ak-composition-inspector")).toBeInTheDocument();
		// The canvas region really renders the document through
		// Puck.Preview — the component's own render output is present.
		expect(screen.getByTestId("hero-render")).toHaveTextContent("Hello Region");
		// The left sidebar lists the component from Config (drawer item).
		expect(screen.getByTestId("ak-composition-sidebar").textContent).toContain(
			"Hero",
		);
	});

	it("Properties tab is Puck.Fields and shows the selected item's business fields", () => {
		mountShell();
		selectFirstItem();
		// Puck.Fields renders the `title` text field with the live value.
		const propertiesPanel = screen.getByTestId(
			"ak-composition-panel-properties",
		);
		const input = propertiesPanel.querySelector("input");
		expect(input).not.toBeNull();
		expect(input).toHaveValue("Hello Region");
	});

	it("renders injected panels only while their tab is active", async () => {
		let styleRenders = 0;
		const { getByTestId } = mountShell({
			panels: [
				{
					id: "style",
					labelKey: "studio.editor.inspector.tab.style",
					render: () => {
						styleRenders += 1;
						return <p data-testid="style-panel-body">style body</p>;
					},
				},
			],
		});
		// Inactive: never rendered, not just hidden.
		expect(styleRenders).toBe(0);
		expect(screen.queryByTestId("style-panel-body")).not.toBeInTheDocument();

		const styleTab = getByTestId("ak-composition-tab-style");
		act(() => {
			styleTab.click();
		});
		expect(await screen.findByTestId("style-panel-body")).toBeInTheDocument();
		expect(styleRenders).toBeGreaterThan(0);
	});

	it("falls back to Properties when the active panel id disappears", async () => {
		const panels: StudioInspectorPanelList = [
			{
				id: "style",
				labelKey: "studio.editor.inspector.tab.style",
				render: () => <p data-testid="style-panel-body">style body</p>,
			},
		];
		const view = render(
			<Puck config={config} data={data} iframe={{ enabled: false }}>
				<StudioPuckLayout panels={panels} />
			</Puck>,
		);
		act(() => {
			view.getByTestId("ak-composition-tab-style").click();
		});
		expect(await screen.findByTestId("style-panel-body")).toBeInTheDocument();

		// Host recompiles its plugin set: the style panel vanishes.
		view.rerender(
			<Puck config={config} data={data} iframe={{ enabled: false }}>
				<StudioPuckLayout panels={[]} />
			</Puck>,
		);
		expect(screen.queryByTestId("style-panel-body")).not.toBeInTheDocument();
		expect(
			screen.getByTestId("ak-composition-panel-properties"),
		).toBeInTheDocument();
	});
});

type StudioInspectorPanelList = NonNullable<StudioPuckLayoutProps["panels"]>;
