import type { Config, Data } from "@puckeditor/core";
import { describe, expect, it, vi } from "vitest";
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
