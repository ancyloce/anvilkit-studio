import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { detectPm } from "../../utils/detect-pm.js";

const tempRoots: string[] = [];
const originalUserAgent = process.env.npm_config_user_agent;

function makeTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "detect-pm-"));
	tempRoots.push(dir);
	return dir;
}

function writeLockfile(root: string, lockfile: string): string {
	const nestedDir = join(root, "nested", "deeper");
	mkdirSync(nestedDir, { recursive: true });
	writeFileSync(join(root, lockfile), "", "utf8");
	return nestedDir;
}

afterEach(() => {
	if (originalUserAgent === undefined) {
		delete process.env.npm_config_user_agent;
	} else {
		process.env.npm_config_user_agent = originalUserAgent;
	}

	for (const tempRoot of tempRoots.splice(0, tempRoots.length)) {
		rmSync(tempRoot, { recursive: true, force: true });
	}
});

describe("detectPm", () => {
	it("prefers npm_config_user_agent when present", () => {
		process.env.npm_config_user_agent = "pnpm/10.33.0 node/v22.0.0";

		expect(detectPm(process.cwd())).toBe("pnpm");
	});

	it("detects pnpm from an ancestor pnpm-lock.yaml", () => {
		delete process.env.npm_config_user_agent;
		const root = makeTempDir();

		expect(detectPm(writeLockfile(root, "pnpm-lock.yaml"))).toBe("pnpm");
	});

	it("detects yarn from an ancestor yarn.lock", () => {
		delete process.env.npm_config_user_agent;
		const root = makeTempDir();

		expect(detectPm(writeLockfile(root, "yarn.lock"))).toBe("yarn");
	});

	it("detects bun from an ancestor bun.lock", () => {
		delete process.env.npm_config_user_agent;
		const root = makeTempDir();

		expect(detectPm(writeLockfile(root, "bun.lock"))).toBe("bun");
	});

	it("detects npm from an ancestor package-lock.json", () => {
		delete process.env.npm_config_user_agent;
		const root = makeTempDir();

		expect(detectPm(writeLockfile(root, "package-lock.json"))).toBe("npm");
	});

	it("falls back to npm when no user agent or lockfile is present", () => {
		delete process.env.npm_config_user_agent;
		const root = makeTempDir();

		expect(detectPm(root)).toBe("npm");
	});
});
