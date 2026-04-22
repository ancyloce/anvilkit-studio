import {
	copyFileSync,
	existsSync,
	mkdtempSync,
	mkdirSync,
	readFileSync,
	rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { configToAiContext } from "@anvilkit/schema";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resolvePuckConfig } from "../../utils/resolve-puck-config.js";
import { runGenerate } from "../../commands/generate.js";

const directoriesToClean: string[] = [];
const originalCwd = process.cwd();

function fixturePath(name: string): string {
	return fileURLToPath(new URL(`../../../__fixtures__/generate/${name}`, import.meta.url));
}

function sourcePath(name: string): string {
	return fileURLToPath(new URL(`../../utils/${name}`, import.meta.url));
}

function makeTempDir(prefix = "anvilkit-generate-"): string {
	const directory = mkdtempSync(join(tmpdir(), prefix));
	directoriesToClean.push(directory);
	return directory;
}

function makeFixtureCwd(configFixtureName: string): string {
	const root = makeTempDir("anvilkit-generate-cwd-");
	const fixtureDir = join(root, "__fixtures__", "generate");
	const utilsDir = join(root, "src", "utils");

	mkdirSync(fixtureDir, { recursive: true });
	mkdirSync(utilsDir, { recursive: true });
	copyFileSync(fixturePath(configFixtureName), join(fixtureDir, "anvilkit.config.ts"));
	copyFileSync(
		sourcePath("define-anvilkit-config.ts"),
		join(utilsDir, "define-anvilkit-config.ts"),
	);

	return fixtureDir;
}

async function withCwd<T>(cwd: string, run: () => Promise<T>): Promise<T> {
	const previousCwd = process.cwd();
	process.chdir(cwd);

	try {
		return await run();
	} finally {
		process.chdir(previousCwd);
	}
}

async function captureOutput<T>(
	run: () => Promise<T>,
): Promise<{ readonly result: T; readonly stdout: string; readonly stderr: string }> {
	let stdout = "";
	let stderr = "";
	const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(
		((chunk: unknown) => {
			stdout += toText(chunk);
			return true;
		}) as typeof process.stdout.write,
	);
	const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(
		((chunk: unknown) => {
			stderr += toText(chunk);
			return true;
		}) as typeof process.stderr.write,
	);

	try {
		const result = await run();
		return { result, stdout, stderr };
	} finally {
		stdoutSpy.mockRestore();
		stderrSpy.mockRestore();
	}
}

async function loadFixtureContext() {
	const { config } = await resolvePuckConfig(fixturePath("puck-config.ts"));
	return configToAiContext(config as Parameters<typeof configToAiContext>[0]);
}

function toText(chunk: unknown): string {
	if (typeof chunk === "string") {
		return chunk;
	}

	if (chunk instanceof Uint8Array) {
		return Buffer.from(chunk).toString("utf8");
	}

	return String(chunk);
}

afterEach(() => {
	vi.restoreAllMocks();
	process.chdir(originalCwd);

	for (const directory of directoriesToClean.splice(0)) {
		rmSync(directory, { force: true, recursive: true });
	}
});

describe("runGenerate", () => {
	it("writes a validated PageIR to a file with --mock", async () => {
		const cwd = fileURLToPath(new URL("../../../__fixtures__/generate", import.meta.url));
		const outPath = join(makeTempDir(), "generated.json");
		const context = await loadFixtureContext();

		const { result, stdout, stderr } = await withCwd(cwd, async () =>
			captureOutput(() =>
				runGenerate("a hero about CLIs", {
					config: fixturePath("puck-config.ts"),
					mock: true,
					out: outPath,
				}),
			),
		);

		expect(result).toBe(0);
		expect(stdout).toBe("");
		expect(stderr).toBe("");

		const ir = JSON.parse(readFileSync(outPath, "utf8")) as unknown;
		const validation = await import("@anvilkit/validator").then(({ validateAiOutput }) =>
			validateAiOutput(ir, context.availableComponents),
		);

		expect(validation.valid).toBe(true);
		expect(validation.issues).toEqual([]);
	});

	it("streams valid JSON to stdout with --mock --out -", async () => {
		const cwd = fileURLToPath(new URL("../../../__fixtures__/generate", import.meta.url));
		const context = await loadFixtureContext();
		const { validateAiOutput } = await import("@anvilkit/validator");

		const { result, stdout, stderr } = await withCwd(cwd, async () =>
			captureOutput(() =>
				runGenerate("a hero about CLIs", {
					config: fixturePath("puck-config.ts"),
					mock: true,
					out: "-",
				}),
			),
		);

		expect(result).toBe(0);
		expect(stderr).toBe("");
		expect(stdout.endsWith("\n")).toBe(true);

		const ir = JSON.parse(stdout) as unknown;
		const validation = validateAiOutput(ir, context.availableComponents);

		expect(validation.valid).toBe(true);
		expect(validation.issues).toEqual([]);
	});

	it("throws NO_ANVILKIT_CONFIG when no anvilkit.config.ts is found", async () => {
		const cwd = makeTempDir("anvilkit-generate-empty-");
		const outPath = join(makeTempDir(), "generated.json");

		await withCwd(cwd, async () => {
			await expect(
				runGenerate("a hero about CLIs", {
					config: fixturePath("puck-config.ts"),
					out: outPath,
				}),
			).rejects.toMatchObject({
				code: "NO_ANVILKIT_CONFIG",
				exitCode: 2,
				message:
					"no anvilkit.config.ts found; run `anvilkit init` or see docs/cli/generate",
			});
		});
	});

	it("throws MISSING_GENERATE_PAGE when the config has no generatePage export", async () => {
		const cwd = makeFixtureCwd("anvilkit.config.no-generate.ts");
		const outPath = join(makeTempDir(), "generated.json");

		await withCwd(cwd, async () => {
			await expect(
				runGenerate("a hero about CLIs", {
					config: fixturePath("puck-config.ts"),
					out: outPath,
				}),
			).rejects.toMatchObject({
				code: "MISSING_GENERATE_PAGE",
				exitCode: 2,
				message: "anvilkit.config.ts has no `generatePage` export",
			});
		});
	});

	it("returns exit code 1 and writes AiValidationIssue[] to stderr on validator failure", async () => {
		const cwd = makeFixtureCwd("anvilkit.config.bad.ts");
		const outPath = join(makeTempDir(), "invalid.json");

		const { result, stdout, stderr } = await withCwd(cwd, async () =>
			captureOutput(() =>
				runGenerate("a hero about CLIs", {
					config: fixturePath("puck-config.ts"),
					format: "json",
					out: outPath,
				}),
			),
		);

		expect(result).toBe(1);
		expect(stdout).toBe("");
		expect(existsSync(outPath)).toBe(false);

		const issues = JSON.parse(stderr) as unknown[];
		expect(issues).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					path: "root.children.0.type",
					severity: "error",
				}),
			]),
		);
	});
});
