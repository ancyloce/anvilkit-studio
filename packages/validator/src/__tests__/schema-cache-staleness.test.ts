/**
 * Regression for the dropped `componentSchemaCache` (validator code
 * review 2026-04-26, P0).
 *
 * Previously, `makeComponentPropsSchema` cached by `componentName`
 * only — so calling `validateAiOutput` twice with the same name but a
 * different `fields` array would silently re-use the first schema and
 * mis-validate the second call's payload. The cache is now removed;
 * this test pins the new invariant: each call sees its own fields.
 */

import type { AiComponentSchema } from "@anvilkit/core/types";
import { describe, expect, it } from "vitest";
import { validateAiOutput } from "../validate-ai-output.js";

function wrapHero(props: Record<string, unknown>) {
	return {
		version: "1" as const,
		root: {
			id: "root",
			type: "__root__",
			props: {},
			children: [{ id: "h1", type: "Hero", props: { id: "h1", ...props } }],
		},
		assets: [],
		metadata: {},
	};
}

describe("validateAiOutput — schema is not cached across calls", () => {
	it("respects the new fields when the same componentName is re-registered with a different shape", () => {
		const heroV1: AiComponentSchema = {
			componentName: "Hero",
			description: "Hero v1",
			fields: [{ name: "title", type: "text", required: true }],
		};
		const heroV2: AiComponentSchema = {
			componentName: "Hero",
			description: "Hero v2",
			fields: [
				{ name: "title", type: "text", required: true },
				{ name: "subtitle", type: "text", required: true },
			],
		};

		// Payload that satisfies v1 but is missing v2's required `subtitle`.
		const ir = wrapHero({ title: "Hello" });

		const v1Result = validateAiOutput(ir, [heroV1]);
		expect(v1Result.valid).toBe(true);

		const v2Result = validateAiOutput(ir, [heroV2]);
		expect(v2Result.valid).toBe(false);
		const missing = v2Result.issues.find((i) =>
			i.message.includes("[MISSING_REQUIRED_FIELD]"),
		);
		expect(missing).toBeDefined();
		expect(missing!.path).toContain("subtitle");
	});

	it("respects field-type changes across calls", () => {
		const stringField: AiComponentSchema = {
			componentName: "Widget",
			description: "Widget with string count",
			fields: [{ name: "count", type: "text", required: true }],
		};
		const numberField: AiComponentSchema = {
			componentName: "Widget",
			description: "Widget with number count",
			fields: [{ name: "count", type: "number", required: true }],
		};

		const ir = {
			version: "1" as const,
			root: {
				id: "root",
				type: "__root__",
				props: {},
				children: [
					{ id: "w1", type: "Widget", props: { id: "w1", count: "ten" } },
				],
			},
			assets: [],
			metadata: {},
		};

		expect(validateAiOutput(ir, [stringField]).valid).toBe(true);

		const numberResult = validateAiOutput(ir, [numberField]);
		expect(numberResult.valid).toBe(false);
		expect(
			numberResult.issues.some((i) =>
				i.message.includes("[INVALID_FIELD_TYPE]"),
			),
		).toBe(true);
	});
});
