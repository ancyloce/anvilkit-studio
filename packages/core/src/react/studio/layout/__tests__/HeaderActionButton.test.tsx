/**
 * @file Tests for plugin header action icon resolution.
 */

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HeaderActionButton } from "@/layout/HeaderActionButton";
import type { StudioHeaderAction, StudioPluginContext } from "@/types/plugin";

afterEach(cleanup);

const ctx = {
	log: vi.fn(),
} as unknown as StudioPluginContext;

function renderAction(icon: string): HTMLElement {
	const action: StudioHeaderAction = {
		id: `action-${icon}`,
		label: icon,
		icon,
		onClick: vi.fn(),
	};
	const { container } = render(
		<HeaderActionButton action={action} ctx={ctx} />,
	);
	return container;
}

describe("HeaderActionButton", () => {
	// Names in the curated ICON_REGISTRY resolve case/separator-blind.
	it.each([
		"sparkles",
		"download",
		"Sparkles",
		"up-load",
	])("renders a lucide icon for %s", (icon) => {
		const container = renderAction(icon);
		expect(container.querySelector("svg")).not.toBeNull();
	});

	// A name outside the curated registry resolves to no icon (the
	// label still renders) — the deliberate tree-shaking narrowing.
	it("renders no icon for a name outside the registry", () => {
		const container = renderAction("file-down");
		expect(container.querySelector("svg")).toBeNull();
	});

	// A throwing `disabled` predicate must not crash chrome render: it
	// is logged and the action fails safe to disabled (PRD §9.2).
	it("survives a throwing disabled() predicate and disables the action", () => {
		const log = vi.fn();
		const localCtx = { log } as unknown as StudioPluginContext;
		const boom = new Error("plugin bug");
		const action: StudioHeaderAction = {
			id: "action-throws",
			label: "Throws",
			onClick: vi.fn(),
			disabled: () => {
				throw boom;
			},
		};

		const { container } = render(
			<HeaderActionButton action={action} ctx={localCtx} />,
		);

		const button = container.querySelector("button");
		expect(button).not.toBeNull();
		expect(button?.disabled).toBe(true);
		expect(log).toHaveBeenCalledWith(
			"error",
			'header action "action-throws" disabled() threw',
			expect.objectContaining({ message: "plugin bug" }),
		);
	});
});
