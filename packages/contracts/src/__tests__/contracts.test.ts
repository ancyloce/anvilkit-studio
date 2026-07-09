import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, expectTypeOf, it } from "vitest";

import type {
	AiGenerationContext,
	AiSectionPatch,
	AiValidationResult,
	ExportFormatDefinition,
	ExportResult,
	IRAssetResolver,
	PageIR,
	PageIRNode,
	StudioPagesSource,
} from "../index.js";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Dependency-direction guard — the reason this package exists is that
 * shared contracts must sit BELOW `@anvilkit/core`, `@anvilkit/ir`,
 * `@anvilkit/schema`, and `@anvilkit/validator`. A runtime dependency
 * (or any `@anvilkit/*` dependency at all) would re-invert the
 * layering this package was created to fix.
 */
describe("dependency direction", () => {
	it("declares zero runtime dependencies", async () => {
		const pkg = JSON.parse(
			await readFile(resolve(PACKAGE_ROOT, "package.json"), "utf8"),
		);
		expect(pkg.dependencies).toBeUndefined();
	});

	it("peers only on @puckeditor/core (type-only), never on react or @anvilkit/*", async () => {
		const pkg = JSON.parse(
			await readFile(resolve(PACKAGE_ROOT, "package.json"), "utf8"),
		);
		expect(Object.keys(pkg.peerDependencies ?? {})).toEqual([
			"@puckeditor/core",
		]);
		const declared = [
			...Object.keys(pkg.peerDependencies ?? {}),
			...Object.keys(pkg.dependencies ?? {}),
		];
		for (const name of declared) {
			expect(name).not.toMatch(/^react(-dom)?$/);
			expect(name).not.toMatch(/^@anvilkit\//);
			expect(name).not.toBe("zod");
			expect(name).not.toBe("zustand");
		}
	});

	it("imports nothing at runtime from its own source modules", async () => {
		// Every `src/*.ts` module must be erasable: only `import type` /
		// `export type` statements are allowed, so the compiled output
		// carries zero runtime imports.
		const { readdir } = await import("node:fs/promises");
		const entries = await readdir(resolve(PACKAGE_ROOT, "src"));
		const modules = entries.filter((name) => name.endsWith(".ts"));
		for (const name of modules) {
			const source = await readFile(resolve(PACKAGE_ROOT, "src", name), "utf8");
			const valueImports = source.match(
				/^import\s+(?!type\b)[^;]+from\s+["'][^"']+["'];?$/gm,
			);
			expect(valueImports, `${name} must only use \`import type\``).toBeNull();
		}
	});
});

describe("contract shapes (type-level)", () => {
	it("PageIR round-trip literal satisfies the contract", () => {
		const node = {
			id: "hero-1",
			type: "Hero",
			props: { title: "Hi" },
		} as const satisfies PageIRNode;
		const ir = {
			version: "1",
			root: node,
			assets: [],
			metadata: { title: "Home" },
		} as const satisfies PageIR;
		expectTypeOf(ir.version).toEqualTypeOf<"1">();
		expectTypeOf(ir.root).toMatchTypeOf<PageIRNode>();
	});

	it("AI + section contracts stay serializable-shaped", () => {
		expectTypeOf<AiGenerationContext["availableComponents"]>().toMatchTypeOf<
			readonly { componentName: string }[]
		>();
		expectTypeOf<AiSectionPatch["replacement"]>().toMatchTypeOf<
			readonly PageIRNode[]
		>();
		expectTypeOf<AiValidationResult["valid"]>().toBeBoolean();
	});

	it("export contract accepts PageIR, not Puck Data", () => {
		expectTypeOf<
			Parameters<ExportFormatDefinition["run"]>[0]
		>().toEqualTypeOf<PageIR>();
		expectTypeOf<ExportResult["content"]>().toEqualTypeOf<
			string | Uint8Array
		>();
	});

	it("host adapter contracts are callback-shaped but runtime-free here", () => {
		expectTypeOf<IRAssetResolver>().toBeFunction();
		expectTypeOf<StudioPagesSource["list"]>().toBeFunction();
	});
});
