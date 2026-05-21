import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { CliError } from "../../utils/errors.js";
import { loadAnvilkitConfig } from "../../utils/load-anvilkit-config.js";

const directoriesToClean: string[] = [];

function makeTempDir(): string {
	const directory = mkdtempSync(join(tmpdir(), "anvilkit-config-"));
	directoriesToClean.push(directory);
	return directory;
}

afterEach(() => {
	for (const directory of directoriesToClean.splice(0)) {
		rmSync(directory, { force: true, recursive: true });
	}
});

describe("loadAnvilkitConfig", () => {
	it("returns null when no config file exists", async () => {
		const directory = makeTempDir();

		await expect(loadAnvilkitConfig(directory)).resolves.toBeNull();
	});

	it("loads the first matching config file", async () => {
		const directory = makeTempDir();
		const configPath = join(directory, "anvilkit.config.ts");

		writeFileSync(
			configPath,
			'export default { name: "demo", mode: "artifact" };\n',
			"utf8",
		);

		await expect(loadAnvilkitConfig(directory)).resolves.toEqual({
			path: configPath,
			config: {
				name: "demo",
				mode: "artifact",
			},
		});
	});

	it("wraps loader failures in a CliError", async () => {
		const directory = makeTempDir();

		writeFileSync(
			join(directory, "anvilkit.config.ts"),
			'throw new Error("broken config");\n',
			"utf8",
		);

		await expect(loadAnvilkitConfig(directory)).rejects.toBeInstanceOf(
			CliError,
		);
		await expect(loadAnvilkitConfig(directory)).rejects.toMatchObject({
			code: "CONFIG_LOAD_FAILED",
			exitCode: 1,
		});
	});
});
