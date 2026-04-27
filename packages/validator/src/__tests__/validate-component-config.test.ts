import { describe, expect, it } from "vitest";
import { validateComponentConfig } from "../validate-component-config.js";
import {
	asyncRenderConfig,
	cyclicDefaultConfig,
	invalidFieldShapeConfig,
	missingDescriptionConfig,
	missingFieldsConfig,
	missingRenderConfig,
	nestedNonSerializableDefaultConfig,
	nonSerializableDefaultConfig,
	nullMetadataConfig,
	unknownFieldTypeConfig,
} from "./fixtures/invalid-configs.js";
import { validConfig } from "./fixtures/valid-config.js";

describe("validateComponentConfig", () => {
	// ----- Positive: valid config -----
	it("returns valid with no issues for a well-formed config", () => {
		const result = validateComponentConfig(validConfig);
		expect(result.valid).toBe(true);
		expect(result.issues).toHaveLength(0);
	});

	// ----- E_MISSING_RENDER -----
	it("reports E_MISSING_RENDER when render is not a function", () => {
		const result = validateComponentConfig(missingRenderConfig);
		expect(result.valid).toBe(false);
		const issue = result.issues.find((i) => i.code === "E_MISSING_RENDER");
		expect(issue).toBeDefined();
		expect(issue!.level).toBe("error");
		expect(issue!.componentName).toBe("Broken");
		expect(issue!.path).toEqual(["components", "Broken", "render"]);
	});

	// ----- E_ASYNC_RENDER -----
	it("reports E_ASYNC_RENDER when render is async", () => {
		const result = validateComponentConfig(asyncRenderConfig);
		expect(result.valid).toBe(false);
		const issue = result.issues.find((i) => i.code === "E_ASYNC_RENDER");
		expect(issue).toBeDefined();
		expect(issue!.level).toBe("error");
		expect(issue!.componentName).toBe("Broken");
		expect(issue!.path).toEqual(["components", "Broken", "render"]);
	});

	// ----- E_MISSING_FIELDS -----
	it("reports E_MISSING_FIELDS when fields is not an object", () => {
		const result = validateComponentConfig(missingFieldsConfig);
		expect(result.valid).toBe(false);
		const issue = result.issues.find((i) => i.code === "E_MISSING_FIELDS");
		expect(issue).toBeDefined();
		expect(issue!.level).toBe("error");
		expect(issue!.componentName).toBe("Broken");
		expect(issue!.path).toEqual(["components", "Broken", "fields"]);
	});

	// ----- E_FIELD_SHAPE_INVALID -----
	it("reports E_FIELD_SHAPE_INVALID when field is not a valid shape", () => {
		const result = validateComponentConfig(invalidFieldShapeConfig);
		expect(result.valid).toBe(false);
		const issue = result.issues.find((i) => i.code === "E_FIELD_SHAPE_INVALID");
		expect(issue).toBeDefined();
		expect(issue!.level).toBe("error");
		expect(issue!.componentName).toBe("Broken");
		expect(issue!.path).toEqual(["components", "Broken", "fields", "bad"]);
	});

	// ----- E_NON_SERIALIZABLE_DEFAULT -----
	it("reports E_NON_SERIALIZABLE_DEFAULT when a default prop is not JSON-serializable", () => {
		const result = validateComponentConfig(nonSerializableDefaultConfig);
		expect(result.valid).toBe(false);
		const issue = result.issues.find(
			(i) => i.code === "E_NON_SERIALIZABLE_DEFAULT",
		);
		expect(issue).toBeDefined();
		expect(issue!.level).toBe("error");
		expect(issue!.componentName).toBe("Broken");
		expect(issue!.path).toEqual([
			"components",
			"Broken",
			"defaultProps",
			"action",
		]);
	});

	// ----- phase5-019 F-3: nested non-serializable defaults -----
	it("reports E_NON_SERIALIZABLE_DEFAULT for a function buried inside a nested default prop", () => {
		const result = validateComponentConfig(
			nestedNonSerializableDefaultConfig,
		);
		expect(result.valid).toBe(false);
		const issue = result.issues.find(
			(i) => i.code === "E_NON_SERIALIZABLE_DEFAULT",
		);
		expect(issue).toBeDefined();
		expect(issue!.componentName).toBe("Broken");
		expect(issue!.path).toEqual([
			"components",
			"Broken",
			"defaultProps",
			"settings",
		]);
	});

	// ----- W_MISSING_DESCRIPTION -----
	it("reports W_MISSING_DESCRIPTION when metadata.description is absent", () => {
		const result = validateComponentConfig(missingDescriptionConfig);
		const issue = result.issues.find((i) => i.code === "W_MISSING_DESCRIPTION");
		expect(issue).toBeDefined();
		expect(issue!.level).toBe("warning");
		expect(issue!.componentName).toBe("Broken");
		expect(issue!.path).toEqual([
			"components",
			"Broken",
			"metadata",
			"description",
		]);
	});

	// ----- W_UNKNOWN_FIELD_TYPE -----
	it("reports W_UNKNOWN_FIELD_TYPE when field type is not a known type", () => {
		const result = validateComponentConfig(unknownFieldTypeConfig);
		const issue = result.issues.find((i) => i.code === "W_UNKNOWN_FIELD_TYPE");
		expect(issue).toBeDefined();
		expect(issue!.level).toBe("warning");
		expect(issue!.componentName).toBe("Broken");
		expect(issue!.path).toEqual([
			"components",
			"Broken",
			"fields",
			"widget",
			"type",
		]);
	});

	// ----- Warnings do not affect validity -----
	it("remains valid when only warnings are present", () => {
		const result = validateComponentConfig(missingDescriptionConfig);
		expect(result.valid).toBe(true);
		expect(result.issues.length).toBeGreaterThan(0);
		expect(result.issues.every((i) => i.level === "warning")).toBe(true);
	});

	// ----- Multiple issues -----
	it("reports multiple issues for multiple problems", () => {
		const result = validateComponentConfig(missingRenderConfig);
		expect(result.issues.length).toBeGreaterThanOrEqual(2);
	});

	// ----- Cyclic defaults flow through to E_NON_SERIALIZABLE_DEFAULT -----
	it("reports E_NON_SERIALIZABLE_DEFAULT for a cyclic default prop", () => {
		const result = validateComponentConfig(cyclicDefaultConfig);
		expect(result.valid).toBe(false);
		const issue = result.issues.find(
			(i) => i.code === "E_NON_SERIALIZABLE_DEFAULT",
		);
		expect(issue).toBeDefined();
		expect(issue!.componentName).toBe("Broken");
		expect(issue!.path).toEqual([
			"components",
			"Broken",
			"defaultProps",
			"profile",
		]);
	});

	// ----- metadata: null behaves like missing metadata -----
	it("treats metadata: null as missing description (W_MISSING_DESCRIPTION)", () => {
		const result = validateComponentConfig(nullMetadataConfig);
		const issue = result.issues.find((i) => i.code === "W_MISSING_DESCRIPTION");
		expect(issue).toBeDefined();
		expect(issue!.level).toBe("warning");
		expect(result.valid).toBe(true);
	});
});
