/**
 * P0-02 acceptance (plan 0036): every registered wrapper renders in the
 * canvas from ONE Config object — the same object the preview, publish and
 * export consumers use (Unified Puck Contract rule 3).
 */

import type { Data } from "@puckeditor/core";
import { Render } from "@puckeditor/core";
import { render } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import {
	componentEditorConfig,
	createComponentEditorConfig,
} from "../editor-config";

/**
 * The registered catalogue, kept sorted. PLAN-0036 grows this list one
 * wrapper batch at a time (P0 six → P1-04 batch 1 → P1-05/06), and the
 * assertion below stays an EXACT set comparison so a wrapper can never
 * be added to the app without being declared here.
 */
const COMPONENT_TYPES = [
	"Accordion",
	"Alert",
	"Avatar",
	"Badge",
	"Button",
	"Card",
	"Checkbox",
	"Input",
	"Label",
	"Progress",
	"Select",
	"Separator",
	"Slider",
	"Switch",
	"Table",
	"Tabs",
	"Textarea",
	"Tooltip",
] as const;

/** One node per registered type, in one document. */
const documentOfEveryComponent = (): Data =>
	({
		root: {
			props: {
				title: "T",
				slug: "t",
				description: "",
				status: "draft",
				version: "1",
			},
		},
		content: COMPONENT_TYPES.map((type, index) => ({
			type,
			props: {
				...(componentEditorConfig.components[type]?.defaultProps ?? {}),
				id: `${type.toLowerCase()}-${index}`,
			},
		})),
		zones: {},
	}) as unknown as Data;

describe("component-editor config assembly (P0-02)", () => {
	it("registers exactly the declared wrapper catalogue", () => {
		expect(Object.keys(componentEditorConfig.components).sort()).toEqual([
			...COMPONENT_TYPES,
		]);
	});

	it("every registered type appears in a category", () => {
		const categorized = Object.values(
			componentEditorConfig.categories ?? {},
		).flatMap((category) => category?.components ?? []);
		for (const type of COMPONENT_TYPES) {
			expect(categorized, `${type} is not in any category`).toContain(type);
		}
	});

	it("declares the design §1.3 root fields", () => {
		expect(Object.keys(componentEditorConfig.root?.fields ?? {})).toEqual([
			"title",
			"slug",
			"description",
		]);
	});

	it("renders every registered wrapper from the one Config object", () => {
		const { container } = render(
			createElement(Render, {
				config: componentEditorConfig,
				data: documentOfEveryComponent(),
			}),
		);
		// Each node stamps its own id on its root style target (§6.2), which
		// is the proof that the component actually produced DOM.
		for (const [index, type] of COMPONENT_TYPES.entries()) {
			const id = `${type.toLowerCase()}-${index}`;
			expect(
				container.querySelector(`[data-ak-style-node="${id}"]`),
				`${type} produced no DOM from the shared config`,
			).not.toBeNull();
		}
	});

	it("is locale-aware without changing the component set", () => {
		const ja = createComponentEditorConfig("ja");
		expect(Object.keys(ja.components).sort()).toEqual([...COMPONENT_TYPES]);
		// Field labels come from each package's own catalogs.
		expect(ja.components.Badge?.label).not.toBe(
			componentEditorConfig.components.Badge?.label,
		);
	});
});
