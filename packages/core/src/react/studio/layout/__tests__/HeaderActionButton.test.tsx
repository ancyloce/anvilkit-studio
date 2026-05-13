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
	it.each([
		"sparkles",
		"download",
		"Sparkles",
		"file-down",
	])("renders a lucide icon for %s", (icon) => {
		const container = renderAction(icon);
		expect(container.querySelector("svg")).not.toBeNull();
	});
});
