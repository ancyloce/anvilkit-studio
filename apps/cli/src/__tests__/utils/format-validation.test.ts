import type { ValidationResult } from "@anvilkit/validator";
import { describe, expect, it } from "vitest";

import { formatJson, formatPretty } from "../../utils/format-validation.js";

describe("format validation helpers", () => {
	it("formats pretty output with issue lines and a summary", () => {
		const result: ValidationResult = {
			valid: false,
			issues: [
				{
					level: "error",
					code: "E_MISSING_RENDER",
					message: 'Component "Hero" is missing a render function.',
					path: ["components", "Hero", "render"],
					componentName: "Hero",
				},
				{
					level: "warning",
					code: "W_UNKNOWN_FIELD_TYPE",
					message: 'Field "tone" in "Hero" has unknown type "magic".',
					path: ["components", "Hero", "fields", "tone", "type"],
				},
			],
		};

		const output = formatPretty(result);
		const lines = output.split("\n");

		expect(lines).toHaveLength(3);
		expect(lines[0]).toContain("[E_MISSING_RENDER] Hero —");
		expect(lines[1]).toContain("[W_UNKNOWN_FIELD_TYPE] components.Hero.fields.tone.type —");
		expect(lines[2]).toBe("1 errors, 1 warnings");
	});

	it("formats JSON output as a stable JSON string", () => {
		const result: ValidationResult = {
			valid: true,
			issues: [],
		};

		expect(formatJson(result)).toBe('{\n  "valid": true,\n  "issues": []\n}');
	});
});
