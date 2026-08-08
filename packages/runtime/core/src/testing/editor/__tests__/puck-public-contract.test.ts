/**
 * @file PLAN-0025 P0-02 — public Puck API contract tests.
 *
 * Locks the exact `@puckeditor/core@0.23.0` public surface the
 * Puck-native refactor (docs/plans/0025-puck-native-full-refactor-
 * development-plan.md §12 Phase 0) builds on: `walkTree` slot
 * traversal, `transformProps` with a Config third argument, `migrate`,
 * `resolveAllData`, the `setData` functional updater with
 * `recordHistory`, `CustomField.visible`, the composition components,
 * the selector hooks, and the iframe override / `syncHostStyles`
 * styling seam. A Puck upgrade that breaks any of these must fail
 * here, in one named test, before it breaks the editor.
 *
 * Type-level guarantees ride the same file: the typed constructs below
 * compile under `tsc --noEmit -p tsconfig.test.json`, so a removed or
 * reshaped public type fails the typecheck gate even where runtime
 * assertions cannot see it. Known erratum vs the plan's §5.3 sketch:
 * `CustomFieldRender` must return a `ReactElement`, so hidden fields
 * render an empty element, not `null`.
 */

import type {
	Config,
	CustomField,
	Data,
	IframeConfig,
	Overrides,
	PuckAction,
} from "@puckeditor/core";
import {
	createUsePuck,
	migrate,
	Puck,
	resolveAllData,
	transformProps,
	useGetPuck,
	walkTree,
} from "@puckeditor/core";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

/** A minimal config with one slot-bearing component and one leaf. */
const contractConfig: Config = {
	components: {
		Card: {
			fields: { body: { type: "slot" } },
			render: () => createElement("div"),
		},
		Leaf: {
			fields: {},
			metadata: { anvilkit: { editor: { version: "2" } } },
			render: () => createElement("span"),
		},
	},
};

const contractData = {
	content: [
		{
			type: "Card",
			props: {
				id: "card-1",
				body: [{ type: "Leaf", props: { id: "leaf-1" } }],
			},
		},
	],
	root: { props: {} },
	zones: {},
} as Data;

describe("puck public contract (0.23.0): tree functions", () => {
	it("walkTree(data, config, cb) visits content AND slot children", () => {
		const visited: string[] = [];
		walkTree(contractData, contractConfig, (content) => {
			for (const item of content) {
				visited.push(String(item.props.id));
			}
		});
		expect(visited).toContain("card-1");
		expect(visited).toContain("leaf-1");
	});

	it("walkTree returns a tree without mutating its input", () => {
		const result = walkTree(contractData, contractConfig, (content) =>
			content.map((item) => ({
				...item,
				props: { ...item.props, marked: true },
			})),
		);
		expect(result).not.toBe(contractData);
		expect(contractData.content[0]?.props).not.toHaveProperty("marked");
	});

	it("transformProps(data, transforms, config) reaches slot children", () => {
		const transformed = transformProps(
			contractData,
			{ Leaf: (props) => ({ ...props, tag: "migrated" }) },
			contractConfig,
		);
		const card = transformed.content[0] as {
			props: { body: { type: string; props: Record<string, unknown> }[] };
		};
		expect(card.props.body[0]?.props.tag).toBe("migrated");
	});

	it("migrate(data, config) is callable and returns current-shape Data", () => {
		const migrated = migrate(
			{ content: [], root: { props: {} } } as unknown as Data,
			contractConfig,
		);
		expect(Array.isArray(migrated.content)).toBe(true);
		expect(migrated.root).toBeDefined();
	});

	it("resolveAllData(data, config) resolves to the same tree shape", async () => {
		const resolved = await resolveAllData(contractData, contractConfig);
		expect(resolved.content).toHaveLength(1);
		expect(resolved.content[0]?.props.id).toBe("card-1");
	});
});

describe("puck public contract (0.23.0): actions", () => {
	it("setData accepts a functional updater and recordHistory", () => {
		const action: PuckAction = {
			type: "setData",
			recordHistory: true,
			data: (previous: Data) => ({ ...previous }),
		};
		expect(action.type).toBe("setData");
		expect(action.recordHistory).toBe(true);
		expect(typeof action.data).toBe("function");
	});

	it("replaceRoot remains available for root-only writes", () => {
		const action: PuckAction = {
			type: "replaceRoot",
			recordHistory: true,
			root: { props: {} },
		};
		expect(action.type).toBe("replaceRoot");
	});
});

describe("puck public contract (0.23.0): fields", () => {
	it("CustomField supports visible: false hidden authoring fields", () => {
		const hidden: CustomField<string | undefined> = {
			type: "custom",
			visible: false,
			render: () => createElement("span"),
		};
		expect(hidden.type).toBe("custom");
		expect(hidden.visible).toBe(false);
	});
});

describe("puck public contract (0.23.0): composition and hooks", () => {
	it("exposes Puck.Components, Puck.Fields, Puck.Outline, Puck.Preview", () => {
		expect(Puck.Components).toBeDefined();
		expect(Puck.Fields).toBeDefined();
		expect(Puck.Outline).toBeDefined();
		expect(Puck.Preview).toBeDefined();
	});

	it("createUsePuck returns a selector hook; useGetPuck is exported", () => {
		expect(typeof createUsePuck).toBe("function");
		expect(typeof createUsePuck()).toBe("function");
		expect(typeof useGetPuck).toBe("function");
	});
});

describe("puck public contract (0.23.0): iframe styling seam", () => {
	it("Overrides.iframe is a render boundary receiving children", () => {
		const overrides: Partial<Overrides> = {
			iframe: ({ children }) => createElement("div", null, children),
		};
		expect(typeof overrides.iframe).toBe("function");
	});

	it("IframeConfig declares syncHostStyles", () => {
		const iframe: IframeConfig = {
			enabled: true,
			waitForStyles: true,
			syncHostStyles: true,
		};
		expect(iframe.syncHostStyles).toBe(true);
	});
});
