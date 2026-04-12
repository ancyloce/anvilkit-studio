import type { Config, Data } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import { puckDataToIR } from "../puck-data-to-ir.js";

const FIXED_CLOCK = () => new Date("2026-04-11T00:00:00.000Z");
const noop = (() => null) as unknown as Config["components"][string]["render"];

describe("puckDataToIR", () => {
	it("transforms empty data into a root-only IR", () => {
		const data: Data = { root: {}, content: [] };
		const config: Config = { components: {} };

		const ir = puckDataToIR(data, config, { now: FIXED_CLOCK });

		expect(ir.version).toBe("1");
		expect(ir.root.id).toBe("root");
		expect(ir.root.type).toBe("__root__");
		expect(ir.root.props).toEqual({});
		expect(ir.root.children).toBeUndefined();
		expect(ir.assets).toEqual([]);
		expect(ir.metadata.createdAt).toBe("2026-04-11T00:00:00.000Z");
	});

	it("maps a single-component document", () => {
		const data: Data = {
			root: {},
			content: [
				{
					type: "Hero",
					props: { id: "hero-1", headline: "Hello", description: "World" },
				},
			],
		};
		const config: Config = {
			components: {
				Hero: {
					render: noop,
					fields: {
						headline: { type: "text" },
						description: { type: "textarea" },
					},
				},
			},
		};

		const ir = puckDataToIR(data, config, { now: FIXED_CLOCK });

		expect(ir.root.children).toHaveLength(1);

		const node = ir.root.children![0]!;
		expect(node.id).toBe("hero-1");
		expect(node.type).toBe("Hero");
		expect(node.props).toEqual({
			description: "World",
			headline: "Hello",
		});
	});

	it("maps multiple components preserving order", () => {
		const data: Data = {
			root: {},
			content: [
				{ type: "A", props: { id: "a-1", x: 1 } },
				{ type: "B", props: { id: "b-1", y: 2 } },
				{ type: "C", props: { id: "c-1", z: 3 } },
			],
		};
		const config: Config = {
			components: {
				A: { render: noop, fields: {} },
				B: { render: noop, fields: {} },
				C: { render: noop, fields: {} },
			},
		};

		const ir = puckDataToIR(data, config, { now: FIXED_CLOCK });

		expect(ir.root.children).toHaveLength(3);
		expect(ir.root.children!.map((c) => c.type)).toEqual(["A", "B", "C"]);
	});

	it("preserves root props when present", () => {
		const data: Data = {
			root: { props: { title: "My Page" } },
			content: [],
		} as unknown as Data;
		const config: Config = { components: {} };

		const ir = puckDataToIR(data, config, { now: FIXED_CLOCK });

		expect(ir.root.props).toEqual({ title: "My Page" });
	});

	it("uses the injected clock for metadata.createdAt", () => {
		const data: Data = { root: {}, content: [] };
		const config: Config = { components: {} };

		const custom = () => new Date("2000-01-01T00:00:00.000Z");
		const ir = puckDataToIR(data, config, { now: custom });

		expect(ir.metadata.createdAt).toBe("2000-01-01T00:00:00.000Z");
	});

	it("excludes id from root props even if present", () => {
		const data: Data = {
			root: { props: { id: "some-id", title: "Page" } },
			content: [],
		} as unknown as Data;
		const config: Config = { components: {} };

		const ir = puckDataToIR(data, config, { now: FIXED_CLOCK });

		expect(ir.root.id).toBe("root");
		expect("id" in ir.root.props).toBe(false);
		expect(ir.root.props).toEqual({ title: "Page" });
	});
});
