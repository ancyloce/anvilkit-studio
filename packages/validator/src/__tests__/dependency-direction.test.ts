import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

async function collectSourceFiles(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await collectSourceFiles(fullPath)));
		} else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
			files.push(fullPath);
		}
	}
	return files;
}

/**
 * Dependency-direction guard (contracts extraction, report 0013):
 * shared contract types are owned by `@anvilkit/contracts`; this
 * package must never reach into `@anvilkit/core` for them again —
 * core sits ABOVE the headless layer.
 */
describe("dependency direction", () => {
	it("declares @anvilkit/contracts and no @anvilkit/core in any dependency field", async () => {
		const pkg = JSON.parse(
			await readFile(resolve(PACKAGE_ROOT, "package.json"), "utf8"),
		);
		expect(pkg.dependencies?.["@anvilkit/contracts"]).toBeDefined();
		for (const field of [
			"dependencies",
			"devDependencies",
			"peerDependencies",
			"optionalDependencies",
		]) {
			expect(
				Object.keys(pkg[field] ?? {}),
				`${field} must not contain @anvilkit/core`,
			).not.toContain("@anvilkit/core");
		}
	});

	it("has zero @anvilkit/core imports in src/", async () => {
		const files = await collectSourceFiles(resolve(PACKAGE_ROOT, "src"));
		expect(files.length).toBeGreaterThan(0);
		for (const file of files) {
			const source = await readFile(file, "utf8");
			expect(
				/from\s+["']@anvilkit\/core(\/[^"']*)?["']/.test(source),
				`${file} must not import from @anvilkit/core`,
			).toBe(false);
		}
	});
});
