import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { CliError } from "../../utils/errors.js";
import type { CAC } from "cac";
import { register, runValidate } from "../../commands/validate.js";

const spawnProbe = spawnSync("node", ["-e", "process.exit(0)"], {
	encoding: "utf8",
});
const describeSubprocess = spawnProbe.error === undefined ? describe : describe.skip;
const packageRoot = fileURLToPath(new URL("../../../", import.meta.url));
const directoriesToClean: string[] = [];

function fixturePath(name: string): string {
	return fileURLToPath(new URL(`../../../__fixtures__/validate/${name}`, import.meta.url));
}

function runCli(args: readonly string[]) {
	return spawnSync("node", ["--import", "tsx", "src/bin/anvilkit.ts", ...args], {
		cwd: packageRoot,
		encoding: "utf8",
	});
}

afterEach(() => {
	vi.restoreAllMocks();
	for (const directory of directoriesToClean.splice(0)) {
		rmSync(directory, { force: true, recursive: true });
	}
});

describeSubprocess("validate command", () => {
	it("validates a passing TypeScript config", () => {
		const result = runCli(["validate", fixturePath("good-basic.ts")]);

		expect(result.status).toBe(0);
		expect(result.stderr).toContain("✓");
		expect(result.stdout).toBe("");
	});

	it("validates a passing .mjs config", () => {
		const result = runCli(["validate", fixturePath("good-mjs.mjs")]);

		expect(result.status).toBe(0);
		expect(result.stderr).toContain("0 errors, 0 warnings");
	});

	it("reports a missing render error", () => {
		const result = runCli(["validate", fixturePath("bad-missing-render.ts")]);

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("E_MISSING_RENDER");
		expect(result.stdout).toBe("");
	});

	it("reports an async render error", () => {
		const result = runCli(["validate", fixturePath("bad-async-render.ts")]);

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("E_ASYNC_RENDER");
	});

	it("reports non-serializable default props", () => {
		const result = runCli([
			"validate",
			fixturePath("bad-non-serializable-default.ts"),
		]);

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("E_NON_SERIALIZABLE_DEFAULT");
		expect(result.stderr).toContain("not JSON-serializable");
	});

	it("fails with FILE_NOT_FOUND for a missing config file", () => {
		const result = runCli([
			"validate",
			fileURLToPath(new URL("../../../__fixtures__/validate/missing.ts", import.meta.url)),
		]);

		expect(result.status).toBe(2);
		expect(result.stderr).toContain("FILE_NOT_FOUND");
	});

	it("emits parseable JSON with --format json", () => {
		const result = runCli([
			"validate",
			fixturePath("good-multi.ts"),
			"--format",
			"json",
		]);
		const payload = JSON.parse(result.stdout) as {
			issues: unknown[];
			valid: boolean;
		};

		expect(result.status).toBe(0);
		expect(result.stderr).toBe("");
		expect(payload.valid).toBeTypeOf("boolean");
		expect(Array.isArray(payload.issues)).toBe(true);
	});
});

describe("runValidate", () => {
	it("registers the validate command and stores the action exit code", async () => {
		const option = vi.fn();
		const action = vi.fn();
		const command = {
			option,
			action,
		};
		option.mockReturnValue(command);
		action.mockReturnValue(command);
		const cli = {
			command: vi.fn(() => command),
		} as unknown as CAC;
		const previousExitCode = process.exitCode;

		register(cli);

		expect(cli.command).toHaveBeenCalledWith(
			"validate <file>",
			"Validate a source file against Anvilkit rules",
		);
		expect(option).toHaveBeenCalledTimes(2);

		const handler = action.mock.calls[0]?.[0] as
			| ((file: string, options?: { format?: "pretty" | "json" }) => Promise<void>)
			| undefined;
		expect(handler).toBeTypeOf("function");

		process.exitCode = undefined;
		await handler?.(fixturePath("bad-missing-render.ts"));
		expect(process.exitCode).toBe(1);
		process.exitCode = previousExitCode;
	});

	it("returns 0 and prints a success summary for a valid config", async () => {
		const output = captureWrites(process.stderr);
		const exitCode = await runValidate(fixturePath("good-basic.ts"));

		expect(exitCode).toBe(0);
		expect(output()).toContain("✓ 0 errors, 0 warnings");
	});

	it("returns 1 and prints pretty validation output for invalid configs", async () => {
		const output = captureWrites(process.stderr);
		const exitCode = await runValidate(fixturePath("bad-missing-render.ts"));

		expect(exitCode).toBe(1);
		expect(output()).toContain("E_MISSING_RENDER");
	});

	it("prints warning lines and a success summary when validation passes with warnings", async () => {
		const configPath = writeTempConfig([
			"export default {",
			"\tcomponents: {",
			"\t\tWarningCard: {",
			"\t\t\trender: () => null,",
			'\t\t\tfields: { tone: { type: "magic" } },',
			'\t\t\tmetadata: { description: "warning card" },',
			"\t\t},",
			"\t},",
			"};",
			"",
		]);
		const output = captureWrites(process.stderr);
		const exitCode = await runValidate(configPath);

		expect(exitCode).toBe(0);
		expect(output()).toContain("W_UNKNOWN_FIELD_TYPE");
		expect(output()).toContain("✓ 0 errors, 1 warnings");
	});

	it("writes JSON to stdout when requested", async () => {
		const output = captureWrites(process.stdout);
		const exitCode = await runValidate(fixturePath("good-multi.ts"), {
			format: "json",
		});
		const payload = JSON.parse(output()) as {
			issues: unknown[];
			valid: boolean;
		};

		expect(exitCode).toBe(0);
		expect(payload.valid).toBe(true);
		expect(Array.isArray(payload.issues)).toBe(true);
	});

	it("bubbles FILE_NOT_FOUND errors", async () => {
		await expect(runValidate(fixturePath("missing.ts"))).rejects.toBeInstanceOf(
			CliError,
		);
		await expect(runValidate(fixturePath("missing.ts"))).rejects.toMatchObject({
			code: "FILE_NOT_FOUND",
			exitCode: 2,
		});
	});
});

function captureWrites(stream: NodeJS.WriteStream): () => string {
	const chunks: string[] = [];

	vi.spyOn(stream, "write").mockImplementation(
		((chunk: string | Uint8Array) => {
			chunks.push(String(chunk));
			return true;
		}) as never,
	);

	return () => chunks.join("");
}

function writeTempConfig(lines: readonly string[]): string {
	const directory = mkdtempSync(join(tmpdir(), "anvilkit-validate-"));
	const configPath = join(directory, "puck-config.ts");
	directoriesToClean.push(directory);
	writeFileSync(configPath, lines.join("\n"), "utf8");
	return configPath;
}
