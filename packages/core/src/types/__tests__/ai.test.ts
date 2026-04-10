/**
 * @file Compile-time type tests for `src/types/ai.ts`.
 *
 * Enforced by `tsc --noEmit -p tsconfig.test.json`. See
 * `plugin.test.ts` for the broader rationale behind the
 * type-test-only pattern.
 */

import { describe, expect, it } from "vitest";

import type {
	AiComponentSchema,
	AiFieldSchema,
	AiGenerationContext,
	AiValidationIssue,
	AiValidationResult,
} from "../ai.js";

describe("AI generation contract", () => {
	it("accepts a minimal AiComponentSchema", () => {
		const hero: AiComponentSchema = {
			componentName: "Hero",
			description: "A hero section for the top of a landing page",
			fields: [
				{
					name: "title",
					type: "text",
					required: true,
					description: "The headline shown at the top of the hero",
				},
			],
		};
		void hero;
		expect(true).toBe(true);
	});

	it("accepts an AiFieldSchema with every optional field populated", () => {
		const field: AiFieldSchema = {
			name: "theme",
			type: "select",
			required: false,
			description: "Visual theme variant",
			options: [
				{ label: "Light", value: "light" },
				{ label: "Dark", value: "dark" },
			],
		};
		void field;
	});

	it("accepts a recursive array field via itemSchema", () => {
		const tags: AiFieldSchema = {
			name: "tags",
			type: "array",
			itemSchema: {
				name: "tag",
				type: "text",
			},
		};
		void tags;

		const matrix: AiFieldSchema = {
			name: "rows",
			type: "array",
			itemSchema: {
				name: "row",
				type: "array",
				itemSchema: {
					name: "cell",
					type: "text",
				},
			},
		};
		void matrix;
	});

	it("AiFieldSchema.type is restricted to the closed union", () => {
		// @ts-expect-error — `"datetime"` is not in the closed type union.
		const invalidType: AiFieldSchema["type"] = "datetime";
		void invalidType;
	});

	it("AiComponentSchema requires componentName, description, and fields", () => {
		// @ts-expect-error — `description` is required.
		const missingDescription: AiComponentSchema = {
			componentName: "Hero",
			fields: [],
		};
		void missingDescription;

		// @ts-expect-error — `fields` is required.
		const missingFields: AiComponentSchema = {
			componentName: "Hero",
			description: "x",
		};
		void missingFields;
	});

	it("accepts a full AiGenerationContext with every optional hint", () => {
		const ctx: AiGenerationContext = {
			availableComponents: [
				{
					componentName: "Hero",
					description: "Top-of-page hero",
					fields: [{ name: "title", type: "text", required: true }],
				},
			],
			currentData: { content: [], root: {} },
			theme: "dark",
			locale: "en-US",
		};
		void ctx;
	});

	it("AiGenerationContext.theme is restricted to light | dark", () => {
		// @ts-expect-error — `"sepia"` is not a valid theme.
		const invalidTheme: AiGenerationContext["theme"] = "sepia";
		void invalidTheme;
	});

	it("AiValidationResult carries an issues array keyed by path + severity", () => {
		const issue: AiValidationIssue = {
			path: "content.0.props.title",
			message: "Expected a non-empty string",
			severity: "error",
		};
		void issue;

		const result: AiValidationResult = {
			valid: false,
			issues: [issue],
		};
		void result;

		const empty: AiValidationResult = { valid: true, issues: [] };
		void empty;

		// @ts-expect-error — `"info"` is not allowed (use warn | error).
		const invalidSeverity: AiValidationIssue["severity"] = "info";
		void invalidSeverity;
	});
});
