/**
 * @file Tests for `readFieldPresentation()` — the defensive reader
 * over Puck's per-field `metadata` bag. Third-party metadata can hold
 * anything, so every unrecognized shape must be dropped, never thrown
 * on.
 */

import { describe, expect, it } from "vitest";

import {
	CANONICAL_FIELD_SECTIONS,
	fieldSectionTitleKey,
	isCanonicalFieldSection,
	readFieldPresentation,
} from "@/overrides/fields/field-presentation";

describe("readFieldPresentation", () => {
	it("returns an empty presentation for non-object metadata", () => {
		for (const metadata of [undefined, null, 42, "layout", true]) {
			expect(readFieldPresentation(metadata)).toEqual({
				section: undefined,
				layout: undefined,
				description: undefined,
				order: undefined,
				unit: undefined,
				units: undefined,
				control: undefined,
			});
		}
	});

	it("reads all recognized keys", () => {
		const presentation = readFieldPresentation({
			section: "layout",
			layout: "property-row",
			description: "Width of the block.",
			order: 2,
			unit: "px",
			units: ["px", "%", "auto"],
			control: "dimension",
		});
		expect(presentation).toEqual({
			section: "layout",
			layout: "property-row",
			description: "Width of the block.",
			order: 2,
			unit: "px",
			units: ["px", "%", "auto"],
			control: "dimension",
		});
	});

	it("drops malformed values instead of passing them through", () => {
		const presentation = readFieldPresentation({
			section: "",
			layout: "sideways",
			description: 7,
			order: Number.NaN,
			unit: false,
			units: [1, "", null],
			control: "colorwheel",
		});
		expect(presentation.section).toBeUndefined();
		expect(presentation.layout).toBeUndefined();
		expect(presentation.description).toBeUndefined();
		expect(presentation.order).toBeUndefined();
		expect(presentation.unit).toBeUndefined();
		expect(presentation.units).toBeUndefined();
		expect(presentation.control).toBeUndefined();
	});

	it("keeps only non-empty string entries in units", () => {
		expect(
			readFieldPresentation({ units: ["px", 3, "", "auto"] }).units,
		).toEqual(["px", "auto"]);
	});

	it("canonical section helpers agree with the canonical list", () => {
		for (const section of CANONICAL_FIELD_SECTIONS) {
			expect(isCanonicalFieldSection(section)).toBe(true);
			expect(fieldSectionTitleKey(section)).toBe(
				`studio.fields.section.${section}`,
			);
		}
		expect(isCanonicalFieldSection("branding")).toBe(false);
	});
});
