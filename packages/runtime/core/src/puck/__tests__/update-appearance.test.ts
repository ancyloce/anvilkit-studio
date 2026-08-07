/**
 * @file P2-04 — `updateAppearanceInData` pure-function coverage
 * (§14.1 rows): input immutability, one atomic multi-selection update,
 * allowlist rejection before writing, no-op detection, canonical
 * removal of empty values, breakpoint-layer writes and removals, slot
 * traversal, and refusal to overwrite invalid existing appearance.
 */

import type { Config, Data } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import { updateAppearanceInData } from "../update-appearance.js";

const config: Config = {
	components: {
		Box: {
			fields: { body: { type: "slot" } },
			metadata: {
				anvilkit: {
					editor: {
						version: "2",
						styleTargets: {
							root: {
								label: "Box",
								responsive: true,
								properties: ["display", "gap", "opacity"],
							},
						},
					},
				},
			},
			render: () => null,
		},
		Plain: { fields: {}, render: () => null },
	},
} as unknown as Config;

function docWith(
	nodes: readonly { id: string; type?: string; appearance?: unknown }[],
): Data {
	return {
		content: nodes.map((node) => ({
			type: node.type ?? "Box",
			props: {
				id: node.id,
				...(node.appearance !== undefined
					? { appearance: node.appearance }
					: {}),
			},
		})),
		root: {
			props: {
				designSystem: {
					breakpoints: [
						{ id: "bp-sm", label: "S", maxWidth: 640, order: 0, enabled: true },
					],
					tokens: {},
					tokenModes: { light: { id: "light", name: "Light" } },
					defaultTokenMode: "light",
					styleDefinitions: {},
				},
			},
		},
		zones: {},
	} as unknown as Data;
}

const displayFlex = {
	targets: { root: { style: { base: { layout: { display: "flex" } } } } },
};

function appearanceOf(data: Data, index: number): unknown {
	return (data as unknown as { content: { props: Record<string, unknown> }[] })
		.content[index]?.props.appearance;
}

