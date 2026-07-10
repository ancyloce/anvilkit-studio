import type { ExportWarning } from "@anvilkit/contracts";
import type { Config, Data } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import { puckDataToIR } from "../puck-data-to-ir.js";

const FIXED_CLOCK = () => new Date("2026-04-11T00:00:00.000Z");
const noop = (() => null) as unknown as Config["components"][string]["render"];
const emptyConfig: Config = { components: {} };

describe("puckDataToIR — repair regressions", () => {
	it("treats a non-array data.content as empty and warns", () => {
		const warnings: ExportWarning[] = [];
		const data = { root: {}, content: "oops" } as unknown as Data;

		const ir = puckDataToIR(data, emptyConfig, {
			now: FIXED_CLOCK,
			onWarning: (w) => warnings.push(w),
		});

		expect(ir.root.children).toBeUndefined();
		expect(warnings.map((w) => w.code)).toContain("INVALID_CONTENT");
	});

	it("synthesizes a stable id and warns when props.id is missing", () => {
		const warnings: ExportWarning[] = [];
		const data: Data = {
			root: {},
			content: [
				{ type: "Hero", props: {} as { id: string } },
				{ type: "Hero", props: {} as { id: string } },
			],
		};

		const ir = puckDataToIR(data, emptyConfig, {
			now: FIXED_CLOCK,
			onWarning: (w) => warnings.push(w),
		});

		const ids = ir.root.children?.map((c) => c.id) ?? [];
		expect(ids).toEqual(["anvilkit-missing-id-0", "anvilkit-missing-id-1"]);
		expect(ids[0]).not.toBe(ids[1]);
		expect(warnings.filter((w) => w.code === "MISSING_NODE_ID")).toHaveLength(
			2,
		);
	});

	it("unifies node.assets ids with the explicit document manifest", () => {
		const url = "https://cdn.example.com/photo.png";
		const data = {
			root: {},
			content: [{ type: "Image", props: { id: "img-1", src: url } }],
			assets: [{ id: "explicit-photo", kind: "image", url }],
		} as unknown as Data;

		const ir = puckDataToIR(data, emptyConfig, { now: FIXED_CLOCK });

		const manifestEntry = ir.assets.find((a) => a.url === url);
		expect(manifestEntry?.id).toBe("explicit-photo");

		const nodeAsset = ir.root.children?.[0]?.assets?.find((a) => a.url === url);
		expect(nodeAsset?.id).toBe("explicit-photo");
		expect(nodeAsset?.id).toBe(manifestEntry?.id);
	});

	it("caps pathologically deep trees instead of overflowing the stack", () => {
		const config: Config = {
			components: {
				Box: { render: noop, fields: { items: { type: "slot" } } },
			},
		};

		// Build a slot chain far deeper than MAX_TREE_DEPTH (512).
		let leaf: Record<string, unknown> = { id: "box-deep", items: [] };
		for (let i = 0; i < 700; i += 1) {
			leaf = { id: `box-${i}`, items: [{ type: "Box", props: leaf }] };
		}
		const data: Data = {
			root: {},
			content: [{ type: "Box", props: leaf }],
		};

		const warnings: ExportWarning[] = [];
		expect(() =>
			puckDataToIR(data, config, {
				now: FIXED_CLOCK,
				onWarning: (w) => warnings.push(w),
			}),
		).not.toThrow();
		expect(warnings.some((w) => w.code === "MAX_DEPTH_EXCEEDED")).toBe(true);
	});
});
