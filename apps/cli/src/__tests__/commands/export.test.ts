import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdtempSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { CliError } from "../../utils/errors.js";
import type { CAC } from "cac";
import { register, runExport } from "../../commands/export.js";

const directoriesToClean: string[] = [];
const spawnProbe = spawnSync("node", ["-e", "process.exit(0)"], {
	encoding: "utf8",
});
const describeSubprocess = spawnProbe.error === undefined ? describe : describe.skip;
const packageRoot = fileURLToPath(new URL("../../../", import.meta.url));

function fixturePath(name: string): string {
	return fileURLToPath(new URL(`../../../__fixtures__/export/${name}`, import.meta.url));
}

function makeTempDir(prefix = "anvilkit-export-"): string {
	const directory = mkdtempSync(join(tmpdir(), prefix));
	directoriesToClean.push(directory);
	return directory;
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

describeSubprocess("export command", () => {
	it("writes html output through the CLI entrypoint", () => {
		const outDir = join(makeTempDir(), "cli-html");
		const result = runCli([
			"export",
			fixturePath("page.ir.json"),
			"--format",
			"html",
			"--out",
			outDir,
		]);

		expect(result.status).toBe(0);
		expect(existsSync(join(outDir, "page.html"))).toBe(true);
		expect(result.stderr).toContain("Exported page.html");
	});
});

describe("runExport", () => {
	it("registers the export command and stores the action exit code", async () => {
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
		const outDir = join(makeTempDir(), "registered-html");

		register(cli);

		expect(cli.command).toHaveBeenCalledWith(
			"export <input>",
			"Export input using an Anvilkit formatter",
		);
		expect(option).toHaveBeenCalledTimes(9);

		const handler = action.mock.calls[0]?.[0] as
			| ((input: string, options?: Record<string, unknown>) => Promise<void>)
			| undefined;
		expect(handler).toBeTypeOf("function");

		process.exitCode = undefined;
		await handler?.(fixturePath("page.ir.json"), {
			format: "html",
			out: outDir,
		});
		expect(process.exitCode).toBe(0);
		process.exitCode = previousExitCode;
	});

	it("writes page.html for html exports from a PageIR json file", async () => {
		const outDir = join(makeTempDir(), "html");

		const exitCode = await runExport(fixturePath("page.ir.json"), {
			format: "html",
			out: outDir,
		});

		expect(exitCode).toBe(0);
		expect(readFileSync(join(outDir, "page.html"), "utf8")).toContain(
			"<!doctype html>",
		);
	});

	it("writes page.tsx for react tsx exports", async () => {
		const outDir = join(makeTempDir(), "react-tsx");

		await runExport(fixturePath("page.ir.json"), {
			format: "react",
			out: outDir,
		});

		const content = readFileSync(join(outDir, "page.tsx"), "utf8");
		expect(content).toContain("export default function Page(): JSX.Element");
		expect(content).toContain('import { Hero } from "@anvilkit/hero";');
	});

	it("writes page.jsx when jsx syntax is requested", async () => {
		const outDir = join(makeTempDir(), "react-jsx");

		await runExport(fixturePath("page.ir.json"), {
			format: "react",
			out: outDir,
			syntax: "jsx",
		});

		const content = readFileSync(join(outDir, "page.jsx"), "utf8");
		expect(content).toContain("export default function Page()");
		expect(content).not.toContain(": JSX.Element");
	});

	it("matches html output between direct PageIR and --from puck flows", async () => {
		const directOutDir = join(makeTempDir(), "direct-html");
		const puckOutDir = join(makeTempDir(), "puck-html");

		await runExport(fixturePath("page.ir.json"), {
			format: "html",
			out: directOutDir,
		});
		await runExport(fixturePath("puck-data.json"), {
			format: "html",
			out: puckOutDir,
			from: "puck",
			config: fixturePath("puck-config.ts"),
		});

		expect(readFileSync(join(puckOutDir, "page.html"))).toEqual(
			readFileSync(join(directOutDir, "page.html")),
		);
	});

	it("throws INVALID_FORMAT for unsupported formats", async () => {
		const outDir = join(makeTempDir(), "bad-format");

		await expect(
			runExport(fixturePath("page.ir.json"), {
				format: "xml",
				out: outDir,
			}),
		).rejects.toBeInstanceOf(CliError);
		await expect(
			runExport(fixturePath("page.ir.json"), {
				format: "xml",
				out: outDir,
			}),
		).rejects.toMatchObject({
			code: "INVALID_FORMAT",
			exitCode: 2,
		});
	});

	it("throws OUT_EXISTS when the output path already exists without --force", async () => {
		const outDir = join(makeTempDir(), "existing");
		mkdirSync(outDir, { recursive: true });
		writeFileSync(join(outDir, "stale.txt"), "stale\n", "utf8");

		await expect(
			runExport(fixturePath("page.ir.json"), {
				format: "html",
				out: outDir,
			}),
		).rejects.toMatchObject({
			code: "OUT_EXISTS",
			exitCode: 2,
		});
	});

	it("overwrites an existing output path when --force is set", async () => {
		const outDir = join(makeTempDir(), "force");
		mkdirSync(outDir, { recursive: true });
		writeFileSync(join(outDir, "stale.txt"), "stale\n", "utf8");

		await runExport(fixturePath("page.ir.json"), {
			format: "html",
			out: outDir,
			force: true,
		});

		expect(existsSync(join(outDir, "stale.txt"))).toBe(false);
		expect(existsSync(join(outDir, "page.html"))).toBe(true);
	});

	it("throws FILE_NOT_FOUND for missing input files", async () => {
		const outDir = join(makeTempDir(), "missing");
		const missingInput = join(makeTempDir(), "missing.ir.json");

		await expect(
			runExport(missingInput, {
				format: "html",
				out: outDir,
			}),
		).rejects.toMatchObject({
			code: "FILE_NOT_FOUND",
			exitCode: 2,
		});
	});
});
