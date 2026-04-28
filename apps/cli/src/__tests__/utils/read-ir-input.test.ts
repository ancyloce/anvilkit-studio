import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { readIrInput } from "../../utils/read-ir-input.js";

const directoriesToClean: string[] = [];

function fixturePath(name: string): string {
	return fileURLToPath(
		new URL(`../../../__fixtures__/export/${name}`, import.meta.url),
	);
}

function makeTempDir(prefix = "anvilkit-read-ir-"): string {
	const directory = mkdtempSync(join(tmpdir(), prefix));
	directoriesToClean.push(directory);
	return directory;
}

afterEach(() => {
	for (const directory of directoriesToClean.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("readIrInput", () => {
	it("loads a PageIR json file", async () => {
		const result = await readIrInput({
			input: fixturePath("page.ir.json"),
		});

		expect(result.source).toBe("ir-json");
		expect(result.ir.root.children?.[0]).toMatchObject({
			id: "hero-1",
			type: "Hero",
		});
	});

	it("loads a PageIR ts module", async () => {
		const result = await readIrInput({
			input: fixturePath("page.ir.ts"),
		});

		expect(result.source).toBe("ir-module");
		expect(result.ir.version).toBe("1");
		expect(result.ir.root.children?.[0]?.type).toBe("Hero");
	});

	it("converts a puck snapshot into PageIR when --from puck is used", async () => {
		const result = await readIrInput({
			input: fixturePath("puck-data.json"),
			from: "puck",
			configPath: fixturePath("puck-config.ts"),
		});

		expect(result.source).toBe("puck-snapshot");
		expect(result.ir.root.children?.[0]).toMatchObject({
			id: "hero-1",
			type: "Hero",
		});
	});

	it("throws FILE_NOT_FOUND for missing files", async () => {
		await expect(
			readIrInput({
				input: join(makeTempDir(), "missing.ir.json"),
			}),
		).rejects.toMatchObject({
			code: "FILE_NOT_FOUND",
			exitCode: 2,
		});
	});

	it("throws MISSING_CONFIG when puck input omits --config", async () => {
		await expect(
			readIrInput({
				input: fixturePath("puck-data.json"),
				from: "puck",
			}),
		).rejects.toMatchObject({
			code: "MISSING_CONFIG",
			exitCode: 2,
		});
	});

	it("throws INVALID_INPUT for malformed json", async () => {
		const directory = makeTempDir();
		const filePath = join(directory, "broken.json");
		writeFileSync(filePath, "{\n", "utf8");

		await expect(
			readIrInput({
				input: filePath,
			}),
		).rejects.toMatchObject({
			code: "INVALID_INPUT",
			exitCode: 1,
		});
	});

	it("throws INVALID_INPUT when a module does not export pageIR", async () => {
		const directory = makeTempDir();
		const filePath = join(directory, "not-page-ir.ts");
		writeFileSync(filePath, "export const value = 1;\n", "utf8");

		await expect(
			readIrInput({
				input: filePath,
			}),
		).rejects.toMatchObject({
			code: "INVALID_INPUT",
			exitCode: 1,
		});
	});
});
