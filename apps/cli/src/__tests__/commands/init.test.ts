import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const packageRoot = fileURLToPath(new URL("../../../", import.meta.url));
const tempRoots: string[] = [];

function makeTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "anvilkit-init-"));
	tempRoots.push(dir);
	return dir;
}

function runCli(args: readonly string[], env?: NodeJS.ProcessEnv) {
	return spawnSync(
		"node",
		["--import", "tsx", "src/bin/anvilkit.ts", ...args],
		{
			cwd: packageRoot,
			encoding: "utf8",
			env: {
				...process.env,
				...env,
			},
		},
	);
}

afterEach(() => {
	for (const tempRoot of tempRoots.splice(0, tempRoots.length)) {
		rmSync(tempRoot, { recursive: true, force: true });
	}
});

describe("init command", () => {
	it("scaffolds a new project into an empty directory", () => {
		const tempRoot = makeTempDir();
		const targetDir = join(tempRoot, "marketing-site");
		const result = runCli(["init", targetDir, "--pm", "npm", "--no-input"], {
			ANVILKIT_SKIP_INSTALL: "1",
		});

		expect(result.status).toBe(0);
		expect(result.stdout).toBe("");
		expect(result.stderr).toContain("Created marketing-site");
		expect(existsSync(join(targetDir, "package.json"))).toBe(true);
		expect(
			existsSync(join(targetDir, "app", "puck", "[...puck]", "page.tsx")),
		).toBe(true);
	});

	it("fails when the target directory is not empty without --force", () => {
		const tempRoot = makeTempDir();
		const targetDir = join(tempRoot, "non-empty");
		mkdirSync(targetDir, { recursive: true });
		writeFileSync(join(targetDir, "keep.txt"), "occupied\n", "utf8");

		const result = runCli(["init", targetDir, "--pm", "npm", "--no-input"], {
			ANVILKIT_SKIP_INSTALL: "1",
		});

		expect(result.status).toBe(2);
		expect(result.stderr).toContain("[DIR_NOT_EMPTY]");
	});

	it("fails fast in non-interactive mode when dir is missing", () => {
		const result = runCli(["init"]);

		expect(result.status).toBe(2);
		expect(result.stderr).toContain("[MISSING_DIR]");
	});

	it("hydrates the template import and dependency when --template is set", () => {
		const tempRoot = makeTempDir();
		const targetDir = join(tempRoot, "templated-site");
		const result = runCli(
			[
				"init",
				targetDir,
				"--template",
				"landing-saas",
				"--pm",
				"npm",
				"--no-input",
			],
			{ ANVILKIT_SKIP_INSTALL: "1" },
		);

		expect(result.status).toBe(0);

		const pageFile = readFileSync(
			join(targetDir, "app", "puck", "[...puck]", "page.tsx"),
			"utf8",
		);
		const packageJson = JSON.parse(
			readFileSync(join(targetDir, "package.json"), "utf8"),
		) as {
			dependencies: Record<string, string>;
		};

		expect(pageFile).toContain(
			'import { pageIR as initialData } from "@anvilkit/template-landing-saas";',
		);
		expect(pageFile).toContain("const seedPageIR: PageIR = initialData;");
		expect(packageJson.dependencies["@anvilkit/template-landing-saas"]).toBe(
			packageJson.dependencies["@anvilkit/core"],
		);
	});
});
