import type { PageIRNode } from "@anvilkit/core/types";
import type { Config } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import { configToAiSectionContext } from "../section.js";

const noop = (() => null) as unknown as Config["components"][string]["render"];

const heroNode: PageIRNode = {
	id: "Hero-abc",
	type: "Hero",
	props: { title: "Old title" },
};

function buildConfig(): Config {
	return {
		components: {
			Hero: {
				render: noop,
				fields: { title: { type: "text" } },
				metadata: { description: "A hero banner" },
			} as Config["components"][string],
			Pricing: {
				render: noop,
				fields: { plans: { type: "number" } },
			},
			Layout: {
				render: noop,
				fields: {
					content: {
						type: "slot",
						allow: ["Hero", "Pricing"],
					},
				},
			},
			Forbidden: {
				render: noop,
				fields: { x: { type: "text" } },
			},
		},
	};
}

describe("configToAiSectionContext", () => {
	describe("zone shape: root", () => {
		it("returns every registered component when allow/disallow are absent", () => {
			const ctx = configToAiSectionContext(buildConfig(), {
				zoneId: "root-zone",
				nodeIds: ["Hero-abc"],
			});

			const names = ctx.availableComponents.map((c) => c.componentName);
			expect(names).toEqual(["Forbidden", "Hero", "Layout", "Pricing"]);
			expect(ctx.zoneId).toBe("root-zone");
			expect(ctx.zoneKind).toBeUndefined();
			expect(ctx.allowResize).toBe(false);
		});

		it("preserves selection nodeIds order", () => {
			const ctx = configToAiSectionContext(buildConfig(), {
				zoneId: "root-zone",
				nodeIds: ["Hero-abc", "Pricing-def", "Hero-ghi"],
			});
			expect(ctx.nodeIds).toEqual(["Hero-abc", "Pricing-def", "Hero-ghi"]);
		});
	});

	describe("zone shape: nested (legacy data.zones)", () => {
		it("forwards zoneKind 'zone' and keeps the full registered set", () => {
			const ctx = configToAiSectionContext(buildConfig(), {
				zoneId: "Layout-xyz:content",
				nodeIds: ["Hero-abc"],
				zoneKind: "zone",
			});

			expect(ctx.zoneKind).toBe("zone");
			expect(ctx.zoneId).toBe("Layout-xyz:content");
			expect(ctx.availableComponents).toHaveLength(4);
		});
	});

	describe("zone shape: slot-bearing", () => {
		it("narrows availableComponents to the slot's allow list", () => {
			const ctx = configToAiSectionContext(buildConfig(), {
				zoneId: "Layout-xyz:content",
				nodeIds: ["Hero-abc"],
				zoneKind: "slot",
				allow: ["Hero", "Pricing"],
			});

			const names = ctx.availableComponents.map((c) => c.componentName);
			expect(names).toEqual(["Hero", "Pricing"]);
			expect(ctx.zoneKind).toBe("slot");
		});

		it("subtracts disallow entries from the allow list", () => {
			const ctx = configToAiSectionContext(buildConfig(), {
				zoneId: "Layout-xyz:content",
				nodeIds: ["Hero-abc"],
				zoneKind: "slot",
				allow: ["Hero", "Pricing"],
				disallow: ["Pricing"],
			});

			const names = ctx.availableComponents.map((c) => c.componentName);
			expect(names).toEqual(["Hero"]);
		});

		it("subtracts disallow entries from the full registered set when allow is absent", () => {
			const ctx = configToAiSectionContext(buildConfig(), {
				zoneId: "root-zone",
				nodeIds: ["Hero-abc"],
				disallow: ["Forbidden"],
			});

			const names = ctx.availableComponents.map((c) => c.componentName);
			expect(names).toEqual(["Hero", "Layout", "Pricing"]);
		});
	});

	describe("input validation", () => {
		it("throws when nodeIds is empty", () => {
			expect(() =>
				configToAiSectionContext(buildConfig(), {
					zoneId: "root-zone",
					nodeIds: [],
				}),
			).toThrow(/selection\.nodeIds must contain at least one id/);
		});

		it("throws when allow references an unregistered component", () => {
			expect(() =>
				configToAiSectionContext(buildConfig(), {
					zoneId: "Layout-xyz:content",
					nodeIds: ["Hero-abc"],
					allow: ["Hero", "Mystery"],
				}),
			).toThrow(/Mystery/);
		});
	});

	describe("optional forwarding", () => {
		it("forwards currentNodes verbatim", () => {
			const ctx = configToAiSectionContext(buildConfig(), {
				zoneId: "root-zone",
				nodeIds: ["Hero-abc"],
				currentNodes: [heroNode],
			});
			expect(ctx.currentNodes).toEqual([heroNode]);
		});

		it("forwards theme and locale options", () => {
			const ctx = configToAiSectionContext(
				buildConfig(),
				{
					zoneId: "root-zone",
					nodeIds: ["Hero-abc"],
				},
				{ theme: "dark", locale: "fr-FR" },
			);
			expect(ctx.theme).toBe("dark");
			expect(ctx.locale).toBe("fr-FR");
		});

		it("sets allowResize when the option is true", () => {
			const ctx = configToAiSectionContext(
				buildConfig(),
				{
					zoneId: "root-zone",
					nodeIds: ["Hero-abc"],
				},
				{ allowResize: true },
			);
			expect(ctx.allowResize).toBe(true);
		});

		it("omits optional keys when no inputs supplied", () => {
			const ctx = configToAiSectionContext(buildConfig(), {
				zoneId: "root-zone",
				nodeIds: ["Hero-abc"],
			});
			expect(ctx).not.toHaveProperty("zoneKind");
			expect(ctx).not.toHaveProperty("currentNodes");
			expect(ctx).not.toHaveProperty("theme");
			expect(ctx).not.toHaveProperty("locale");
		});
	});

	describe("serializability + determinism", () => {
		it("returns a JSON-serializable object", () => {
			const ctx = configToAiSectionContext(buildConfig(), {
				zoneId: "Layout-xyz:content",
				nodeIds: ["Hero-abc"],
				zoneKind: "slot",
				allow: ["Hero", "Pricing"],
				currentNodes: [heroNode],
			});
			const roundTripped = JSON.parse(JSON.stringify(ctx));
			expect(roundTripped).toEqual(ctx);
		});

		it("produces deterministic output across calls", () => {
			const a = JSON.stringify(
				configToAiSectionContext(buildConfig(), {
					zoneId: "root-zone",
					nodeIds: ["Hero-abc"],
				}),
			);
			const b = JSON.stringify(
				configToAiSectionContext(buildConfig(), {
					zoneId: "root-zone",
					nodeIds: ["Hero-abc"],
				}),
			);
			expect(a).toBe(b);
		});
	});
});
