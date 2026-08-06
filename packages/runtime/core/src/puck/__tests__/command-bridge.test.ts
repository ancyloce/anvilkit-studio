/**
 * @file P6-00 — v2 command bridge suite (PLAN-0025 §11.2). The
 * PLAN-0020 command vocabulary applies to §5.1/§5.2 carriers on v2
 * documents; nothing EVER writes `__anvilkit`; commands with no v2
 * equivalent surface `unsupported` instead of guessing.
 */

import type { EditorCommand } from "@anvilkit/contracts/editor";
import type { Config, Data } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import { applyV2Plan, planV2Command } from "../command-bridge.js";

const config = {
	components: {
		Box: {
			fields: {},
			metadata: {
				anvilkit: {
					editor: {
						version: "2",
						styleTargets: {
							root: {
								label: "Box",
								responsive: true,
								properties: ["display", "opacity", "padding", "gap"],
							},
						},
					},
				},
			},
			render: () => null,
		},
	},
} as unknown as Config;

const v2Doc = (extraProps: Record<string, unknown> = {}): Data =>
	({
		content: [
			{ type: "Box", props: { id: "box-1", label: "a", ...extraProps } },
		],
		root: {
			props: {
				authoringSchemaVersion: 2,
				designSystem: {
					version: "1",
					breakpoints: [
						{
							id: "bp-sm",
							label: "Small",
							maxWidth: 640,
							order: 0,
							enabled: true,
						},
					],
					tokens: {},
					tokenModes: {},
					defaultTokenMode: "default",
					styleDefinitions: {
						"sd-1": {
							version: "1",
							id: "sd-1",
							name: "Pad",
							appliesTo: "any",
							layout: {
								base: {
									padding: { top: { kind: "unit", value: 4, unit: "px" } },
								},
							},
							createdAt: "2026-01-01T00:00:00.000Z",
							updatedAt: "2026-01-01T00:00:00.000Z",
						},
					},
				},
			},
		},
		zones: {},
	}) as unknown as Data;

const run = (command: unknown, data: Data) =>
	applyV2Plan(planV2Command(command as EditorCommand), data, config);

const nodeProps = (data: Data): Record<string, unknown> =>
	(data.content[0] as { props: Record<string, unknown> }).props;

const appearanceOf = (data: Data) =>
	nodeProps(data).appearance as {
		targets: {
			root: {
				style?: {
					base?: Record<string, Record<string, unknown>>;
					overrides?: Record<string, Record<string, Record<string, unknown>>>;
				};
				hidden?: { base?: boolean; overrides?: Record<string, boolean | null> };
				styleRefs?: { base?: readonly string[] };
			};
		};
	};

