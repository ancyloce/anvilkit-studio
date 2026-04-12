import { describe, expect, it } from "vitest";
import { puckDataToIR } from "../puck-data-to-ir.js";
import { bentoGrid } from "./__snapshots__/bento-grid.snap.js";
import { blogList } from "./__snapshots__/blog-list.snap.js";
import { helps } from "./__snapshots__/helps.snap.js";
import { hero } from "./__snapshots__/hero.snap.js";
import { logoClouds } from "./__snapshots__/logo-clouds.snap.js";
import { navbar } from "./__snapshots__/navbar.snap.js";
import { pricingMinimal } from "./__snapshots__/pricing-minimal.snap.js";
import { section } from "./__snapshots__/section.snap.js";
import { statistics } from "./__snapshots__/statistics.snap.js";
import { allDemoFixtures } from "./fixtures/demo-fixtures.js";

const FIXED_CLOCK = () => new Date("2026-04-11T00:00:00.000Z");

const snapshotMap: Record<string, unknown> = {
	Hero: hero,
	Section: section,
	BentoGrid: bentoGrid,
	Helps: helps,
	Navbar: navbar,
	LogoClouds: logoClouds,
	Statistics: statistics,
	PricingMinimal: pricingMinimal,
	BlogList: blogList,
};

describe("PageIR snapshots", () => {
	for (const { name, data, config } of allDemoFixtures) {
		it(`${name} matches committed snapshot`, () => {
			const ir = puckDataToIR(data, config, { now: FIXED_CLOCK });
			const snapshot = snapshotMap[name];
			expect(ir).toEqual(snapshot);
		});
	}

	it("all 9 demo components have committed snapshots", () => {
		expect(allDemoFixtures).toHaveLength(9);
		for (const { name } of allDemoFixtures) {
			expect(snapshotMap[name]).toBeDefined();
		}
	});

	it("running snapshots twice produces zero diff", () => {
		for (const { data, config } of allDemoFixtures) {
			const ir1 = puckDataToIR(data, config, { now: FIXED_CLOCK });
			const ir2 = puckDataToIR(data, config, { now: FIXED_CLOCK });
			expect(ir1).toEqual(ir2);
			// Byte-identical JSON
			expect(JSON.stringify(ir1)).toBe(JSON.stringify(ir2));
		}
	});
});
