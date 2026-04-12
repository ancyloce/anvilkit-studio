import type { Config } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import { identifySlots } from "../identify-slots.js";
import {
	bentoGridConfig,
	blogListConfig,
	helpsConfig,
	heroConfig,
	logoCloudsConfig,
	navbarConfig,
	pricingMinimalConfig,
	sectionConfig,
	statisticsConfig,
} from "./fixtures/demo-fixtures.js";

const noop = (() => null) as unknown as Config["components"][string]["render"];

describe("identifySlots", () => {
	// ----- Demo components (none currently use type: "slot") -----

	it("returns empty slot keys for Hero (no slots)", () => {
		const slots = identifySlots(heroConfig);
		expect(slots.get("Hero")).toEqual([]);
	});

	it("returns empty slot keys for Section (no slots)", () => {
		const slots = identifySlots(sectionConfig);
		expect(slots.get("Section")).toEqual([]);
	});

	it("returns empty slot keys for BentoGrid (array fields, not slots)", () => {
		const slots = identifySlots(bentoGridConfig);
		expect(slots.get("BentoGrid")).toEqual([]);
	});

	it("returns empty slot keys for Helps (array fields, not slots)", () => {
		const slots = identifySlots(helpsConfig);
		expect(slots.get("Helps")).toEqual([]);
	});

	it("returns empty slot keys for Navbar (array + object fields, not slots)", () => {
		const slots = identifySlots(navbarConfig);
		expect(slots.get("Navbar")).toEqual([]);
	});

	it("returns empty slot keys for LogoClouds (no slots)", () => {
		const slots = identifySlots(logoCloudsConfig);
		expect(slots.get("LogoClouds")).toEqual([]);
	});

	it("returns empty slot keys for Statistics (no slots)", () => {
		const slots = identifySlots(statisticsConfig);
		expect(slots.get("Statistics")).toEqual([]);
	});

	it("returns empty slot keys for PricingMinimal (nested arrays, not slots)", () => {
		const slots = identifySlots(pricingMinimalConfig);
		expect(slots.get("PricingMinimal")).toEqual([]);
	});

	it("returns empty slot keys for BlogList (array fields, not slots)", () => {
		const slots = identifySlots(blogListConfig);
		expect(slots.get("BlogList")).toEqual([]);
	});

	// ----- Synthetic configs with actual slot fields -----

	it("detects a single slot field", () => {
		const config: Config = {
			components: {
				Layout: {
					render: noop,
					fields: {
						title: { type: "text" },
						content: { type: "slot" },
					},
				},
			},
		};

		const slots = identifySlots(config);
		expect(slots.get("Layout")).toEqual(["content"]);
	});

	it("detects multiple slot fields and returns them sorted", () => {
		const config: Config = {
			components: {
				Page: {
					render: noop,
					fields: {
						title: { type: "text" },
						sidebar: { type: "slot" },
						main: { type: "slot" },
						footer: { type: "slot" },
					},
				},
			},
		};

		const slots = identifySlots(config);
		expect(slots.get("Page")).toEqual(["footer", "main", "sidebar"]);
	});

	it("handles multiple components with mixed slot/non-slot fields", () => {
		const config: Config = {
			components: {
				Layout: {
					render: noop,
					fields: {
						body: { type: "slot" },
					},
				},
				Card: {
					render: noop,
					fields: {
						title: { type: "text" },
					},
				},
			},
		};

		const slots = identifySlots(config);
		expect(slots.get("Layout")).toEqual(["body"]);
		expect(slots.get("Card")).toEqual([]);
	});

	it("handles config with no components", () => {
		const config: Config = { components: {} };
		const slots = identifySlots(config);
		expect(slots.size).toBe(0);
	});

	it("handles component with no fields", () => {
		const config: Config = {
			components: {
				Empty: { render: noop },
			},
		};
		const slots = identifySlots(config);
		expect(slots.get("Empty")).toEqual([]);
	});

	it("includes all components in the result map", () => {
		const config: Config = {
			components: {
				A: { render: noop, fields: { slot: { type: "slot" } } },
				B: { render: noop, fields: { text: { type: "text" } } },
				C: { render: noop },
			},
		};

		const slots = identifySlots(config);
		expect(slots.size).toBe(3);
		expect([...slots.keys()].sort()).toEqual(["A", "B", "C"]);
	});
});
