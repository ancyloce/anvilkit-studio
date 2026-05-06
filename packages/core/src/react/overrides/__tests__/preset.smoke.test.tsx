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

import { studioOverrides } from "@/overrides/preset";

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
		render(<>{drawerItem({ name: "Hero", children: <span>drag</span> })}</>);
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

	it("renders ComponentOverlay with selected styling and label tab", () => {
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
		// Selected state surfaces a `data-overlay-state` attribute and the
		// component label tab.
		expect(
			container.querySelector('[data-overlay-state="selected"]'),
		).not.toBeNull();
		expect(container.querySelector("[data-ak-overlay-label]")).not.toBeNull();
		expect(screen.getByText("Hero")).toBeInTheDocument();
	});

	it("hides the label tab when ComponentOverlay is not selected", () => {
		const componentOverlay = studioOverrides.componentOverlay;
		if (componentOverlay === undefined)
			throw new Error("componentOverlay missing");
		const { container } = render(
			<>
				{componentOverlay({
					children: <div>x</div>,
					hover: true,
					isSelected: false,
					componentId: "id-2",
					componentType: "Hero",
				})}
			</>,
		);
		expect(container.querySelector("[data-ak-overlay-label]")).toBeNull();
		expect(screen.queryByText("Hero")).toBeNull();
	});

	it("renders ActionBar with parent-action and child controls (label moved to overlay tab)", () => {
		const actionBar = studioOverrides.actionBar;
		if (actionBar === undefined) throw new Error("actionBar missing");
		const { container } = render(
			<>
				{actionBar({
					label: "Hero",
					parentAction: <button type="button">parent</button>,
					children: <button type="button">child</button>,
				})}
			</>,
		);
		// Label is no longer rendered inline — it surfaces via the overlay
		// tab. The label string still rides along on a data-attribute for
		// debugging/automation hooks.
		expect(screen.queryByText("Hero")).toBeNull();
		expect(
			container.querySelector('[data-ak-action-bar][data-component-label="Hero"]'),
		).not.toBeNull();
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
