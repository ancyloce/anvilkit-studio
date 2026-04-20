/**
 * Test the scaffolder end-to-end: run it against a tmpdir, check
 * that expected files land with substituted placeholders, and that
 * the generated package.json / tsconfig look right. We do not run
 * pnpm install here (too slow for unit tests and covered by the
 * smoke-test workflow) — that's the job of the CI
 * `generator-smoke.yml` cron added in phase4-013.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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
		expect(existsSync(join(root, "src", "__tests__", "demo-plugin.test.ts")))
			.toBe(true);
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
