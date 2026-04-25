import type { Config, Data } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import { irToPuckData } from "../ir-to-puck-data.js";
import { puckDataToIR } from "../puck-data-to-ir.js";
import { allDemoFixtures } from "./fixtures/demo-fixtures.js";

const FIXED_CLOCK = () => new Date("2026-04-11T00:00:00.000Z");
const noop = (() => null) as unknown as Config["components"][string]["render"];

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

	it("round-trips a component with one slot field", () => {
		const data: Data = {
			root: {},
			content: [
				{
					type: "Layout",
					props: {
						id: "layout-1",
						title: "Page",
						content: [
							{
								type: "Text",
								props: { id: "text-1", text: "Hello" },
							},
						],
					},
				},
			],
		};
		const config = slotConfig(["content"]);

		const ir = puckDataToIR(data, config, { now: FIXED_CLOCK });
		const layout = ir.root.children![0]!;

		expect(layout.props).toEqual({ title: "Page" });
		expect(layout.children).toHaveLength(1);
		expect(layout.children![0]).toMatchObject({
			id: "text-1",
			slot: "content",
			slotKind: "slot",
		});
		expect(irToPuckData(ir)).toEqual(data);
	});

	it("round-trips multiple named slot fields", () => {
		const data: Data = {
			root: {},
			content: [
				{
					type: "Layout",
					props: {
						id: "layout-1",
						main: [
							{
								type: "Text",
								props: { id: "main-1", text: "Main" },
							},
						],
						sidebar: [
							{
								type: "Text",
								props: { id: "side-1", text: "Side" },
							},
						],
					},
				},
			],
		};
		const config = slotConfig(["main", "sidebar"]);

		const ir = puckDataToIR(data, config, { now: FIXED_CLOCK });
		const layout = ir.root.children![0]!;

		expect(layout.children?.map((child) => child.slot)).toEqual([
			"main",
			"sidebar",
		]);
		expect(irToPuckData(ir)).toEqual(data);
	});

	it("round-trips nested slot fields", () => {
		const data: Data = {
			root: {},
			content: [
				{
					type: "Layout",
					props: {
						id: "layout-1",
						content: [
							{
								type: "Card",
								props: {
									id: "card-1",
									body: [
										{
											type: "Text",
											props: { id: "text-1", text: "Nested" },
										},
									],
								},
							},
						],
					},
				},
			],
		};
		const config: Config = {
			components: {
				Layout: {
					render: noop,
					fields: { content: { type: "slot" } },
				},
				Card: {
					render: noop,
					fields: { body: { type: "slot" } },
				},
				Text: {
					render: noop,
					fields: { text: { type: "text" } },
				},
			},
		};

		const ir = puckDataToIR(data, config, { now: FIXED_CLOCK });
		const card = ir.root.children![0]!.children![0]!;
		const text = card.children![0]!;

		expect(card).toMatchObject({ id: "card-1", slot: "content" });
		expect(text).toMatchObject({ id: "text-1", slot: "body" });
		expect(irToPuckData(ir)).toEqual(data);
	});

	it("round-trips legacy data.zones as zone children", () => {
		const data: Data = {
			root: {},
			content: [
				{
					type: "LegacyLayout",
					props: {
						id: "legacy-1",
						title: "Legacy",
					},
				},
			],
			zones: {
				"legacy-1:body": [
					{
						type: "Text",
						props: { id: "text-1", text: "From zone" },
					},
				],
			},
		};
		const config: Config = {
			components: {
				LegacyLayout: {
					render: noop,
					fields: { title: { type: "text" } },
				},
				Text: {
					render: noop,
					fields: { text: { type: "text" } },
				},
			},
		};

		const ir = puckDataToIR(data, config, { now: FIXED_CLOCK });
		const layout = ir.root.children![0]!;

		expect(layout.children![0]).toMatchObject({
			id: "text-1",
			slot: "body",
			slotKind: "zone",
		});
		expect(irToPuckData(ir)).toEqual(data);
	});
});

function slotConfig(slotKeys: readonly string[]): Config {
	return {
		components: {
			Layout: {
				render: noop,
				fields: Object.fromEntries(
					slotKeys.map((slotKey) => [slotKey, { type: "slot" }]),
				),
			},
			Text: {
				render: noop,
				fields: { text: { type: "text" } },
			},
		},
	} as Config;
}
