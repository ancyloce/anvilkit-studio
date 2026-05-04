/**
 * @file Tests for the Puck-Config → componentName→category reverse index.
 */

import type { Config as PuckConfig } from "@puckeditor/core";
import { describe, expect, it } from "vitest";

import {
	buildComponentCategoryIndex,
	getComponentCategory,
} from "../component-category-index.js";

function fakeConfig(
	categories: PuckConfig["categories"],
): PuckConfig {
	return {
		categories,
		components: {},
	} as unknown as PuckConfig;
}

describe("buildComponentCategoryIndex", () => {
	it("returns an empty map when the config has no categories", () => {
		const index = buildComponentCategoryIndex(fakeConfig(undefined));
		expect(index.size).toBe(0);
	});

	it("returns an empty map when config is undefined", () => {
		const index = buildComponentCategoryIndex(undefined);
		expect(index.size).toBe(0);
	});

	it("flattens components from each category into the reverse map", () => {
		const index = buildComponentCategoryIndex(
			fakeConfig({
				navigation: { components: ["Navbar"] },
				marketing: { components: ["Hero", "BentoGrid"] },
				actions: { components: ["Button"] },
			}),
		);
		expect(index.get("Navbar")).toBe("navigation");
		expect(index.get("Hero")).toBe("marketing");
		expect(index.get("BentoGrid")).toBe("marketing");
		expect(index.get("Button")).toBe("actions");
	});

	it("first declaring category wins when a component appears in multiple categories", () => {
		const index = buildComponentCategoryIndex(
			fakeConfig({
				marketing: { components: ["Card"] },
				navigation: { components: ["Card"] },
			}),
		);
		expect(index.get("Card")).toBe("marketing");
	});

	it("ignores categories whose components list is undefined", () => {
		const index = buildComponentCategoryIndex(
			fakeConfig({
				navigation: { components: ["Navbar"] },
				orphans: { title: "no components here" },
			}),
		);
		expect(index.get("Navbar")).toBe("navigation");
		expect(index.size).toBe(1);
	});
});

describe("getComponentCategory", () => {
	it("returns the mapped category", () => {
		const index = buildComponentCategoryIndex(
			fakeConfig({ navigation: { components: ["Navbar"] } }),
		);
		expect(getComponentCategory(index, "Navbar")).toBe("navigation");
	});

	it("returns undefined for unknown components", () => {
		const index = buildComponentCategoryIndex(
			fakeConfig({ navigation: { components: ["Navbar"] } }),
		);
		expect(getComponentCategory(index, "Unknown")).toBeUndefined();
	});
});
