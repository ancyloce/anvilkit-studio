/**
 * Test the scaffolder end-to-end: run it against a tmpdir, check
 * that expected files land with substituted placeholders, and that
 * the generated package.json / tsconfig look right. We do not run
 * pnpm install here (too slow for unit tests and covered by the
 * smoke-test workflow) — that's the job of the CI
 * `generator-smoke.yml` cron added in phase4-013.
 */
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { run } from "../index.js";

let workDir: string;

beforeEach(() => {
	workDir = mkdtempSync(join(tmpdir(), "create-anvilkit-plugin-"));
});

afterEach(() => {
	if (workDir && existsSync(workDir)) {
		rmSync(workDir, { recursive: true, force: true });
	}
});

describe("create-anvilkit-plugin", () => {
	it("scaffolds a plugin from flag-driven args", async () => {
		const opts = await run([
			"--name",
			"demo-plugin",
			"--display",
			"Demo Plugin",
			"--category",
			"rail-panel",
			"--dir",
			workDir,
		]);

		expect(opts.name).toBe("demo-plugin");
		expect(opts.display).toBe("Demo Plugin");

		const root = join(workDir, "demo-plugin");
		expect(existsSync(join(root, "package.json"))).toBe(true);
		expect(existsSync(join(root, "tsconfig.json"))).toBe(true);
		expect(existsSync(join(root, "biome.json"))).toBe(true);
		expect(existsSync(join(root, "rslib.config.ts"))).toBe(true);
		expect(existsSync(join(root, "vitest.config.ts"))).toBe(true);
		expect(existsSync(join(root, "src", "index.ts"))).toBe(true);
		expect(
			existsSync(join(root, "src", "__tests__", "demo-plugin.test.ts")),
		).toBe(true);
		expect(existsSync(join(root, "README.md"))).toBe(true);
	});

	it("substitutes placeholders in package.json", async () => {
		await run([
			"--name",
			"my-plugin",
			"--display",
			"My Plugin",
			"--category",
			"export",
			"--dir",
			workDir,
		]);
		const pkg = JSON.parse(
			readFileSync(join(workDir, "my-plugin", "package.json"), "utf8"),
		) as { name: string; description: string };
		expect(pkg.name).toBe("@anvilkit/plugin-my-plugin");
		expect(pkg.description).toContain("My Plugin");
		expect(pkg.description).toContain("export");
	});

	it("escapes display names in generated JSON and TypeScript string literals", async () => {
		const display = 'Quoted "__CATEGORY__" \\ Backslash\nNext line';
		await run([
			"--name",
			"quoted-plugin",
			"--display",
			display,
			"--category",
			"custom",
			"--dir",
			workDir,
		]);

		const root = join(workDir, "quoted-plugin");
		const pkg = JSON.parse(
			readFileSync(join(root, "package.json"), "utf8"),
		) as { description: string };
		expect(pkg.description).toBe(
			`${display} - Anvilkit StudioPlugin (category: custom).`,
		);

		const escapedDisplay = JSON.stringify(display);
		const src = readFileSync(join(root, "src", "index.ts"), "utf8");
		expect(src).toContain(`name: ${escapedDisplay}`);
		expect(src).toContain(
			`description: ${JSON.stringify(`${display} (category: custom).`)}`,
		);

		const testSrc = readFileSync(
			join(root, "src", "__tests__", "quoted-plugin.test.ts"),
			"utf8",
		);
		expect(testSrc).toContain(
			`expect(plugin.meta.name).toBe(${escapedDisplay})`,
		);
	});

	it("writes the createXxxPlugin factory with the derived class name", async () => {
		await run([
			"--name",
			"hello-world",
			"--display",
			"Hello World",
			"--category",
			"custom",
			"--dir",
			workDir,
		]);
		const src = readFileSync(
			join(workDir, "hello-world", "src", "index.ts"),
			"utf8",
		);
		expect(src).toContain("export function createHelloWorldPlugin");
		expect(src).toContain("anvilkit-plugin-hello-world");
		expect(src).toContain('"Hello World"');
	});

	it("documents the current Studio plugin registration shape", async () => {
		await run([
			"--name",
			"readme-plugin",
			"--display",
			"Readme Plugin",
			"--category",
			"custom",
			"--dir",
			workDir,
		]);
		const readme = readFileSync(
			join(workDir, "readme-plugin", "README.md"),
			"utf8",
		);
		expect(readme).toContain('import { Studio } from "@anvilkit/core";');
		expect(readme).toContain("<Studio");
		expect(readme).toContain("plugins={[createReadmePluginPlugin");
		expect(readme).not.toContain("createStudioConfig");
	});

	it("prefixes code identifiers derived from numeric slugs", async () => {
		await run([
			"--name",
			"123-plugin",
			"--display",
			"Numbers",
			"--category",
			"custom",
			"--dir",
			workDir,
		]);
		const src = readFileSync(
			join(workDir, "123-plugin", "src", "index.ts"),
			"utf8",
		);
		expect(src).toContain("export interface Plugin123PluginOptions");
		expect(src).toContain("export function createPlugin123Plugin");
	});

	it("rejects an invalid category", async () => {
		await expect(
			run([
				"--name",
				"x",
				"--display",
				"X",
				"--category",
				"not-a-category",
				"--dir",
				workDir,
			]),
		).rejects.toThrow(/Invalid --category/);
	});

	it("rejects unknown flags", async () => {
		await expect(
			run([
				"--name",
				"x",
				"--display",
				"X",
				"--category",
				"custom",
				"--categry",
				"custom",
				"--dir",
				workDir,
			]),
		).rejects.toThrow(/Unknown option/);
	});

	it("rejects an existing non-empty target directory unless force is set", async () => {
		const root = join(workDir, "existing-plugin");
		mkdirSync(root);
		const existingPackage = join(root, "package.json");
		writeFileSync(existingPackage, '{"name":"do-not-overwrite"}\n', "utf8");

		await expect(
			run([
				"--name",
				"existing-plugin",
				"--display",
				"Existing",
				"--category",
				"custom",
				"--dir",
				workDir,
			]),
		).rejects.toThrow(/already exists and is not empty/);
		expect(readFileSync(existingPackage, "utf8")).toBe(
			'{"name":"do-not-overwrite"}\n',
		);
	});

	it("overwrites generated files in a non-empty target directory when force is set", async () => {
		const root = join(workDir, "existing-plugin");
		mkdirSync(root);
		writeFileSync(join(root, "package.json"), '{"name":"old"}\n', "utf8");

		await run([
			"--name",
			"existing-plugin",
			"--display",
			"Existing",
			"--category",
			"custom",
			"--dir",
			workDir,
			"--force",
		]);

		const pkg = JSON.parse(
			readFileSync(join(root, "package.json"), "utf8"),
		) as {
			devDependencies: Record<string, string>;
			name: string;
			peerDependencies: Record<string, string>;
		};
		expect(pkg.name).toBe("@anvilkit/plugin-existing-plugin");
		expect(pkg.peerDependencies["@anvilkit/core"]).toBe("^0.1.0-alpha");
		expect(pkg.devDependencies["@anvilkit/core"]).toBe("^0.1.0-alpha");
	});

	it("slugifies user-provided name (spaces, mixed case)", async () => {
		await run([
			"--name",
			"My FANCY Plugin",
			"--display",
			"Fancy",
			"--category",
			"custom",
			"--dir",
			workDir,
		]);
		expect(existsSync(join(workDir, "my-fancy-plugin", "package.json"))).toBe(
			true,
		);
	});
});
