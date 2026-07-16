/**
 * @file Tests for `<InspectorSection>` — the collapsible property
 * group used by `ObjectField` (task Phase 7).
 *
 * Assertions use the trigger's `aria-expanded` state (synchronous,
 * Base UI-managed) rather than post-click DOM presence/visibility —
 * the underlying `Accordion` primitive animates panel mount/unmount
 * via framer-motion's `AnimatePresence`, which does not settle
 * deterministically under jsdom's lack of real animation frames. The
 * existing `Accordion.test.tsx` only asserts the initial expanded
 * state for the same reason; this file follows that precedent rather
 * than introducing a new, unproven pattern.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { InspectorSection } from "@/overrides/layout/InspectorSection";
import { EditorUiStoreProvider } from "@/state/index";

afterEach(cleanup);

function Setup({
	children,
	storeId = `section-${Math.random().toString(36).slice(2)}`,
}: {
	readonly children: ReactNode;
	readonly storeId?: string;
}): ReactElement {
	return (
		<EditorUiStoreProvider storeId={storeId}>{children}</EditorUiStoreProvider>
	);
}

describe("InspectorSection", () => {
	it("renders the title and expands by default", () => {
		render(
			<Setup>
				<InspectorSection id="seo" title="SEO">
					<p>Meta description field</p>
				</InspectorSection>
			</Setup>,
		);
		expect(screen.getByText("SEO")).not.toBeNull();
		expect(screen.getByText("Meta description field")).not.toBeNull();
		expect(screen.getByRole("button", { name: "SEO" })).toHaveAttribute(
			"aria-expanded",
			"true",
		);
	});

	it("toggles aria-expanded on trigger click", () => {
		render(
			<Setup>
				<InspectorSection id="seo" title="SEO">
					<p>Meta description field</p>
				</InspectorSection>
			</Setup>,
		);
		const trigger = screen.getByRole("button", { name: "SEO" });
		fireEvent.click(trigger);
		expect(trigger).toHaveAttribute("aria-expanded", "false");
		fireEvent.click(trigger);
		expect(trigger).toHaveAttribute("aria-expanded", "true");
	});

	it("honors defaultExpanded=false for the first-ever render of an id", () => {
		render(
			<Setup>
				<InspectorSection
					id="advanced"
					title="Advanced"
					defaultExpanded={false}
				>
					<p>Rare field</p>
				</InspectorSection>
			</Setup>,
		);
		expect(screen.getByRole("button", { name: "Advanced" })).toHaveAttribute(
			"aria-expanded",
			"false",
		);
	});

	it("persists collapse state across remounts of the same Studio instance", () => {
		const storeId = `section-persist-${Math.random().toString(36).slice(2)}`;
		const { unmount } = render(
			<Setup storeId={storeId}>
				<InspectorSection id="seo" title="SEO">
					<p>Meta description field</p>
				</InspectorSection>
			</Setup>,
		);
		fireEvent.click(screen.getByRole("button", { name: "SEO" }));
		unmount();

		render(
			<Setup storeId={storeId}>
				<InspectorSection id="seo" title="SEO">
					<p>Meta description field</p>
				</InspectorSection>
			</Setup>,
		);
		expect(screen.getByRole("button", { name: "SEO" })).toHaveAttribute(
			"aria-expanded",
			"false",
		);
	});

	it("keeps two different section ids independently expandable", () => {
		render(
			<Setup>
				<InspectorSection id="seo" title="SEO">
					<p>SEO body</p>
				</InspectorSection>
				<InspectorSection id="actions" title="Actions">
					<p>Actions body</p>
				</InspectorSection>
			</Setup>,
		);
		fireEvent.click(screen.getByRole("button", { name: "SEO" }));
		expect(screen.getByRole("button", { name: "SEO" })).toHaveAttribute(
			"aria-expanded",
			"false",
		);
		expect(screen.getByRole("button", { name: "Actions" })).toHaveAttribute(
			"aria-expanded",
			"true",
		);
	});
});
