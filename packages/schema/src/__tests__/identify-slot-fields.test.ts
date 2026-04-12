import type { Config } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import { identifySlotFields } from "../identify-slot-fields.js";
import { demoConfig } from "./fixtures/demo-config.js";

const noop = (() => null) as unknown as Config["components"][string]["render"];

describe("identifySlotFields", () => {
	it("returns slot fields for Section", () => {
		const slots = identifySlotFields(demoConfig);
		expect(slots.get("Section")).toEqual(["content"]);
	});

	it("returns slot fields for BentoGrid", () => {
		const slots = identifySlotFields(demoConfig);
		expect(slots.get("BentoGrid")).toEqual(["children"]);
	});

	it("returns slot fields for Helps", () => {
		const slots = identifySlotFields(demoConfig);
		expect(slots.get("Helps")).toEqual(["sidebar"]);
	});

	it("returns empty arrays for components without slots", () => {
		const slots = identifySlotFields(demoConfig);
		expect(slots.get("Hero")).toEqual([]);
		expect(slots.get("Navbar")).toEqual([]);
		expect(slots.get("LogoClouds")).toEqual([]);
		expect(slots.get("Statistics")).toEqual([]);
		expect(slots.get("PricingMinimal")).toEqual([]);
		expect(slots.get("BlogList")).toEqual([]);
	});

	it("includes all 9 demo components", () => {
		const slots = identifySlotFields(demoConfig);
		expect(slots.size).toBe(9);
	});

	it("returns keys sorted alphabetically per component", () => {
		const config: Config = {
			components: {
				Test: {
					render: noop,
					fields: {
						zebra: { type: "slot" },
						alpha: { type: "slot" },
						middle: { type: "text" },
					},
				},
			},
		};
		const slots = identifySlotFields(config);
		expect(slots.get("Test")).toEqual(["alpha", "zebra"]);
	});

	it("sorts component names alphabetically", () => {
		const slots = identifySlotFields(demoConfig);
		const names = [...slots.keys()];
		const sorted = [...names].sort((a, b) => a.localeCompare(b));
		expect(names).toEqual(sorted);
	});

	it("handles empty config", () => {
		const config: Config = { components: {} };
		const slots = identifySlotFields(config);
		expect(slots.size).toBe(0);
	});

	it("handles component with no fields", () => {
		const config: Config = {
			components: {
				Empty: { render: noop, fields: {} },
			},
		};
		const slots = identifySlotFields(config);
		expect(slots.get("Empty")).toEqual([]);
	});
});
