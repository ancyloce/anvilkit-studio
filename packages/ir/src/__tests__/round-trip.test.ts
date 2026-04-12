import { describe, expect, it } from "vitest";
import { irToPuckData } from "../ir-to-puck-data.js";
import { puckDataToIR } from "../puck-data-to-ir.js";
import { allDemoFixtures } from "./fixtures/demo-fixtures.js";

const FIXED_CLOCK = () => new Date("2026-04-11T00:00:00.000Z");

describe("round-trip: irToPuckData(puckDataToIR(d)) ≡ d", () => {
	for (const { name, data, config } of allDemoFixtures) {
		it(`round-trips ${name}`, () => {
			const ir = puckDataToIR(data, config, { now: FIXED_CLOCK });
			const roundTripped = irToPuckData(ir);
			expect(roundTripped).toEqual(data);
		});
	}

	it("produces byte-identical IR across two runs", () => {
		for (const { data, config } of allDemoFixtures) {
			const ir1 = puckDataToIR(data, config, { now: FIXED_CLOCK });
			const ir2 = puckDataToIR(data, config, { now: FIXED_CLOCK });
			expect(JSON.stringify(ir1)).toBe(JSON.stringify(ir2));
		}
	});
});
