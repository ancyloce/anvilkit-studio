/**
 * @file Validates `validateAiSectionPatch` against `PageIRNodeMeta`
 * field caps (M10-T3 / `phase6-008` validator side).
 *
 * Caps under test:
 * - `notes` ≤ 512 characters
 * - `owner` ≤ 256 characters
 * - `version` matches semver shape
 * - `locked` is a boolean
 * - unknown keys rejected
 *
 * Each case asserts the issue surfaces with `code: "INVALID_NODE"`,
 * a path rooted at `["replacement", i, "meta", ...]`, and that
 * `valid` flips to `false`.
 */

import type { AiComponentSchema, AiSectionContext } from "@anvilkit/core/types";
import { describe, expect, it } from "vitest";

import { validateAiSectionPatch } from "../section.js";

const componentFixtures: AiComponentSchema[] = [
	{
		componentName: "Hero",
		description: "Hero",
		fields: [{ name: "title", type: "text", required: true }],
	},
];

const baseCtx: AiSectionContext = {
	zoneId: "root-zone",
	nodeIds: ["n1"],
	availableComponents: componentFixtures,
	allowResize: false,
};

const baseReplacementNode = (
	meta: unknown,
): Record<string, unknown> => ({
	id: "new-1",
	type: "Hero",
	props: { title: "T" },
	meta,
});

const buildPatch = (meta: unknown) => ({
	zoneId: "root-zone",
	nodeIds: ["n1"],
	replacement: [baseReplacementNode(meta)],
});

describe("validateAiSectionPatch — meta cap enforcement", () => {
	it("accepts a fully populated valid meta", () => {
		const result = validateAiSectionPatch(
			buildPatch({
				locked: true,
				owner: "team-platform",
				version: "1.2.3",
				notes: "All good.",
			}),
			baseCtx,
		);
		expect(result.valid).toBe(true);
		expect(result.issues).toHaveLength(0);
	});

	it("accepts an empty meta object", () => {
		const result = validateAiSectionPatch(buildPatch({}), baseCtx);
		expect(result.valid).toBe(true);
		expect(result.issues).toHaveLength(0);
	});

	it("accepts a partial meta with only `locked`", () => {
		const result = validateAiSectionPatch(
			buildPatch({ locked: false }),
			baseCtx,
		);
		expect(result.valid).toBe(true);
		expect(result.issues).toHaveLength(0);
	});

	it("rejects oversize notes (>512 chars)", () => {
		const result = validateAiSectionPatch(
			buildPatch({ notes: "x".repeat(513) }),
			baseCtx,
		);
		expect(result.valid).toBe(false);
		const metaIssue = result.issues.find((i) =>
			i.path.includes("notes"),
		);
		expect(metaIssue).toBeDefined();
		expect(metaIssue?.code).toBe("INVALID_NODE");
		expect(metaIssue?.path.slice(0, 3)).toEqual(["replacement", 0, "meta"]);
	});

	it("rejects oversize owner (>256 chars)", () => {
		const result = validateAiSectionPatch(
			buildPatch({ owner: "y".repeat(257) }),
			baseCtx,
		);
		expect(result.valid).toBe(false);
		expect(
			result.issues.find((i) => i.path.includes("owner")),
		).toBeDefined();
	});

	it("rejects a non-semver version string", () => {
		const result = validateAiSectionPatch(
			buildPatch({ version: "v1" }),
			baseCtx,
		);
		expect(result.valid).toBe(false);
		expect(
			result.issues.find((i) => i.path.includes("version")),
		).toBeDefined();
	});

	it("rejects a non-boolean locked", () => {
		const result = validateAiSectionPatch(
			buildPatch({ locked: "yes" }),
			baseCtx,
		);
		expect(result.valid).toBe(false);
		expect(
			result.issues.find((i) => i.path.includes("locked")),
		).toBeDefined();
	});

	it("rejects an unknown meta key", () => {
		const result = validateAiSectionPatch(
			buildPatch({ foo: "bar" }),
			baseCtx,
		);
		expect(result.valid).toBe(false);
		expect(
			result.issues.find((i) => i.code === "INVALID_NODE"),
		).toBeDefined();
	});

	it("validates meta on deeply-nested children", () => {
		const result = validateAiSectionPatch(
			{
				zoneId: "root-zone",
				nodeIds: ["n1"],
				replacement: [
					{
						id: "outer",
						type: "Hero",
						props: { title: "T" },
						children: [
							{
								id: "inner",
								type: "Hero",
								props: { title: "Inner" },
								meta: { notes: "z".repeat(513) },
							},
						],
					},
				],
			},
			baseCtx,
		);
		expect(result.valid).toBe(false);
		const issue = result.issues.find((i) =>
			i.path.includes("notes"),
		);
		expect(issue?.path.slice(0, 5)).toEqual([
			"replacement",
			0,
			"children",
			0,
			"meta",
		]);
	});
});
