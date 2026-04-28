import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { runAdd } from "../../commands/add.js";
import { CliError } from "../../utils/errors.js";

const REPO_ROOT = resolve(
	fileURLToPath(new URL("../../../../../", import.meta.url)),
);
const FEED_PATH = join(
	REPO_ROOT,
	"apps",
	"docs",
	"src",
	"registry",
	"feed.json",
);

const tempRoots: string[] = [];

function makeFixture(shape: ProjectShape): string {
	const dir = mkdtempSync(join(tmpdir(), "anvilkit-add-"));
	tempRoots.push(dir);
	for (const file of shape.files) {
		const fullPath = join(dir, file.path);
		const parent = fullPath.slice(0, fullPath.lastIndexOf("/"));
		mkdirSync(parent, { recursive: true });
		writeFileSync(fullPath, file.content, "utf8");
	}
	return dir;
}

afterEach(() => {
	for (const dir of tempRoots.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

interface ProjectShape {
	readonly name: string;
	readonly files: ReadonlyArray<{ path: string; content: string }>;
}

const TS_NEXT_CONFIG = `import type { NextConfig } from "next";

const nextConfig: NextConfig = {
\ttranspilePackages: ["@anvilkit/core", "@anvilkit/ir"],
};

export default nextConfig;
`;

const JS_NEXT_CONFIG = `/** @type {import("next").NextConfig} */
const nextConfig = {
\ttranspilePackages: ["@anvilkit/core", "@anvilkit/ir"],
};

export default nextConfig;
`;

const ROOT_PUCK_CONFIG = `import type { Config } from "@puckeditor/core";

export const puckConfig: Config = {
\tcomponents: {
\t\tHeading: {
\t\t\tfields: { text: { type: "text" } },
\t\t\tdefaultProps: { text: "hi" },
\t\t\trender: () => null,
\t\t},
\t},
};
`;

const ROOT_PUCK_CONFIG_WITH_PLUGINS = `import type { Config } from "@puckeditor/core";
import { createExportHtmlPlugin } from "@anvilkit/plugin-export-html";

export const puckConfig: Config = {
\tcomponents: {},
\tplugins: [createExportHtmlPlugin()],
};
`;

const LIB_PUCK_CONFIG = `import type { Config } from "@puckeditor/core";
import { Hero } from "@anvilkit/hero";

export const puckConfig: Config = {
\tcomponents: { Hero },
};
`;

const SHAPES = {
	defaultPhase5: {
		name: "default Phase 5 init",
		files: [
			{ path: "next.config.js", content: JS_NEXT_CONFIG },
			{ path: "puck-config.ts", content: ROOT_PUCK_CONFIG },
		],
	},
	customTheme: {
		name: "custom theme (lib/puck-config + tsx)",
		files: [
			{ path: "next.config.ts", content: TS_NEXT_CONFIG },
			{ path: "lib/puck-config.ts", content: LIB_PUCK_CONFIG },
		],
	},
	customPlugins: {
		name: "custom plugins list",
		files: [
			{ path: "next.config.js", content: JS_NEXT_CONFIG },
			{ path: "puck-config.ts", content: ROOT_PUCK_CONFIG_WITH_PLUGINS },
		],
	},
	customPath: {
		name: "explicit --puck-config / --next-config paths",
		files: [
			{ path: "config/next.cfg.ts", content: TS_NEXT_CONFIG },
			{ path: "config/puck.cfg.ts", content: ROOT_PUCK_CONFIG },
		],
	},
	jsFlavor: {
		name: "JS-flavor next.config.js",
		files: [
			{ path: "next.config.js", content: JS_NEXT_CONFIG },
			{ path: "puck-config.ts", content: ROOT_PUCK_CONFIG },
		],
	},
} satisfies Record<string, ProjectShape>;

const ENV = {
	feed: FEED_PATH,
	skipInstall: true,
};

function captureStreams(): {
	restore: () => void;
	stderr: () => string;
	stdout: () => string;
} {
	const stderrChunks: string[] = [];
	const stdoutChunks: string[] = [];
	const originalErr = process.stderr.write.bind(process.stderr);
	const originalOut = process.stdout.write.bind(process.stdout);
	process.stderr.write = ((chunk: unknown): boolean => {
		stderrChunks.push(String(chunk));
		return true;
	}) as typeof process.stderr.write;
	process.stdout.write = ((chunk: unknown): boolean => {
		stdoutChunks.push(String(chunk));
		return true;
	}) as typeof process.stdout.write;
	const previousSkip = process.env.ANVILKIT_SKIP_INSTALL;
	if (ENV.skipInstall) process.env.ANVILKIT_SKIP_INSTALL = "1";
	return {
		restore: () => {
			process.stderr.write = originalErr;
			process.stdout.write = originalOut;
			if (previousSkip === undefined) {
				delete process.env.ANVILKIT_SKIP_INSTALL;
			} else {
				process.env.ANVILKIT_SKIP_INSTALL = previousSkip;
			}
		},
		stderr: () => stderrChunks.join(""),
		stdout: () => stdoutChunks.join(""),
	};
}

describe("anvilkit add — happy paths", () => {
	it("default Phase 5 init: dry-run prints diff and writes nothing", async () => {
		const cwd = makeFixture(SHAPES.defaultPhase5);
		const cap = captureStreams();
		try {
			await runAdd("hero", { cwd, feed: ENV.feed });
		} finally {
			cap.restore();
		}
		const puck = readFileSync(join(cwd, "puck-config.ts"), "utf8");
		const next = readFileSync(join(cwd, "next.config.js"), "utf8");
		expect(puck).toBe(ROOT_PUCK_CONFIG);
		expect(next).toBe(JS_NEXT_CONFIG);
		expect(cap.stdout()).toContain("- ");
		expect(cap.stdout()).toContain("+ ");
		expect(cap.stderr()).toContain("Dry run");
	});

	it("default Phase 5 init: --write applies the codemod", async () => {
		const cwd = makeFixture(SHAPES.defaultPhase5);
		const cap = captureStreams();
		try {
			await runAdd("hero", { cwd, feed: ENV.feed, write: true });
		} finally {
			cap.restore();
		}
		const puck = readFileSync(join(cwd, "puck-config.ts"), "utf8");
		const next = readFileSync(join(cwd, "next.config.js"), "utf8");
		expect(puck).toContain(`import { Hero } from "@anvilkit/hero"`);
		expect(puck).toMatch(/components:\s*\{[\s\S]*Hero/);
		expect(next).toContain(`"@anvilkit/hero"`);
	});

	it("custom theme (lib/ + ts): --write resolves lib/puck-config.ts", async () => {
		const cwd = makeFixture(SHAPES.customTheme);
		const cap = captureStreams();
		try {
			await runAdd("bento-grid", { cwd, feed: ENV.feed, write: true });
		} finally {
			cap.restore();
		}
		const puck = readFileSync(join(cwd, "lib", "puck-config.ts"), "utf8");
		const next = readFileSync(join(cwd, "next.config.ts"), "utf8");
		expect(puck).toContain(`import { BentoGrid } from "@anvilkit/bento-grid"`);
		expect(next).toContain(`"@anvilkit/bento-grid"`);
	});

	it("custom plugins list: --write registers a new plugin without churning existing entries", async () => {
		const cwd = makeFixture(SHAPES.customPlugins);
		const cap = captureStreams();
		try {
			await runAdd("plugin-version-history", {
				cwd,
				feed: ENV.feed,
				write: true,
			});
		} finally {
			cap.restore();
		}
		const puck = readFileSync(join(cwd, "puck-config.ts"), "utf8");
		expect(puck).toContain(
			`import { createVersionHistoryPlugin } from "@anvilkit/plugin-version-history"`,
		);
		expect(puck).toContain("createExportHtmlPlugin()");
		expect(puck).toContain("createVersionHistoryPlugin()");
	});

	it("explicit --puck-config / --next-config paths", async () => {
		const cwd = makeFixture(SHAPES.customPath);
		const cap = captureStreams();
		try {
			await runAdd("hero", {
				cwd,
				feed: ENV.feed,
				write: true,
				puckConfig: "config/puck.cfg.ts",
				nextConfig: "config/next.cfg.ts",
			});
		} finally {
			cap.restore();
		}
		const puck = readFileSync(join(cwd, "config", "puck.cfg.ts"), "utf8");
		expect(puck).toContain(`import { Hero } from "@anvilkit/hero"`);
	});

	it("JS-flavor next.config.js: --write inserts and re-sorts the array", async () => {
		const cwd = makeFixture(SHAPES.jsFlavor);
		const cap = captureStreams();
		try {
			await runAdd("hero", { cwd, feed: ENV.feed, write: true });
		} finally {
			cap.restore();
		}
		const next = readFileSync(join(cwd, "next.config.js"), "utf8");
		expect(next).toContain(`"@anvilkit/hero"`);
	});
});

describe("anvilkit add — idempotency", () => {
	it("running twice with --write produces no second-pass changes", async () => {
		const cwd = makeFixture(SHAPES.defaultPhase5);
		const cap = captureStreams();
		try {
			await runAdd("hero", { cwd, feed: ENV.feed, write: true });
			const afterFirst = readFileSync(join(cwd, "puck-config.ts"), "utf8");
			await runAdd("hero", { cwd, feed: ENV.feed, write: true });
			const afterSecond = readFileSync(join(cwd, "puck-config.ts"), "utf8");
			expect(afterSecond).toBe(afterFirst);
		} finally {
			cap.restore();
		}
	});
});

describe("anvilkit add — failure modes", () => {
	it("rejects an unknown slug", async () => {
		const cwd = makeFixture(SHAPES.defaultPhase5);
		const cap = captureStreams();
		try {
			await expect(
				runAdd("totally-not-a-slug", { cwd, feed: ENV.feed }),
			).rejects.toBeInstanceOf(CliError);
		} finally {
			cap.restore();
		}
	});

	it("errors when puck-config cannot be located", async () => {
		const dir = mkdtempSync(join(tmpdir(), "anvilkit-add-noconfig-"));
		tempRoots.push(dir);
		writeFileSync(join(dir, "next.config.js"), JS_NEXT_CONFIG, "utf8");
		const cap = captureStreams();
		try {
			await expect(
				runAdd("hero", { cwd: dir, feed: ENV.feed }),
			).rejects.toBeInstanceOf(CliError);
		} finally {
			cap.restore();
		}
	});

	it("errors on --kind mismatch", async () => {
		const cwd = makeFixture(SHAPES.defaultPhase5);
		const cap = captureStreams();
		try {
			await expect(
				runAdd("hero", { cwd, feed: ENV.feed, kind: "plugin" }),
			).rejects.toBeInstanceOf(CliError);
		} finally {
			cap.restore();
		}
	});
});
