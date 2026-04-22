import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const packageRoot = fileURLToPath(new URL("../../../", import.meta.url));

function runCli(args: readonly string[]) {
	return spawnSync("node", ["--import", "tsx", "src/bin/anvilkit.ts", ...args], {
		cwd: packageRoot,
		encoding: "utf8",
	});
}

describe("anvilkit bin", () => {
	it("prints help with all scaffolded subcommands", () => {
		const result = runCli(["--help"]);

		expect(result.status).toBe(0);
		expect(result.stdout).toContain("init");
		expect(result.stdout).toContain("validate");
		expect(result.stdout).toContain("export");
		expect(result.stdout).toContain("generate");
	});

	it("prints the runtime package version", () => {
		const packageJson = JSON.parse(
			readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
		) as { version: string };
		const result = runCli(["--version"]);

		expect(result.status).toBe(0);
		expect(result.stdout).toContain(packageJson.version);
	});
});
