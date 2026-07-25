/**
 * @file CORE-P1A-018 — editor UI i18n catalog: `studio.editor.*`
 * parity across en/zh/ja/ko, every key referenced in `src/react/
 * editor/` resolving in all four locales, and the hardcoded-string
 * grep gate over the editor UI sources (no user-visible English
 * literals outside the catalog).
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Vitest may run from the package or the workspace root; resolve the
// package root by probing for the catalog directory.
const packageRoot = existsSync(join(process.cwd(), "i18n", "messages"))
	? process.cwd()
	: join(process.cwd(), "packages", "runtime", "core");
const LOCALES = ["en", "zh", "ja", "ko"] as const;

function catalog(locale: string): Record<string, string> {
	return JSON.parse(
		readFileSync(
			join(packageRoot, "i18n", "messages", `${locale}.json`),
			"utf8",
		),
	) as Record<string, string>;
}

function editorSourceFiles(): readonly string[] {
	const root = join(packageRoot, "src", "react", "editor");
	const out: string[] = [];
	const walk = (dir: string): void => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (entry.name !== "__tests__") {
					walk(path);
				}
			} else if (/\.(ts|tsx)$/.test(entry.name)) {
				out.push(path);
			}
		}
	};
	walk(root);
	return out;
}

describe("studio.editor.* catalog parity (CORE-P1A-018)", () => {
	const catalogs = Object.fromEntries(
		LOCALES.map((locale) => [locale, catalog(locale)]),
	);
	const editorKeys = (locale: string): readonly string[] =>
		Object.keys(catalogs[locale] ?? {}).filter((key) =>
			key.startsWith("studio.editor."),
		);

	it("every editor key exists in all four locales", () => {
		const union = new Set(LOCALES.flatMap((locale) => editorKeys(locale)));
		for (const locale of LOCALES) {
			const keys = new Set(editorKeys(locale));
			const missing = [...union].filter((key) => !keys.has(key));
			expect(missing, `missing in ${locale}`).toEqual([]);
		}
		expect(union.size).toBeGreaterThan(80);
	});

	it("every studio.editor.* key referenced in sources resolves in every locale", () => {
		const referenced = new Set<string>();
		for (const file of editorSourceFiles()) {
			const source = readFileSync(file, "utf8");
			for (const match of source.matchAll(
				/"(studio\.editor\.[a-zA-Z0-9.-]+)"/g,
			)) {
				referenced.add(match[1] as string);
			}
		}
		expect(referenced.size).toBeGreaterThan(40);
		for (const locale of LOCALES) {
			const keys = catalogs[locale] ?? {};
			// Template-joined keys (e.g. `studio.editor.inspector.edge.${edge}`)
			// appear literally in the catalog but not the source scan; the
			// reverse direction is the contract: every referenced literal
			// must resolve.
			const unresolved = [...referenced].filter(
				(key) => keys[key] === undefined,
			);
			expect(unresolved, `unresolved in ${locale}`).toEqual([]);
		}
	});
});

describe("hardcoded-string grep gate over src/react/editor (CORE-P1A-018)", () => {
	it("finds no multi-word English JSX text outside the catalog", () => {
		// Heuristic: JSX text children with two or more consecutive
		// capitalized-English words (real sentences/labels). Technical
		// literals (CSS keywords, ids, numbers, single tokens) pass.
		const offenders: string[] = [];
		const jsxText = />\s*([A-Z][a-z]+(?: [A-Za-z][a-z]+)+)\s*</g;
		for (const file of editorSourceFiles()) {
			const source = readFileSync(file, "utf8");
			for (const match of source.matchAll(jsxText)) {
				offenders.push(`${file}: ${match[1]}`);
			}
			// Hardcoded aria-labels / placeholders with English sentences.
			for (const match of source.matchAll(
				/(?:aria-label|placeholder)=\{?"([A-Z][a-z]+(?: [a-z]+)+)"/g,
			)) {
				offenders.push(`${file}: ${match[1]}`);
			}
		}
		expect(offenders).toEqual([]);
	});
});