describe("updateAppearanceInData (P2-04)", () => {
	it("writes one property at base for a single node", () => {
		const data = docWith([{ id: "a" }]);
		const result = updateAppearanceInData({
			data,
			config,
			nodeIds: ["a"],
			targetId: "root",
			layer: "base",
			patch: { kind: "set-property", property: "display", value: "flex" },
		});
		expect(result.status).toBe("updated");
		expect(result.changedNodeIds).toEqual(["a"]);
		expect(appearanceOf(result.data, 0)).toEqual(displayFlex);
	});

	it("never mutates its input", () => {
		const data = docWith([{ id: "a", appearance: displayFlex }]);
		const frozen = JSON.parse(JSON.stringify(data));
		updateAppearanceInData({
			data,
			config,
			nodeIds: ["a"],
			targetId: "root",
			layer: "base",
			patch: { kind: "set-property", property: "display", value: "grid" },
		});
		expect(data).toEqual(frozen);
	});

	it("multi-selection updates every capable node in ONE result", () => {
		const data = docWith([{ id: "a" }, { id: "b" }]);
		const result = updateAppearanceInData({
			data,
			config,
			nodeIds: ["a", "b"],
			targetId: "root",
			layer: "base",
			patch: { kind: "set-property", property: "display", value: "flex" },
		});
		expect(result.status).toBe("updated");
		expect(result.changedNodeIds).toEqual(["a", "b"]);
		expect(appearanceOf(result.data, 0)).toEqual(displayFlex);
		expect(appearanceOf(result.data, 1)).toEqual(displayFlex);
	});

	it("rejects the WHOLE intent when any node fails the allowlist — atomic multi-selection", () => {
		const data = docWith([{ id: "a" }, { id: "p", type: "Plain" }]);
		const result = updateAppearanceInData({
			data,
			config,
			nodeIds: ["a", "p"],
			targetId: "root",
			layer: "base",
			patch: { kind: "set-property", property: "display", value: "flex" },
		});
		expect(result.status).toBe("rejected");
		expect(result.data).toBe(data);
		expect(result.errors[0]?.code).toBe("EDITOR_CAPABILITY_UNSUPPORTED");
		expect(appearanceOf(result.data, 0)).toBeUndefined();
	});

	it("rejects an ungranted property with a structured error before writing", () => {
		const data = docWith([{ id: "a" }]);
		const result = updateAppearanceInData({
			data,
			config,
			nodeIds: ["a"],
			targetId: "root",
			layer: "base",
			patch: { kind: "set-property", property: "padding", value: {} },
		});
		expect(result.status).toBe("rejected");
		expect(result.errors[0]?.code).toBe("EDITOR_CAPABILITY_UNSUPPORTED");
	});

	it("rejects an unknown breakpoint layer", () => {
		const data = docWith([{ id: "a" }]);
		const result = updateAppearanceInData({
			data,
			config,
			nodeIds: ["a"],
			targetId: "root",
			layer: "bp-missing",
			patch: { kind: "set-property", property: "display", value: "flex" },
		});
		expect(result.status).toBe("rejected");
		expect(result.errors[0]?.code).toBe("EDITOR_BREAKPOINT_INVALID");
	});

	it("writing the current value is a noop returning the same reference", () => {
		const data = docWith([{ id: "a", appearance: displayFlex }]);
		const result = updateAppearanceInData({
			data,
			config,
			nodeIds: ["a"],
			targetId: "root",
			layer: "base",
			patch: { kind: "set-property", property: "display", value: "flex" },
		});
		expect(result.status).toBe("noop");
		expect(result.data).toBe(data);
	});

	it("removing the last property removes the whole appearance prop (canonicalization)", () => {
		const data = docWith([{ id: "a", appearance: displayFlex }]);
		const result = updateAppearanceInData({
			data,
			config,
			nodeIds: ["a"],
			targetId: "root",
			layer: "base",
			patch: { kind: "set-property", property: "display", value: undefined },
		});
		expect(result.status).toBe("updated");
		expect(appearanceOf(result.data, 0)).toBeUndefined();
		const props = (result.data as unknown as { content: { props: object }[] })
			.content[0]?.props;
		expect(Object.hasOwn(props as object, "appearance")).toBe(false);
	});

	it("writes and removes breakpoint overrides without touching base", () => {
		const data = docWith([{ id: "a", appearance: displayFlex }]);
		const written = updateAppearanceInData({
			data,
			config,
			nodeIds: ["a"],
			targetId: "root",
			layer: "bp-sm",
			patch: { kind: "set-property", property: "display", value: "block" },
		});
		expect(written.status).toBe("updated");
		expect(appearanceOf(written.data, 0)).toEqual({
			targets: {
				root: {
					style: {
						base: { layout: { display: "flex" } },
						overrides: { "bp-sm": { layout: { display: "block" } } },
					},
				},
			},
		});
		const removed = updateAppearanceInData({
			data: written.data,
			config,
			nodeIds: ["a"],
			targetId: "root",
			layer: "bp-sm",
			patch: { kind: "set-property", property: "display", value: undefined },
		});
		expect(removed.status).toBe("updated");
		expect(appearanceOf(removed.data, 0)).toEqual(displayFlex);
	});

	it("sets hidden and styleRefs through the same layered protocol", () => {
		const data = docWith([{ id: "a" }]);
		const hidden = updateAppearanceInData({
			data,
			config,
			nodeIds: ["a"],
			targetId: "root",
			layer: "base",
			patch: { kind: "set-hidden", value: true },
		});
		expect(hidden.status).toBe("updated");
		const refs = updateAppearanceInData({
			data: hidden.data,
			config,
			nodeIds: ["a"],
			targetId: "root",
			layer: "base",
			patch: { kind: "set-style-refs", value: ["card"] },
		});
		expect(refs.status).toBe("updated");
		expect(appearanceOf(refs.data, 0)).toEqual({
			targets: {
				root: { styleRefs: { base: ["card"] }, hidden: { base: true } },
			},
		});
	});

	it("updates nodes nested in slots through walkTree", () => {
		const data = {
			content: [
				{
					type: "Box",
					props: {
						id: "outer",
						body: [{ type: "Box", props: { id: "inner" } }],
					},
				},
			],
			root: { props: {} },
			zones: {},
		} as unknown as Data;
		const result = updateAppearanceInData({
			data,
			config,
			nodeIds: ["inner"],
			targetId: "root",
			layer: "base",
			patch: { kind: "set-property", property: "display", value: "grid" },
		});
		expect(result.status).toBe("updated");
		const outer = (
			result.data as unknown as {
				content: { props: { body: { props: Record<string, unknown> }[] } }[];
			}
		).content[0];
		expect(outer?.props.body[0]?.props.appearance).toEqual({
			targets: { root: { style: { base: { layout: { display: "grid" } } } } },
		});
	});

	it("preserves keys it does not understand instead of destroying them", () => {
		// PLAN-0026 §5: tolerance is generic unknown-key preservation, not
		// a version branch. A document written before the canonical rename
		// may carry a stale `version`; editing it must not silently drop
		// that, or any other key the current contract has no name for.
		const data = docWith([
			{ id: "a", appearance: { version: "999", garbage: true } },
		]);
		const result = updateAppearanceInData({
			data,
			config,
			nodeIds: ["a"],
			targetId: "root",
			layer: "base",
			patch: { kind: "set-property", property: "display", value: "flex" },
		});
		expect(result.status).toBe("updated");
		expect(appearanceOf(result.data, 0)).toEqual({
			version: "999",
			garbage: true,
			targets: { root: { style: { base: { layout: { display: "flex" } } } } },
		});
	});

	it("rejects an unknown node id", () => {
		const data = docWith([{ id: "a" }]);
		const result = updateAppearanceInData({
			data,
			config,
			nodeIds: ["ghost"],
			targetId: "root",
			layer: "base",
			patch: { kind: "set-property", property: "display", value: "flex" },
		});
		expect(result.status).toBe("rejected");
		expect(result.errors[0]?.code).toBe("EDITOR_NODE_NOT_FOUND");
	});
});
