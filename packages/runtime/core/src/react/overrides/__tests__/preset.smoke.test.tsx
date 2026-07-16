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
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "@/primitives/button";
import { Input } from "@/primitives/input";
import { EditorUiStoreProvider } from "@/state/index";

// `ComponentOverlay` reads `config.components[type].label` via
// `useReactivePuck` (built on `createUsePuck`) for the label tab's
// friendly display name (task Phase 8), falling back to the raw
// `componentType` when the config has no matching entry — exactly
// what an empty `components` map below exercises. The hook throws
// outside `<Puck>`, so stub it for these isolated render tests.
const puckSnapshotStub = {
	config: { components: {} as Record<string, { label?: string }> },
	getSelectorForId: (_id: string) => ({ index: 1, zone: "some-zone" }),
};
vi.mock("@puckeditor/core", () => ({
	useGetPuck: () => () => puckSnapshotStub,
	createUsePuck:
		() =>
		<T,>(selector: (s: typeof puckSnapshotStub) => T): T =>
			selector(puckSnapshotStub),
}));

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
		render(
			<EditorUiStoreProvider storeId="smoke-drawer-item">
				{drawerItem({ name: "Hero", children: <span>drag</span> })}
			</EditorUiStoreProvider>,
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
					children: <Input data-testid="inner" />,
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
					parentAction: <Button type="button">parent</Button>,
					children: <Button type="button">child</Button>,
				})}
			</>,
		);
		// Label is no longer rendered inline — it surfaces via the overlay
		// tab. The label string still rides along on a data-attribute for
		// debugging/automation hooks.
		expect(screen.queryByText("Hero")).toBeNull();
		expect(
			container.querySelector(
				'[data-ak-action-bar][data-component-label="Hero"]',
			),
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
