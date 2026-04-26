import type { AiComponentSchema } from "@anvilkit/core/types";
import { describe, expect, it } from "vitest";
import { validateAiOutput } from "../validate-ai-output.js";

const heroSchema: AiComponentSchema = {
	componentName: "Hero",
	description: "A hero banner",
	fields: [
		{ name: "title", type: "text", required: true },
		{ name: "description", type: "text" },
		{
			name: "size",
			type: "select",
			options: [
				{ label: "Small", value: "sm" },
				{ label: "Large", value: "lg" },
			],
		},
	],
};

const sectionSchema: AiComponentSchema = {
	componentName: "Section",
	description: "A page section",
	fields: [{ name: "heading", type: "text" }],
};

const schemas = [heroSchema, sectionSchema];

function makeValidIR(
	components: Array<{ type: string; props: Record<string, unknown> }>,
) {
	return {
		version: "1" as const,
		root: {
			id: "root",
			type: "__root__",
			props: {},
			children: components.map((c, i) => ({
				id: `node-${i}`,
				type: c.type,
				props: c.props,
			})),
		},
		assets: [] as unknown[],
		metadata: {},
	};
}

describe("validateAiOutput", () => {
	it("passes for a valid IR with known components", () => {
		const ir = makeValidIR([
			{ type: "Hero", props: { id: "h1", title: "Hello", size: "sm" } },
		]);
		const result = validateAiOutput(ir, schemas);
		expect(result.valid).toBe(true);
		expect(result.issues).toHaveLength(0);
	});

	it("reports UNKNOWN_COMPONENT for unrecognized component type", () => {
		const ir = makeValidIR([{ type: "Heroo", props: { id: "h1" } }]);
		const result = validateAiOutput(ir, schemas);
		expect(result.valid).toBe(false);
		const issue = result.issues.find((i) =>
			i.message.includes("[UNKNOWN_COMPONENT]"),
		);
		expect(issue).toBeDefined();
		expect(issue!.path).toContain("type");
	});

	it("includes closest-match suggestion for UNKNOWN_COMPONENT", () => {
		const ir = makeValidIR([{ type: "Heros", props: { id: "h1" } }]);
		const result = validateAiOutput(ir, schemas);
		const issue = result.issues.find((i) =>
			i.message.includes("[UNKNOWN_COMPONENT]"),
		);
		expect(issue).toBeDefined();
		expect(issue!.message).toContain("Hero");
	});

	it("reports MISSING_REQUIRED_FIELD when required prop is missing", () => {
		const ir = makeValidIR([{ type: "Hero", props: { id: "h1" } }]);
		const result = validateAiOutput(ir, schemas);
		expect(result.valid).toBe(false);
		const issue = result.issues.find((i) =>
			i.message.includes("[MISSING_REQUIRED_FIELD]"),
		);
		expect(issue).toBeDefined();
		expect(issue!.path).toContain("props");
		expect(issue!.path).toContain("title");
	});

	it("reports INVALID_FIELD_TYPE when prop has wrong type", () => {
		const ir = makeValidIR([{ type: "Hero", props: { id: "h1", title: 42 } }]);
		const result = validateAiOutput(ir, schemas);
		expect(result.valid).toBe(false);
		const issue = result.issues.find((i) =>
			i.message.includes("[INVALID_FIELD_TYPE]"),
		);
		expect(issue).toBeDefined();
		expect(issue!.path).toContain("title");
	});

	it("reports UNKNOWN_FIELD for extra props", () => {
		const ir = makeValidIR([
			{ type: "Hero", props: { id: "h1", title: "Hello", extraProp: "bad" } },
		]);
		const result = validateAiOutput(ir, schemas);
		const issue = result.issues.find((i) =>
			i.message.includes("[UNKNOWN_FIELD]"),
		);
		expect(issue).toBeDefined();
		expect(issue!.severity).toBe("warn");
		expect(issue!.path).toContain("extraProp");
	});

	it("reports INVALID_ENUM_VALUE for wrong select value", () => {
		const ir = makeValidIR([
			{ type: "Hero", props: { id: "h1", title: "Hello", size: "xl" } },
		]);
		const result = validateAiOutput(ir, schemas);
		expect(result.valid).toBe(false);
		const issue = result.issues.find((i) =>
			i.message.includes("[INVALID_ENUM_VALUE]"),
		);
		expect(issue).toBeDefined();
		expect(issue!.path).toContain("size");
	});

	it("reports INVALID_ASSET for malformed assets", () => {
		const ir = {
			version: "1",
			root: { id: "root", type: "__root__", props: {}, children: [] },
			assets: [{ id: "a1", kind: "badkind", url: 123 }],
			metadata: {},
		};
		const result = validateAiOutput(ir, schemas);
		expect(result.valid).toBe(false);
		const issue = result.issues.find((i) =>
			i.message.includes("[INVALID_ASSET]"),
		);
		expect(issue).toBeDefined();
		expect(issue!.path).toBe("assets.0");
	});

	it("reports INVALID_STRUCTURE when assets is missing", () => {
		const ir = {
			version: "1",
			root: { id: "root", type: "__root__", props: {}, children: [] },
			metadata: {},
		};
		const result = validateAiOutput(ir, schemas);
		expect(result.valid).toBe(false);
		const issue = result.issues.find((i) => i.path === "assets");
		expect(issue?.message).toContain("[INVALID_STRUCTURE]");
	});

	it("reports INVALID_STRUCTURE when metadata is missing", () => {
		const ir = {
			version: "1",
			root: { id: "root", type: "__root__", props: {}, children: [] },
			assets: [],
		};
		const result = validateAiOutput(ir, schemas);
		expect(result.valid).toBe(false);
		const issue = result.issues.find((i) => i.path === "metadata");
		expect(issue?.message).toContain("[INVALID_STRUCTURE]");
	});

	it("reports UNSUPPORTED_VERSION for wrong version", () => {
		const ir = {
			version: "2",
			root: { id: "root", type: "__root__", props: {}, children: [] },
			assets: [],
			metadata: {},
		};
		const result = validateAiOutput(ir, schemas);
		expect(result.valid).toBe(false);
		const issue = result.issues.find((i) =>
			i.message.includes("[UNSUPPORTED_VERSION]"),
		);
		expect(issue).toBeDefined();
		expect(issue!.path).toBe("version");
	});

	it("reports issues in nested children", () => {
		const ir = {
			version: "1",
			root: {
				id: "root",
				type: "__root__",
				props: {},
				children: [
					{
						id: "s1",
						type: "Section",
						props: { id: "s1" },
						children: [{ id: "u1", type: "Unknown", props: { id: "u1" } }],
					},
				],
			},
			assets: [],
			metadata: {},
		};
		const result = validateAiOutput(ir, schemas);
		expect(result.valid).toBe(false);
		const issue = result.issues.find((i) =>
			i.message.includes("[UNKNOWN_COMPONENT]"),
		);
		expect(issue).toBeDefined();
		expect(issue!.path).toBe("root.children.0.children.0.type");
	});

	it("reports INVALID_STRUCTURE for missing root props", () => {
		const ir = {
			version: "1",
			root: { id: "root", type: "__root__", children: [] },
			assets: [],
			metadata: {},
		};
		const result = validateAiOutput(ir, schemas);
		expect(result.valid).toBe(false);
		const issue = result.issues.find((i) => i.path === "root.props");
		expect(issue?.message).toContain("[INVALID_STRUCTURE]");
	});

	it("reports INVALID_STRUCTURE for missing node id and props", () => {
		const ir = {
			version: "1",
			root: {
				id: "root",
				type: "__root__",
				props: {},
				children: [{ type: "Hero" }],
			},
			assets: [],
			metadata: {},
		};
		const result = validateAiOutput(ir, schemas);
		expect(result.valid).toBe(false);
		expect(
			result.issues.find((i) => i.path === "root.children.0.id"),
		).toBeDefined();
		expect(
			result.issues.find((i) => i.path === "root.children.0.props"),
		).toBeDefined();
	});

	it("reports INVALID_CHILD when children contains a non-object entry", () => {
		const ir = {
			version: "1",
			root: {
				id: "root",
				type: "__root__",
				props: {},
				children: ["Hero"],
			},
			assets: [],
			metadata: {},
		};
		const result = validateAiOutput(ir, schemas);
		expect(result.valid).toBe(false);
		const issue = result.issues.find((i) =>
			i.message.includes("[INVALID_CHILD]"),
		);
		expect(issue?.path).toBe("root.children.0");
	});

	it("reports INVALID_STRUCTURE for non-object response", () => {
		const result = validateAiOutput("not an object", schemas);
		expect(result.valid).toBe(false);
		expect(result.issues[0].message).toContain("[INVALID_STRUCTURE]");
	});

	it("every issue has a non-undefined path and message", () => {
		const ir = makeValidIR([{ type: "Bad", props: { title: 42 } }]);
		const result = validateAiOutput(ir, schemas);
		for (const issue of result.issues) {
			expect(typeof issue.path).toBe("string");
			expect(typeof issue.message).toBe("string");
			expect(issue.message.length).toBeGreaterThan(0);
		}
	});
});
