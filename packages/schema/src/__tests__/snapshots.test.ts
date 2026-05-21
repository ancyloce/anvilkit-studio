import { describe, expect, it } from "vitest";
import { configToAiContext } from "../config-to-ai-context.js";
import { bentoGrid } from "./__snapshots__/bento-grid.snap.js";
import { blogList } from "./__snapshots__/blog-list.snap.js";
import { helps } from "./__snapshots__/helps.snap.js";
import { hero } from "./__snapshots__/hero.snap.js";
import { logoClouds } from "./__snapshots__/logo-clouds.snap.js";
import { navbar } from "./__snapshots__/navbar.snap.js";
import { pricingMinimal } from "./__snapshots__/pricing-minimal.snap.js";
import { section } from "./__snapshots__/section.snap.js";
import { statistics } from "./__snapshots__/statistics.snap.js";
import { demoConfig } from "./fixtures/demo-config.js";

const ctx = configToAiContext(demoConfig);

function findComponent(name: string) {
	return ctx.availableComponents.find((c) => c.componentName === name);
}

describe("AI context snapshots", () => {
	it("produces exactly 9 components", () => {
		expect(ctx.availableComponents).toHaveLength(9);
	});

	it("BentoGrid matches snapshot", () => {
		expect(findComponent("BentoGrid")).toEqual(bentoGrid);
	});

	it("BlogList matches snapshot", () => {
		expect(findComponent("BlogList")).toEqual(blogList);
	});

	it("Helps matches snapshot", () => {
		expect(findComponent("Helps")).toEqual(helps);
	});

	it("Hero matches snapshot", () => {
		expect(findComponent("Hero")).toEqual(hero);
	});

	it("LogoClouds matches snapshot", () => {
		expect(findComponent("LogoClouds")).toEqual(logoClouds);
	});

	it("Navbar matches snapshot", () => {
		expect(findComponent("Navbar")).toEqual(navbar);
	});

	it("PricingMinimal matches snapshot", () => {
		expect(findComponent("PricingMinimal")).toEqual(pricingMinimal);
	});

	it("Section matches snapshot", () => {
		expect(findComponent("Section")).toEqual(section);
	});

	it("Statistics matches snapshot", () => {
		expect(findComponent("Statistics")).toEqual(statistics);
	});

	it("running twice produces identical output", () => {
		const ctx2 = configToAiContext(demoConfig);
		expect(JSON.stringify(ctx)).toBe(JSON.stringify(ctx2));
	});
});
