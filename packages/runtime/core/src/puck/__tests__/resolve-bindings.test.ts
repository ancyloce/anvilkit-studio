/**
 * @file P4-04 — `withBindingResolution` adapter suite (PLAN-0025
 * §9.4). Everything runs through Puck's official `resolveAllData`,
 * exactly as production does: bindings stored on node props take
 * effect via the wrapped `resolveData` hooks, the scope travels the
 * metadata channel (or defaults `page` to the document's root props),
 * and §5.1 carriers on untouched neighbors survive byte-equal.
 */

import type { Config, Data } from "@puckeditor/core";
import { resolveAllData } from "@puckeditor/core";
import { describe, expect, it, vi } from "vitest";
import {
	BINDING_SCOPE_METADATA_KEY,
	withBindingResolution,
} from "../resolve-bindings.js";

function baseConfig(): Config {
	return {
		components: {
			Card: { fields: {}, render: () => null },
			Derived: {
				fields: {},
				resolveData: (node: { props: Record<string, unknown> }) => ({
					props: {
						label: `${String(node.props.title)}-derived`,
						winner: "original",
					},
				}),
				render: () => null,
			},
		},
	} as unknown as Config;
}

const propBinding = (
	nodeId: string,
	path: readonly (string | number)[],
	root: "data" | "page",
	exprPath: readonly string[],
	fallback?: unknown,
) => ({
	version: "1",
	id: `b-${nodeId}-${path.join(".")}`,
	nodeId,
	target: { type: "prop", path },
	expression: { type: "path", root, path: exprPath },
	...(fallback === undefined ? {} : { fallback }),
});

const doc = (content: unknown[], rootProps: Record<string, unknown> = {}) =>
	({ content, root: { props: rootProps }, zones: {} }) as unknown as Data;

