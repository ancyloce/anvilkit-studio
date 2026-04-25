import type { Config, Data } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import { puckDataToIR } from "../puck-data-to-ir.js";
import { allDemoFixtures } from "./fixtures/demo-fixtures.js";

const FIXED_CLOCK = () => new Date("2026-04-11T00:00:00.000Z");
const noop = (() => null) as unknown as Config["components"][string]["render"];

describe("canonical form", () => {
	it("props keys are sorted alphabetically for all demo fixtures", () => {
		for (const { name, data, config } of allDemoFixtures) {
			const ir = puckDataToIR(data, config, { now: FIXED_CLOCK });

			for (const child of ir.root.children ?? []) {
				const keys = Object.keys(child.props);
				const sorted = [...keys].sort();
				expect(keys, `${name}: props keys should be sorted`).toEqual(sorted);
			}
		}
	});

	it("strips undefined values from props", () => {
		const data: Data = {
			root: {},
			content: [
				{
					type: "Test",
					props: {
						id: "test-1",
						keep: "hello",
						drop: undefined,
					} as Record<string, unknown> & { id: string },
				},
			],
		};
		const config: Config = {
			components: {
				Test: { render: noop, fields: { keep: { type: "text" } } },
			},
		};

		const ir = puckDataToIR(data, config, { now: FIXED_CLOCK });
		const node = ir.root.children![0]!;

		expect(node.props).toEqual({ keep: "hello" });
		expect("drop" in node.props).toBe(false);
	});

	it("drops function-valued props and emits a warning", () => {
		const data: Data = {
			root: {},
			content: [
				{
					type: "Test",
					props: {
						id: "test-1",
						label: "ok",
						onClick: () => {
							/* intentionally empty for test */
						},
					} as Record<string, unknown> & { id: string },
				},
			],
		};
		const config: Config = {
			components: {
				Test: {
					render: noop,
					fields: { label: { type: "text" } },
				},
			},
		};

		const warnings: unknown[] = [];
		const ir = puckDataToIR(data, config, {
			now: FIXED_CLOCK,
			onWarning: (w) => warnings.push(w),
		});

		const node = ir.root.children![0]!;
		expect(node.props).toEqual({ label: "ok" });
		expect("onClick" in node.props).toBe(false);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toMatchObject({
			code: "FUNCTION_PROP_DROPPED",
		});
	});

	it("coerces Date instances to ISO strings", () => {
		const data: Data = {
			root: {},
			content: [
				{
					type: "Test",
					props: {
						id: "test-1",
						createdAt: new Date("2025-01-15T12:00:00.000Z"),
					} as Record<string, unknown> & { id: string },
				},
			],
		};
		const config: Config = {
			components: {
				Test: { render: noop, fields: {} },
			},
		};

		const ir = puckDataToIR(data, config, { now: FIXED_CLOCK });
		const node = ir.root.children![0]!;
		expect(node.props.createdAt).toBe("2025-01-15T12:00:00.000Z");
	});

	it("canonicalizes nested arrays and objects into serializable props", () => {
		const data: Data = {
			root: {},
			content: [
				{
					type: "Test",
					props: {
						id: "test-1",
						cards: [
							{
								z: 3,
								onClick: () => {
									/* intentionally empty for test */
								},
								startsAt: new Date("2025-02-01T12:00:00.000Z"),
								drop: undefined,
								nested: { b: 2, a: 1 },
							},
						],
						items: [
							undefined,
							() => {
								/* intentionally empty for test */
							},
							"keep",
						],
					} as Record<string, unknown> & { id: string },
				},
			],
		};
		const config: Config = {
			components: {
				Test: { render: noop, fields: {} },
			},
		};
		const warnings: unknown[] = [];

		const ir = puckDataToIR(data, config, {
			now: FIXED_CLOCK,
			onWarning: (w) => warnings.push(w),
		});
		const node = ir.root.children![0]!;

		expect(node.props).toEqual({
			cards: [
				{
					nested: { a: 1, b: 2 },
					startsAt: "2025-02-01T12:00:00.000Z",
					z: 3,
				},
			],
			items: ["keep"],
		});
		expect(
			Object.keys(
				((node.props.cards as Record<string, unknown>[])[0]!.nested ??
					{}) as Record<string, unknown>,
			),
		).toEqual(["a", "b"]);
		expect(JSON.parse(JSON.stringify(node.props))).toEqual(node.props);
		expect(warnings).toHaveLength(2);
		expect(warnings).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: "FUNCTION_PROP_DROPPED",
					message: expect.stringContaining("cards[0].onClick"),
				}),
				expect.objectContaining({
					code: "FUNCTION_PROP_DROPPED",
					message: expect.stringContaining("items[1]"),
				}),
			]),
		);
	});

	it("drops circular props with a path-aware warning", () => {
		const circular: Record<string, unknown> = { label: "ok" };
		circular.self = circular;
		const data: Data = {
			root: {},
			content: [
				{
					type: "Test",
					props: {
						id: "test-1",
						circular,
					} as Record<string, unknown> & { id: string },
				},
			],
		};
		const config: Config = {
			components: {
				Test: { render: noop, fields: {} },
			},
		};
		const warnings: unknown[] = [];

		const ir = puckDataToIR(data, config, {
			now: FIXED_CLOCK,
			onWarning: (w) => warnings.push(w),
		});
		const node = ir.root.children![0]!;

		expect(node.props).toEqual({ circular: { label: "ok" } });
		expect(warnings).toEqual([
			expect.objectContaining({
				code: "CIRCULAR_PROP_DROPPED",
				message: expect.stringContaining("circular.self"),
			}),
		]);
	});

	it("output IR is deeply frozen", () => {
		for (const { data, config } of allDemoFixtures) {
			const ir = puckDataToIR(data, config, { now: FIXED_CLOCK });

			expect(Object.isFrozen(ir)).toBe(true);
			expect(Object.isFrozen(ir.root)).toBe(true);
			expect(Object.isFrozen(ir.root.props)).toBe(true);
			expect(Object.isFrozen(ir.metadata)).toBe(true);
			expect(Object.isFrozen(ir.assets)).toBe(true);

			if (ir.root.children) {
				expect(Object.isFrozen(ir.root.children)).toBe(true);
				for (const child of ir.root.children) {
					expect(Object.isFrozen(child)).toBe(true);
					expect(Object.isFrozen(child.props)).toBe(true);
				}
			}
		}
	});
});
