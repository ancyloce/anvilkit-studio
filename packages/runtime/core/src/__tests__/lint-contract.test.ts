/**
 * @file Static contract for review 0037 P2-12 — package lint must
 * include Biome formatting and import-organization checks.
 */

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("package lint contract (0037 P2-12)", () => {
	it("uses `biome check` over shipped source and scripts", async () => {
		const here = dirname(fileURLToPath(import.meta.url));
		const packageJson = JSON.parse(
			await readFile(resolve(here, "../../package.json"), "utf8"),
		) as { scripts?: { lint?: string } };
		const lint = packageJson.scripts?.lint;

		expect(lint).toMatch(/^pnpm exec biome check\b/);
		expect(lint).toMatch(/\bsrc\b/);
		expect(lint).toMatch(/\bscripts\b/);
		expect(lint).not.toMatch(/\bbiome lint\b/);
	});
});
