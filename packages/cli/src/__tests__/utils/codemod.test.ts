import { describe, expect, it } from "vitest";

import {
	addToTranspilePackages,
	registerInPuckConfig,
} from "../../utils/codemod.js";

describe("addToTranspilePackages", () => {
	const baseline = `/** @type {import("next").NextConfig} */
const nextConfig = {
\ttranspilePackages: ["@anvilkit/core", "@anvilkit/ir"],
};

export default nextConfig;
`;

	it("inserts a new package and re-sorts the array", () => {
		const result = addToTranspilePackages(baseline, "@anvilkit/hero");
		expect(result.changed).toBe(true);
		expect(result.source).toContain('"@anvilkit/core"');
		expect(result.source).toContain('"@anvilkit/hero"');
		expect(result.source).toContain('"@anvilkit/ir"');
		expect(result.source.indexOf('"@anvilkit/core"')).toBeLessThan(
			result.source.indexOf('"@anvilkit/hero"'),
		);
		expect(result.source.indexOf('"@anvilkit/hero"')).toBeLessThan(
			result.source.indexOf('"@anvilkit/ir"'),
		);
	});

	it("is idempotent on a second pass", () => {
		const first = addToTranspilePackages(baseline, "@anvilkit/hero");
		const second = addToTranspilePackages(first.source, "@anvilkit/hero");
		expect(second.changed).toBe(false);
		expect(second.source).toBe(first.source);
	});

	it("creates transpilePackages when missing", () => {
		const empty = `const nextConfig = {};\nexport default nextConfig;\n`;
		const result = addToTranspilePackages(empty, "@anvilkit/hero");
		expect(result.changed).toBe(true);
		expect(result.source).toContain("transpilePackages");
		expect(result.source).toContain('"@anvilkit/hero"');
	});

	it("handles export default { … } directly", () => {
		const inline = `export default { transpilePackages: ["@anvilkit/core"] };\n`;
		const result = addToTranspilePackages(inline, "@anvilkit/hero");
		expect(result.changed).toBe(true);
		expect(result.source).toContain('"@anvilkit/hero"');
	});
});

describe("registerInPuckConfig — components", () => {
	const baseline = `import type { Config } from "@puckeditor/core";

export const puckConfig: Config = {
\tcomponents: {
\t\tHeading: {
\t\t\tfields: { text: { type: "text" } },
\t\t\tdefaultProps: { text: "hi" },
\t\t\trender: () => null,
\t\t},
\t},
};
`;

	it("adds an import and registers the component", () => {
		const result = registerInPuckConfig({
			source: baseline,
			slug: "hero",
			packageName: "@anvilkit/hero",
			kind: "component",
		});
		expect(result.changed).toBe(true);
		expect(result.source).toContain(`import { Hero } from "@anvilkit/hero"`);
		expect(result.source).toMatch(/components:\s*\{[\s\S]*Hero[,\s]/);
	});

	it("is idempotent", () => {
		const first = registerInPuckConfig({
			source: baseline,
			slug: "hero",
			packageName: "@anvilkit/hero",
			kind: "component",
		});
		const second = registerInPuckConfig({
			source: first.source,
			slug: "hero",
			packageName: "@anvilkit/hero",
			kind: "component",
		});
		expect(second.changed).toBe(false);
		expect(second.source).toBe(first.source);
	});

	it("handles kebab-case slugs and converts to PascalCase", () => {
		const result = registerInPuckConfig({
			source: baseline,
			slug: "bento-grid",
			packageName: "@anvilkit/bento-grid",
			kind: "component",
		});
		expect(result.source).toContain(
			`import { BentoGrid } from "@anvilkit/bento-grid"`,
		);
	});
});

describe("registerInPuckConfig — plugins", () => {
	const baseline = `import type { Config } from "@puckeditor/core";

export const puckConfig: Config = {
\tcomponents: {},
\tplugins: [],
};
`;

	it("imports the factory and instantiates it inside plugins", () => {
		const result = registerInPuckConfig({
			source: baseline,
			slug: "plugin-version-history",
			packageName: "@anvilkit/plugin-version-history",
			kind: "plugin",
		});
		expect(result.changed).toBe(true);
		expect(result.source).toContain(
			`import { createVersionHistoryPlugin } from "@anvilkit/plugin-version-history"`,
		);
		expect(result.source).toContain("createVersionHistoryPlugin()");
	});

	it("adds a plugins array when missing", () => {
		const noPlugins = `import type { Config } from "@puckeditor/core";\n\nexport const puckConfig: Config = { components: {} };\n`;
		const result = registerInPuckConfig({
			source: noPlugins,
			slug: "plugin-export-html",
			packageName: "@anvilkit/plugin-export-html",
			kind: "plugin",
		});
		expect(result.changed).toBe(true);
		expect(result.source).toContain("plugins:");
		expect(result.source).toContain("createExportHtmlPlugin()");
	});
});

describe("registerInPuckConfig — templates", () => {
	const baseline = `import type { Config } from "@puckeditor/core";

export const puckConfig: Config = {
\tcomponents: {},
};
`;

	it("imports the template and adds it to a templates array", () => {
		const result = registerInPuckConfig({
			source: baseline,
			slug: "landing-saas",
			packageName: "@anvilkit/template-landing-saas",
			kind: "template",
		});
		expect(result.changed).toBe(true);
		expect(result.source).toContain(
			`import { LandingSaas } from "@anvilkit/template-landing-saas"`,
		);
		expect(result.source).toContain("templates:");
	});
});
