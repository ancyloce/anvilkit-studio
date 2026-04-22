import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { atomicWriteDir } from "../../utils/atomic-write.js";

const directoriesToClean: string[] = [];

function makeTempDir(prefix = "anvilkit-atomic-"): string {
	const directory = mkdtempSync(join(tmpdir(), prefix));
	directoriesToClean.push(directory);
	return directory;
}

afterEach(() => {
	for (const directory of directoriesToClean.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("atomicWriteDir", () => {
	it("writes into a sibling tmp dir and renames it on success", async () => {
		const parentDir = makeTempDir();
		const outDir = join(parentDir, "dist");
		let observedTmpDir = "";

		await atomicWriteDir({
			outDir,
			force: false,
			write: async (tmpDir) => {
				observedTmpDir = tmpDir;
				expect(tmpDir).toBe(join(parentDir, "dist.tmp"));
				expect(existsSync(outDir)).toBe(false);
				writeFileSync(join(tmpDir, "page.html"), "<!doctype html>\n", "utf8");
			},
		});

		expect(observedTmpDir).toBe(join(parentDir, "dist.tmp"));
		expect(existsSync(outDir)).toBe(true);
		expect(existsSync(join(parentDir, "dist.tmp"))).toBe(false);
		expect(readFileSync(join(outDir, "page.html"), "utf8")).toContain(
			"<!doctype html>",
		);
	});

	it("removes the previous output when force is enabled", async () => {
		const parentDir = makeTempDir();
		const outDir = join(parentDir, "dist");

		await atomicWriteDir({
			outDir,
			force: false,
			write: async (tmpDir) => {
				writeFileSync(join(tmpDir, "old.txt"), "old\n", "utf8");
			},
		});

		await atomicWriteDir({
			outDir,
			force: true,
			write: async (tmpDir) => {
				writeFileSync(join(tmpDir, "new.txt"), "new\n", "utf8");
			},
		});

		expect(existsSync(join(outDir, "old.txt"))).toBe(false);
		expect(readFileSync(join(outDir, "new.txt"), "utf8")).toBe("new\n");
	});

	it("cleans up the tmp dir when writing fails", async () => {
		const parentDir = makeTempDir();
		const outDir = join(parentDir, "dist");

		await expect(
			atomicWriteDir({
				outDir,
				force: false,
				write: async (tmpDir) => {
					writeFileSync(join(tmpDir, "partial.txt"), "partial\n", "utf8");
					throw new Error("write failed");
				},
			}),
		).rejects.toThrow("write failed");

		expect(existsSync(outDir)).toBe(false);
		expect(existsSync(join(parentDir, "dist.tmp"))).toBe(false);
	});

	it("throws OUT_EXISTS without force and removes the tmp dir", async () => {
		const parentDir = makeTempDir();
		const outDir = join(parentDir, "dist");

		await atomicWriteDir({
			outDir,
			force: false,
			write: async (tmpDir) => {
				writeFileSync(join(tmpDir, "page.html"), "first\n", "utf8");
			},
		});

		await expect(
			atomicWriteDir({
				outDir,
				force: false,
				write: async (tmpDir) => {
					writeFileSync(join(tmpDir, "page.html"), "second\n", "utf8");
				},
			}),
		).rejects.toMatchObject({
			code: "OUT_EXISTS",
			exitCode: 2,
		});

		expect(existsSync(join(parentDir, "dist.tmp"))).toBe(false);
		expect(readFileSync(join(outDir, "page.html"), "utf8")).toBe("first\n");
	});
});
