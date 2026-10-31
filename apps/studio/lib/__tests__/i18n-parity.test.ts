/**
 * Locale parity of the demo catalogs (plan 0005 §5, B5). The Agent
 * generation path (`progress.*`, `prepare.*`, `operation.*` and their
 * `meta.*` titles) must exist in all four catalogs with identical `{param}`
 * sets. The remaining Agent namespaces (`workbench`, `remote`, `knowledge`,
 * `mcp`, `release` and their `meta.*` titles) are a pre-existing gap of
 * `zh`, `ja` and `ko` listed as a follow-up: the test pins that gap so that
 * no new one appears unnoticed.
 */
import { describe, expect, it } from "vitest";
import en from "../i18n/messages/en.json";
import ja from "../i18n/messages/ja.json";
import ko from "../i18n/messages/ko.json";
import zh from "../i18n/messages/zh.json";

const catalogs: Record<string, Record<string, string>> = { en, zh, ja, ko };
const others = ["zh", "ja", "ko"] as const;

/** Namespaces this plan completes in every catalog. */
const COMPLETE = [
	"progress.",
	"prepare.",
	"operation.",
	"meta.prepare.",
	"meta.operation.",
];
/** Namespaces whose absence from zh/ja/ko is the known follow-up (not claimed). */
const KNOWN_GAP = [
	"workbench.",
	"remote.",
	"knowledge.",
	"mcp.",
	"release.",
	"meta.workbench.",
	"meta.knowledge.",
	"meta.mcp.",
	"meta.release.",
];

const params = (text: string): string[] =>
	[...text.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1] ?? "").sort();

describe("locale parity", () => {
	it("every catalog key exists in en", () => {
		for (const locale of others) {
			const extra = Object.keys(catalogs[locale] ?? {}).filter(
				(k) => !(k in en),
			);
			expect(extra, locale).toEqual([]);
		}
	});

	it("the generation path is complete in all four catalogs", () => {
		const keys = Object.keys(en).filter((k) =>
			COMPLETE.some((p) => k.startsWith(p)),
		);
		expect(keys.length).toBeGreaterThan(100);
		for (const locale of others) {
			const missing = keys.filter((k) => !(k in (catalogs[locale] ?? {})));
			expect(missing, locale).toEqual([]);
		}
	});

	it("every translated key carries the same {param} set as en", () => {
		for (const locale of others) {
			const catalog = catalogs[locale] ?? {};
			for (const [key, text] of Object.entries(catalog)) {
				expect(params(text), `${locale}:${key}`).toEqual(
					params(en[key as keyof typeof en] ?? ""),
				);
			}
		}
	});

	it("every new progress string is its own text, not the English fallback", () => {
		const keys = Object.keys(en).filter((k) => k.startsWith("progress."));
		for (const locale of others) {
			const same = keys.filter(
				(k) => catalogs[locale]?.[k] === en[k as keyof typeof en],
			);
			expect(same, locale).toEqual([]);
		}
	});

	it("the only keys missing from zh, ja and ko are the listed follow-up namespaces", () => {
		for (const locale of others) {
			const missing = Object.keys(en).filter(
				(k) => !(k in (catalogs[locale] ?? {})),
			);
			const unexpected = missing.filter(
				(k) => !KNOWN_GAP.some((p) => k.startsWith(p)),
			);
			expect(unexpected, locale).toEqual([]);
		}
	});
});
