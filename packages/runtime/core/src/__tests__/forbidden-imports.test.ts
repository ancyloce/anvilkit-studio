import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * I2-6 bundle-analyzer regression gate (plan §1 + §5): "Konva must never appear
 * in `@anvilkit/core`'s import graph." This statically scans `@anvilkit/core`
 * source for import specifiers and fails if any reference Konva, react-konva,
 * or a `@anvilkit/canvas-*` package — keeping the canvas renderer (and its
 * ~250 KB of Konva) out of the core bundle. Pairs with the existing 25 KB
 * `<Studio>`-entry budget in `scripts/check-bundle-budget.mjs`.
 *
 * Passes today (core has no such imports); guards against future leakage. The
 * forbidden patterns live only in this excluded test file, so it never
 * self-matches.
 */
const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

const FORBIDDEN = /^(konva(\/|$)|react-konva(\/|$)|@anvilkit\/canvas-)/;
const SPECIFIER =
	/(?:from\s+|import\s+|import\(\s*|require\(\s*)["']([^"']+)["']/g;

function sourceFiles(dir: string, acc: string[] = []): string[] {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === "__tests__" || entry.name === "node_modules") continue;
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			sourceFiles(full, acc);
		} else if (
			/\.(ts|tsx)$/.test(entry.name) &&
			!/\.(test|spec)\.(ts|tsx)$/.test(entry.name) &&
			!entry.name.endsWith(".d.ts")
		) {
			acc.push(full);
		}
	}
	return acc;
}

describe("@anvilkit/core forbidden imports (I2-6 regression gate)", () => {
	it("never imports konva / react-konva / @anvilkit/canvas-* in source", () => {
		const violations: string[] = [];
		for (const file of sourceFiles(SRC_DIR)) {
			const content = readFileSync(file, "utf8");
			for (const match of content.matchAll(SPECIFIER)) {
				const spec = match[1] ?? "";
				if (FORBIDDEN.test(spec)) {
					violations.push(`${relative(SRC_DIR, file)} → "${spec}"`);
				}
			}
		}
		expect(violations).toEqual([]);
	});
});
