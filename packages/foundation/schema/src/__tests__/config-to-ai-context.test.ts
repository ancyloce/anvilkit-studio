import type { Config } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import { configToAiContext } from "../config-to-ai-context.js";

const noop = (() => null) as unknown as Config["components"][string]["render"];

describe("configToAiContext", () => {
	it("returns availableComponents sorted by componentName", () => {
		const config: Config = {
			components: {
				Zebra: { render: noop, fields: { name: { type: "text" } } },
				Alpha: { render: noop, fields: { name: { type: "text" } } },
				Middle: { render: noop, fields: { name: { type: "text" } } },
			},
		};
		const ctx = configToAiContext(config);
		const names = ctx.availableComponents.map((c) => c.componentName);
		expect(names).toEqual(["Alpha", "Middle", "Zebra"]);
	});

	it("extracts fields sorted by field name", () => {
		const config: Config = {
			components: {
				Test: {
					render: noop,
					fields: {
						zebra: { type: "text" },
						alpha: { type: "number" },
						middle: { type: "text" },
					},
				},
			},
		};
		const ctx = configToAiContext(config);
		const fieldNames = ctx.availableComponents[0].fields.map((f) => f.name);
		expect(fieldNames).toEqual(["alpha", "middle", "zebra"]);
	});

	it("propagates metadata.description", () => {
		const config: Config = {
			components: {
				Hero: {
					render: noop,
					fields: { title: { type: "text" } },
					metadata: { description: "A hero banner" },
				} as Config["components"][string],
			},
		};
		const ctx = configToAiContext(config);
		expect(ctx.availableComponents[0].description).toBe("A hero banner");
	});

	it("defaults description to empty string when metadata is absent", () => {
		const config: Config = {
			components: {
				Hero: { render: noop, fields: { title: { type: "text" } } },
			},
		};
		const ctx = configToAiContext(config);
		expect(ctx.availableComponents[0].description).toBe("");
	});

	it("respects include option to whitelist components", () => {
		const config: Config = {
			components: {
				Hero: { render: noop, fields: { title: { type: "text" } } },
				Section: { render: noop, fields: { title: { type: "text" } } },
				Footer: { render: noop, fields: { title: { type: "text" } } },
			},
		};
		const ctx = configToAiContext(config, { include: ["Hero", "Footer"] });
		const names = ctx.availableComponents.map((c) => c.componentName);
		expect(names).toEqual(["Footer", "Hero"]);
	});

	it("throws when include references components not present in the config", () => {
		const config: Config = {
			components: {
				Hero: { render: noop, fields: { title: { type: "text" } } },
			},
		};
		expect(() =>
			configToAiContext(config, { include: ["Hero", "Heroo"] }),
		).toThrow(/Heroo/);
	});

	it("handles single-component config", () => {
		const config: Config = {
			components: {
				Button: { render: noop, fields: { label: { type: "text" } } },
			},
		};
		const ctx = configToAiContext(config);
		expect(ctx.availableComponents).toHaveLength(1);
		expect(ctx.availableComponents[0].componentName).toBe("Button");
		expect(ctx.availableComponents[0].fields).toHaveLength(1);
	});

	it("handles empty config", () => {
		const config: Config = { components: {} };
		const ctx = configToAiContext(config);
		expect(ctx.availableComponents).toHaveLength(0);
	});

	it("maps slot fields to type object with structured allow list", () => {
		const config: Config = {
			components: {
				Layout: {
					render: noop,
					fields: {
						content: { type: "slot", allow: ["Hero", "Button"] },
					},
				},
			},
		};
		const ctx = configToAiContext(config);
		const field = ctx.availableComponents[0].fields[0];
		expect(field.type).toBe("object");
		expect(field.description).toContain("Slot");
		expect(field.allow).toEqual(["Hero", "Button"]);
	});

	it("maps array fields correctly", () => {
		const config: Config = {
			components: {
				List: {
					render: noop,
					fields: {
						items: {
							type: "array",
							arrayFields: {
								label: { type: "text" },
							},
						},
					} as Config["components"][string]["fields"],
				},
			},
		};
		const ctx = configToAiContext(config);
		const field = ctx.availableComponents[0].fields[0];
		expect(field.type).toBe("array");
		expect(field.itemSchema).toBeDefined();
	});

	it("maps select fields with options", () => {
		const config: Config = {
			components: {
				Card: {
					render: noop,
					fields: {
						variant: {
							type: "select",
							options: [
								{ label: "Primary", value: "primary" },
								{ label: "Secondary", value: "secondary" },
							],
						},
					},
				},
			},
		};
		const ctx = configToAiContext(config);
		const field = ctx.availableComponents[0].fields[0];
		expect(field.type).toBe("select");
		expect(field.options).toEqual([
			{ label: "Primary", value: "primary" },
			{ label: "Secondary", value: "secondary" },
		]);
	});

	it("handles unknown field type as text fallback", () => {
		const config: Config = {
			components: {
				Widget: {
					render: noop,
					fields: {
						mystery: {
							type: "magic",
						} as unknown as Config["components"][string]["fields"][string],
					},
				},
			},
		};
		const ctx = configToAiContext(config);
		const field = ctx.availableComponents[0].fields[0];
		expect(field.type).toBe("text");
	});

	it("produces deterministic output across multiple calls", () => {
		const config: Config = {
			components: {
				Zebra: {
					render: noop,
					fields: { b: { type: "text" }, a: { type: "number" } },
				},
				Alpha: {
					render: noop,
					fields: { y: { type: "text" }, x: { type: "text" } },
				},
			},
		};
		const ctx1 = JSON.stringify(configToAiContext(config));
		const ctx2 = JSON.stringify(configToAiContext(config));
		expect(ctx1).toBe(ctx2);
	});

	it("returns only availableComponents (no currentData, theme, locale)", () => {
		const config: Config = {
			components: {
				Test: { render: noop, fields: { a: { type: "text" } } },
			},
		};
		const ctx = configToAiContext(config);
		expect(Object.keys(ctx)).toEqual(["availableComponents"]);
	});
});
