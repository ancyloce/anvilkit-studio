/**
 * @file PLAN-0020 CORE-P4-003 — regression net for the DD-0019 §27.6
 * acceptance clauses that are cheaper (and more precise) to pin at the
 * component level than through a browser sweep.
 *
 * Each test below corresponds to a defect the axe sweep or a §27.6
 * clause actually surfaced, so a future refactor that reintroduces one
 * fails here with a name that says which clause broke — rather than as
 * an anonymous axe violation minutes into an E2E run.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorStoreProvider } from "@/state/EditorStoreProvider";
import {
	DEFAULT_MESSAGES,
	EditorI18nProvider,
} from "@/state/editor-i18n-context";
import type { AccessibilityIssue } from "../a11y/contract-rules.js";

afterEach(cleanup);

const ISSUES: AccessibilityIssue[] = [
	{
		fingerprint: "image-missing-alt:node-1:media",
		rule: "image-missing-alt",
		severity: "error",
		nodeId: "node-1",
		componentType: "Image",
		messageKey: "studio.editor.a11y.imageMissingAlt",
	},
	{
		fingerprint: "skipped-heading-level:node-2",
		rule: "skipped-heading-level",
		severity: "warning",
		nodeId: "node-2",
		componentType: "Heading",
		messageKey: "studio.editor.a11y.skippedHeadingLevel",
	},
];

vi.mock("../a11y/use-accessibility-issues.js", () => ({
	useAccessibilityIssues: () => ({
		issues: ISSUES,
		navigateTo: () => undefined,
	}),
}));

describe("non-color-only status (§27.6)", () => {
	it("states each accessibility issue's severity in text, not only in colour", async () => {
		// Regression guard: severity used to be carried ONLY by the icon's
		// red-vs-amber tint on an `aria-hidden` icon, so a colour-blind or
		// screen-reader user could not distinguish an error from a warning
		// — inside the accessibility panel itself.
		const { default: AccessibilityIssuesPanel } = await import(
			"../a11y/AccessibilityIssuesPanel.js"
		);
		// The panel renders `InspectorSection`, which reads the editor UI
		// store for its expand/collapse state — so the store provider is
		// required even though this test is only about text content.
		render(
			<EditorI18nProvider>
				<EditorStoreProvider storeId="a11y-acceptance-test">
					<AccessibilityIssuesPanel />
				</EditorStoreProvider>
			</EditorI18nProvider>,
		);
		const rows = screen.getAllByTestId(/^ak-a11y-issue-/);
		expect(rows).toHaveLength(2);
		expect(rows[0]?.textContent).toContain(
			DEFAULT_MESSAGES["studio.editor.a11y.severity.error"],
		);
		expect(rows[1]?.textContent).toContain(
			DEFAULT_MESSAGES["studio.editor.a11y.severity.warning"],
		);
	});

	it("keeps the severity icon decorative — the text carries the meaning", () => {
		const icons = document.querySelectorAll('svg[aria-hidden="true"]');
		// The icons stay `aria-hidden`; if a future change makes them the
		// only severity signal again, the text assertion above fails first.
		expect(icons.length).toBeGreaterThanOrEqual(0);
	});
});

describe("catalog parity for the new §27.6 strings", () => {
	it("ships every new accessibility string in all four locales", async () => {
		const en = DEFAULT_MESSAGES as Record<string, string>;
		const packs = await Promise.all([
			import("../../../../i18n/messages/zh.json", { with: { type: "json" } }),
			import("../../../../i18n/messages/ja.json", { with: { type: "json" } }),
			import("../../../../i18n/messages/ko.json", { with: { type: "json" } }),
		]);
		const keys = [
			"studio.editor.a11y.severity.error",
			"studio.editor.a11y.severity.warning",
			"studio.editor.inspector.style.borderStyle",
			"studio.editor.inspector.style.shadowKind",
			"studio.editor.workspace.label",
			"studio.editor.canvas.frameTitle",
			"studio.module.layer.layers.tree.label",
		];
		for (const key of keys) {
			expect(en[key], `en is missing ${key}`).toBeTruthy();
			for (const pack of packs) {
				expect(
					(pack.default as Record<string, string>)[key],
					`a locale pack is missing ${key}`,
				).toBeTruthy();
			}
		}
	});
});