describe("v2 command bridge (P6-00, §11.2)", () => {
	it("node.style.set writes the visual family onto the root target — never the sidecar", () => {
		const applied = run(
			{
				type: "node.style.set",
				nodeIds: ["box-1"],
				breakpointId: "base",
				patch: { opacity: 0.5 },
			},
			v2Doc(),
		);
		expect(applied.changed).toBe(true);
		expect(applied.changedNodeIds).toEqual(["box-1"]);
		expect(
			appearanceOf(applied.data).targets.root.style?.base?.visual,
		).toMatchObject({ opacity: 0.5 });
		expect(JSON.stringify(applied.data).includes("__anvilkit")).toBe(false);
	});

	it("node.layout.set at a breakpoint writes the override layer", () => {
		const applied = run(
			{
				type: "node.layout.set",
				nodeIds: ["box-1"],
				breakpointId: "bp-sm",
				patch: { display: "none" },
			},
			v2Doc(),
		);
		expect(
			appearanceOf(applied.data).targets.root.style?.overrides?.["bp-sm"]
				?.layout,
		).toMatchObject({ display: "none" });
	});

	it("node.visibility.set true then null round-trips the hidden entry", () => {
		const hidden = run(
			{
				type: "node.visibility.set",
				nodeIds: ["box-1"],
				breakpointId: "base",
				hidden: true,
			},
			v2Doc(),
		);
		expect(appearanceOf(hidden.data).targets.root.hidden?.base).toBe(true);
		const cleared = run(
			{
				type: "node.visibility.set",
				nodeIds: ["box-1"],
				breakpointId: "base",
				hidden: null,
			},
			hidden.data,
		);
		// §5.1 canonicalization: the emptied carrier is removed entirely.
		expect(nodeProps(cleared.data).appearance).toBeUndefined();
	});

	it("styleDefinition.attach/detach edit the ordered styleRefs", () => {
		const attached = run(
			{
				type: "styleDefinition.attach",
				nodeIds: ["box-1"],
				styleDefinitionId: "sd-1",
				layer: "base",
			},
			v2Doc(),
		);
		expect(appearanceOf(attached.data).targets.root.styleRefs?.base).toEqual([
			"sd-1",
		]);
		const detached = run(
			{
				type: "styleDefinition.detach",
				nodeIds: ["box-1"],
				styleDefinitionId: "sd-1",
				layer: "base",
			},
			attached.data,
		);
		// §5.1 canonicalization: the emptied carrier is removed entirely.
		expect(nodeProps(detached.data).appearance).toBeUndefined();
	});

	it("token.create lands in root.props.designSystem via one functional update", () => {
		const applied = run(
			{
				type: "token.create",
				token: {
					id: "tok-x",
					path: ["x"],
					name: "X",
					type: "color",
					values: {
						default: {
							kind: "literal",
							value: { kind: "rgba", r: 1, g: 2, b: 3, a: 1 },
						},
					},
					description: "",
				},
			},
			v2Doc(),
		);
		const designSystem = (applied.data.root.props as Record<string, unknown>)
			.designSystem as { tokens: Record<string, unknown> };
		expect(designSystem.tokens["tok-x"]).toBeDefined();
	});

	it("interaction.create/delete ride the trigger node's §5.1 carrier", () => {
		const interaction = {
			version: "1",
			id: "int-1",
			name: "Go",
			sourceNodeId: "box-1",
			trigger: { type: "click" },
			actions: [{ type: "url", url: "https://example.com" }],
			enabled: true,
		};
		const created = run({ type: "interaction.create", interaction }, v2Doc());
		expect(nodeProps(created.data).interactions).toEqual([interaction]);
		const deleted = run(
			{ type: "interaction.delete", interactionId: "int-1" },
			created.data,
		);
		expect(nodeProps(deleted.data).interactions).toBeUndefined();
	});

	it("binding.update upserts onto the bound node", () => {
		const binding = {
			version: "1",
			id: "b-1",
			nodeId: "box-1",
			target: { type: "prop", path: ["label"] },
			expression: { type: "path", root: "data", path: ["title"] },
		};
		const applied = run({ type: "binding.update", binding }, v2Doc());
		expect(nodeProps(applied.data).bindings).toEqual([binding]);
	});

	it("node.responsiveOverride.set clears one family's breakpoint entry", () => {
		const withOverride = run(
			{
				type: "node.layout.set",
				nodeIds: ["box-1"],
				breakpointId: "bp-sm",
				patch: { display: "none", gap: { kind: "unit", value: 4, unit: "px" } },
			},
			v2Doc(),
		);
		const cleared = run(
			{
				type: "node.responsiveOverride.set",
				nodeIds: ["box-1"],
				breakpointId: "bp-sm",
				family: "layout",
			},
			withOverride.data,
		);
		// §5.1 canonicalization: clearing the only authored family empties
		// the carrier, which is removed entirely.
		expect(nodeProps(cleared.data).appearance).toBeUndefined();
	});

	it("commands with no v2 equivalent are unsupported — not guessed, not sidecar-minted", () => {
		for (const command of [
			{ type: "node.lock.set", nodeIds: ["box-1"], locked: true },
			{ type: "node.rename", nodeIds: ["box-1"], name: "X" },
			{
				type: "component.definition.delete",
				definitionId: "d-1",
			},
		]) {
			const plan = planV2Command(command as EditorCommand);
			expect(plan.kind).toBe("unsupported");
		}
	});

	it("a batch is all-or-nothing: one unsupported member fails the whole batch", () => {
		const plan = planV2Command({
			type: "batch",
			label: "mixed",
			commands: [
				{
					type: "node.style.set",
					nodeIds: ["box-1"],
					breakpointId: "base",
					patch: { opacity: 0.4 },
				},
				{ type: "node.lock.set", nodeIds: ["box-1"], locked: true },
			],
		} as unknown as EditorCommand);
		expect(plan.kind).toBe("unsupported");
	});

	it("a supported batch applies as one composite over one document", () => {
		const applied = run(
			{
				type: "batch",
				label: "style pair",
				commands: [
					{
						type: "node.style.set",
						nodeIds: ["box-1"],
						breakpointId: "base",
						patch: { opacity: 0.4 },
					},
					{
						type: "node.layout.set",
						nodeIds: ["box-1"],
						breakpointId: "base",
						patch: { display: "flex" },
					},
				],
			},
			v2Doc(),
		);
		expect(applied.changed).toBe(true);
		const base = appearanceOf(applied.data).targets.root.style?.base;
		expect(base?.visual).toMatchObject({ opacity: 0.4 });
		expect(base?.layout).toMatchObject({ display: "flex" });
	});
});
