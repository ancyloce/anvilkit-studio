import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { copyScaffold } from "../../utils/copy-scaffold.js";

const tempRoots: string[] = [];

function makeTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "copy-scaffold-"));
	tempRoots.push(dir);
	return dir;
}

afterEach(() => {
	for (const tempRoot of tempRoots.splice(0, tempRoots.length)) {
		rmSync(tempRoot, { recursive: true, force: true });
	}
});

describe("copyScaffold", () => {
	it("copies nested files and replaces __NAME__ placeholders", () => {
		const tempRoot = makeTempDir();
		const sourceDir = join(tempRoot, "source");
		const targetDir = join(tempRoot, "target");

		mkdirSync(join(sourceDir, "nested"), { recursive: true });
		writeFileSync(join(sourceDir, "package.json"), '{"name":"__NAME__"}\n', "utf8");
		writeFileSync(
			join(sourceDir, "nested", "__NAME__.md"),
			"# __NAME__\n",
			"utf8",
		);
		writeFileSync(join(sourceDir, ".gitignore"), "node_modules\n", "utf8");

		copyScaffold({
			sourceDir,
			targetDir,
			name: "fresh-site",
		});

		expect(readFileSync(join(targetDir, "package.json"), "utf8")).toContain(
			"fresh-site",
		);
		expect(readFileSync(join(targetDir, "nested", "fresh-site.md"), "utf8")).toBe(
			"# fresh-site\n",
		);
		expect(existsSync(join(targetDir, ".gitignore"))).toBe(true);
	});
});
