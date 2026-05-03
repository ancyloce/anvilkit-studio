/**
 * @file Smoke render every default override slot in isolation —
 * Phase 3 acceptance.
 *
 * Each slot's render function is invoked with a minimal fixture
 * matching the Puck override signature, and the resulting tree is
 * mounted under RTL. The assertions are deliberately structural: a
 * non-throwing mount + presence of a discriminator string per slot.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);

import { studioOverrides } from "../preset.js";

describe("studioOverrides preset smoke", () => {
	it("populates every chrome-owned slot", () => {
		expect(typeof studioOverrides.puck).toBe("function");
		expect(typeof studioOverrides.drawer).toBe("function");
		expect(typeof studioOverrides.drawerItem).toBe("function");
		expect(typeof studioOverrides.fields).toBe("function");
		expect(typeof studioOverrides.fieldLabel).toBe("function");
		expect(typeof studioOverrides.iframe).toBe("function");
		expect(typeof studioOverrides.componentOverlay).toBe("function");
		expect(typeof studioOverrides.actionBar).toBe("function");
		expect(typeof studioOverrides.preview).toBe("function");
		expect(studioOverrides.fieldTypes).toBeDefined();
	});

	it("renders DrawerItem with the supplied name", () => {
		const drawerItem = studioOverrides.drawerItem;
		if (drawerItem === undefined) throw new Error("drawerItem missing");
		render(
			<>{drawerItem({ name: "Hero", children: <span>drag</span> })}</>,
		);
		expect(screen.getByText("Hero")).toBeInTheDocument();
	});

	it("renders FieldLabel with read-only marker when readOnly", () => {
		const fieldLabel = studioOverrides.fieldLabel;
		if (fieldLabel === undefined) throw new Error("fieldLabel missing");
		render(
			<>
				{fieldLabel({
					label: "Title",
					readOnly: true,
					children: <input data-testid="inner" />,
				})}
			</>,
		);
		expect(screen.getByText("Title")).toBeInTheDocument();
		expect(screen.getByLabelText("Read-only")).toBeInTheDocument();
		expect(screen.getByTestId("inner")).toBeInTheDocument();
	});

	it("renders ComponentOverlay with selected styling", () => {
		const componentOverlay = studioOverrides.componentOverlay;
		if (componentOverlay === undefined)
			throw new Error("componentOverlay missing");
		const { container } = render(
			<>
				{componentOverlay({
					children: <div data-testid="inner-child">x</div>,
					hover: false,
					isSelected: true,
					componentId: "id-1",
					componentType: "Hero",
				})}
			</>,
		);
		expect(screen.getByTestId("inner-child")).toBeInTheDocument();
		// Selected state surfaces a `data-overlay-state` attribute.
		expect(
			container.querySelector('[data-overlay-state="selected"]'),
		).not.toBeNull();
	});

	it("renders ActionBar with label and parent-action slot", () => {
		const actionBar = studioOverrides.actionBar;
		if (actionBar === undefined) throw new Error("actionBar missing");
		render(
			<>
				{actionBar({
					label: "Hero",
					parentAction: <button type="button">parent</button>,
					children: <button type="button">child</button>,
				})}
			</>,
		);
		expect(screen.getByText("Hero")).toBeInTheDocument();
		expect(screen.getByText("parent")).toBeInTheDocument();
		expect(screen.getByText("child")).toBeInTheDocument();
	});

	it("renders CanvasIframe pass-through children even without iframe doc", () => {
		const iframe = studioOverrides.iframe;
		if (iframe === undefined) throw new Error("iframe missing");
		render(
			<>{iframe({ children: <span data-testid="iframe-child">in</span> })}</>,
		);
		expect(screen.getByTestId("iframe-child")).toBeInTheDocument();
	});
});
