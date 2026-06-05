/**
 * @file Tests for plugin header action icon resolution.
 */

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	HeaderActionButton,
	HeaderActionPlaceholderButton,
} from "@/layout/HeaderActionButton";
import type {
	StaticHeaderActionPlaceholder,
	StudioHeaderAction,
	StudioPluginContext,
} from "@/types/plugin";

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

describe("HeaderActionPlaceholderButton (3.3)", () => {
	function renderPlaceholder(
		placeholder: StaticHeaderActionPlaceholder,
	): HTMLElement {
		const { container } = render(
			<HeaderActionPlaceholderButton action={placeholder} />,
		);
		return container;
	}

	it("renders a disabled button (no ctx, no onClick) with the label", () => {
		const container = renderPlaceholder({ id: "publish", label: "Publish" });
		const button = container.querySelector("button");
		expect(button).not.toBeNull();
		expect(button?.disabled).toBe(true);
		expect(button?.getAttribute("data-header-action-placeholder")).toBe(
			"publish",
		);
		expect(button?.textContent).toContain("Publish");
	});

	it("resolves a curated icon name the same way the live button does", () => {
		const container = renderPlaceholder({
			id: "export",
			label: "Export",
			icon: "download",
		});
		expect(container.querySelector("svg")).not.toBeNull();
	});

	it("renders no icon for a name outside the registry (label still shows)", () => {
		const container = renderPlaceholder({
			id: "noicon",
			label: "No Icon",
			icon: "file-down",
		});
		expect(container.querySelector("svg")).toBeNull();
		expect(container.textContent).toContain("No Icon");
	});
});

describe("HeaderActionButton — labelKey resolution (P4)", () => {
	it("resolves labelKey via useMsg (core key → default English)", () => {
		const action: StudioHeaderAction = {
			id: "publish",
			labelKey: "studio.publish",
			onClick: vi.fn(),
		};
		const { container } = render(
			<HeaderActionButton action={action} ctx={ctx} />,
		);
		// `studio.publish` resolves to the default "Publish" via DEFAULT_MESSAGES.
		expect(container.textContent).toContain("Publish");
	});

	it("labelKey wins over a raw label", () => {
		const action: StudioHeaderAction = {
			id: "pub2",
			labelKey: "studio.publish",
			label: "RAW",
			onClick: vi.fn(),
		};
		const { container } = render(
			<HeaderActionButton action={action} ctx={ctx} />,
		);
		expect(container.textContent).toContain("Publish");
		expect(container.textContent).not.toContain("RAW");
	});

	it("falls back to the raw label when the labelKey is unknown", () => {
		const action: StudioHeaderAction = {
			id: "fb",
			labelKey: "no.such.key",
			label: "Fallback",
			onClick: vi.fn(),
		};
		const { container } = render(
			<HeaderActionButton action={action} ctx={ctx} />,
		);
		expect(container.textContent).toContain("Fallback");
	});

	it("still renders a raw label-only action unchanged (I2)", () => {
		const action: StudioHeaderAction = {
			id: "raw",
			label: "Plain Label",
			onClick: vi.fn(),
		};
		const { container } = render(
			<HeaderActionButton action={action} ctx={ctx} />,
		);
		expect(container.textContent).toContain("Plain Label");
	});

	it("placeholder resolves labelKey the same way", () => {
		const placeholder: StaticHeaderActionPlaceholder = {
			id: "ph",
			labelKey: "studio.publish",
		};
		const { container } = render(
			<HeaderActionPlaceholderButton action={placeholder} />,
		);
		expect(container.textContent).toContain("Publish");
	});
});