describe("withBindingResolution (P4-04, §9.4)", () => {
	it("applies a prop binding from the metadata-channel scope through resolveAllData", async () => {
		const config = withBindingResolution(baseConfig());
		const data = doc([
			{
				type: "Card",
				props: {
					id: "card-1",
					title: "authored",
					bindings: [propBinding("card-1", ["title"], "data", ["headline"])],
				},
			},
		]);
		const resolved = await resolveAllData(data, config, {
			[BINDING_SCOPE_METADATA_KEY]: { data: { headline: "Bound!" } },
		});
		expect(resolved.content[0]?.props.title).toBe("Bound!");
	});

	it("defaults the page scope root to the document's own root props", async () => {
		const config = withBindingResolution(baseConfig());
		const data = doc(
			[
				{
					type: "Card",
					props: {
						id: "card-1",
						title: "authored",
						bindings: [propBinding("card-1", ["title"], "page", ["title"])],
					},
				},
			],
			{ title: "Page title" },
		);
		const resolved = await resolveAllData(data, config);
		expect(resolved.content[0]?.props.title).toBe("Page title");
	});

	it("uses the fallback on a missing path and keeps the authored value without one", async () => {
		const config = withBindingResolution(baseConfig());
		const data = doc([
			{
				type: "Card",
				props: {
					id: "card-1",
					title: "authored",
					subtitle: "kept",
					bindings: [
						propBinding("card-1", ["title"], "data", ["missing"], "fell-back"),
						propBinding("card-1", ["subtitle"], "data", ["also-missing"]),
					],
				},
			},
		]);
		const resolved = await resolveAllData(data, config, {
			[BINDING_SCOPE_METADATA_KEY]: { data: {} },
		});
		expect(resolved.content[0]?.props.title).toBe("fell-back");
		expect(resolved.content[0]?.props.subtitle).toBe("kept");
	});

	it("hides via the root target on a false visibility condition; indeterminate stays visible", async () => {
		const config = withBindingResolution(baseConfig());
		const data = doc([
			{
				type: "Card",
				props: {
					id: "hide-me",
					bindings: [
						{
							version: "1",
							id: "b-vis",
							nodeId: "hide-me",
							target: { type: "visibility" },
							expression: { type: "literal", value: false },
						},
					],
				},
			},
			{
				type: "Card",
				props: {
					id: "keep-me",
					bindings: [
						{
							version: "1",
							id: "b-vis-2",
							nodeId: "keep-me",
							target: { type: "visibility" },
							expression: { type: "path", root: "data", path: ["absent"] },
						},
					],
				},
			},
		]);
		const resolved = await resolveAllData(data, config);
		expect(resolved.content[0]?.props.appearance).toEqual({
			version: "1",
			targets: { root: { hidden: { base: true } } },
		});
		expect(resolved.content[1]?.props.appearance).toBeUndefined();
	});

	it("refuses reserved and prototype-chain write paths", async () => {
		const config = withBindingResolution(baseConfig());
		const appearance = {
			version: "1",
			targets: { root: { style: { base: { layout: { display: "flex" } } } } },
		};
		const data = doc([
			{
				type: "Card",
				props: {
					id: "card-1",
					title: "authored",
					appearance,
					bindings: [
						propBinding("card-1", ["appearance"], "data", ["headline"]),
						propBinding("card-1", ["nested", "__proto__", "x"], "data", [
							"headline",
						]),
					],
				},
			},
		]);
		const resolved = await resolveAllData(data, config, {
			[BINDING_SCOPE_METADATA_KEY]: { data: { headline: "evil" } },
		});
		expect(resolved.content[0]?.props.appearance).toEqual(appearance);
		expect(resolved.content[0]?.props.nested).toBeUndefined();
	});

	it("preserves §5.1 carriers on untouched neighbor nodes", async () => {
		const config = withBindingResolution(baseConfig());
		const neighborAppearance = {
			version: "1",
			targets: { root: { style: { base: { visual: { opacity: 0.5 } } } } },
		};
		const data = doc([
			{
				type: "Card",
				props: {
					id: "bound",
					title: "authored",
					bindings: [propBinding("bound", ["title"], "data", ["headline"])],
				},
			},
			{
				type: "Card",
				props: {
					id: "neighbor",
					appearance: neighborAppearance,
					interactions: [{ version: "1", id: "i-1" }],
				},
			},
		]);
		const resolved = await resolveAllData(data, config, {
			[BINDING_SCOPE_METADATA_KEY]: { data: { headline: "Bound!" } },
		});
		expect(resolved.content[1]?.props.appearance).toEqual(neighborAppearance);
		expect(resolved.content[1]?.props.interactions).toEqual([
			{ version: "1", id: "i-1" },
		]);
	});

	it("chains a component's own resolveData after bindings; its props win on conflict", async () => {
		const config = withBindingResolution(baseConfig());
		const data = doc([
			{
				type: "Derived",
				props: {
					id: "d-1",
					title: "authored",
					winner: "authored",
					bindings: [
						propBinding("d-1", ["title"], "data", ["headline"]),
						propBinding("d-1", ["winner"], "data", ["headline"]),
					],
				},
			},
		]);
		const resolved = await resolveAllData(data, config, {
			[BINDING_SCOPE_METADATA_KEY]: { data: { headline: "Bound!" } },
		});
		// The original hook observed the BOUND title…
		expect(resolved.content[0]?.props.label).toBe("Bound!-derived");
		// …and its own output overrides the binding on conflict.
		expect(resolved.content[0]?.props.winner).toBe("original");
	});

	it("wraps idempotently: double-wrapping never chains hooks twice", async () => {
		const spy = vi.fn((node: { props: Record<string, unknown> }) => ({
			props: { label: `${String(node.props.title)}-derived` },
		}));
		const config = {
			components: {
				Derived: { fields: {}, resolveData: spy, render: () => null },
			},
		} as unknown as Config;
		const wrappedTwice = withBindingResolution(withBindingResolution(config));
		const data = doc([{ type: "Derived", props: { id: "d-1", title: "t" } }]);
		await resolveAllData(data, wrappedTwice);
		expect(spy).toHaveBeenCalledTimes(1);
	});
});
