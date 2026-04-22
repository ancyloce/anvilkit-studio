import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { CliError } from "../../utils/errors.js";
import { resolvePuckConfig } from "../../utils/resolve-puck-config.js";

const directoriesToClean: string[] = [];
const defaultFixturePath = fileURLToPath(
	new URL("../../../__fixtures__/validate/good-basic.ts", import.meta.url),
);

function makeTempDir(): string {
	const directory = mkdtempSync(join(tmpdir(), "anvilkit-puck-config-"));
	directoriesToClean.push(directory);
	return directory;
}

afterEach(() => {
	for (const directory of directoriesToClean.splice(0)) {
		rmSync(directory, { force: true, recursive: true });
	}
});

describe("resolvePuckConfig", () => {
	it("loads a default-exported config fixture", async () => {
		const resolved = await resolvePuckConfig(defaultFixturePath);

		expect(resolved.path).toBe(defaultFixturePath);
		expect(resolved.config).toMatchObject({
			components: {
				Hero: expect.any(Object),
			},
		});
	});

	it("loads a named config export", async () => {
		const directory = makeTempDir();
		const configPath = join(directory, "named-config.ts");

		writeFileSync(
			configPath,
			[
				"export const config = {",
				"\tcomponents: {",
				"\t\tNotice: {",
				"\t\t\trender: () => null,",
				'\t\t\tfields: { title: { type: "text" } },',
				'\t\t\tmetadata: { description: "notice" },',
				"\t\t},",
				"\t},",
				"};",
				"",
			].join("\n"),
			"utf8",
		);

		const resolved = await resolvePuckConfig(configPath);

		expect(resolved.path).toBe(configPath);
		expect(resolved.config).toMatchObject({
			components: {
				Notice: expect.any(Object),
			},
		});
	});

	it("throws FILE_NOT_FOUND when the file is missing", async () => {
		const missingPath = join(makeTempDir(), "missing.ts");

		await expect(resolvePuckConfig(missingPath)).rejects.toBeInstanceOf(CliError);
		await expect(resolvePuckConfig(missingPath)).rejects.toMatchObject({
			code: "FILE_NOT_FOUND",
			exitCode: 2,
		});
	});

	it("throws INVALID_CONFIG when the module does not export an object config", async () => {
		const directory = makeTempDir();
		const configPath = join(directory, "invalid-config.ts");

		writeFileSync(configPath, 'export default "broken";\n', "utf8");

		await expect(resolvePuckConfig(configPath)).rejects.toMatchObject({
			code: "INVALID_CONFIG",
			exitCode: 2,
		});
	});

	it("wraps loader failures as CONFIG_LOAD_FAILED", async () => {
		const directory = makeTempDir();
		const configPath = join(directory, "broken-config.ts");

		writeFileSync(configPath, 'throw new Error("broken puck config");\n', "utf8");

		await expect(resolvePuckConfig(configPath)).rejects.toMatchObject({
			code: "CONFIG_LOAD_FAILED",
			exitCode: 2,
		});
	});
});
