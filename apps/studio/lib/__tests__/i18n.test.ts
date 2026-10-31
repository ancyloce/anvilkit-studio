import { describe, expect, it } from "vitest";
import {
	createTranslator,
	type DemoMessageKey,
	formatDateTime,
	formatNumber,
	interpolate,
} from "../i18n/messages";

describe("demo i18n translator", () => {
	it("fills {name} tokens and leaves unknown tokens visible", () => {
		expect(
			interpolate("Round {round} of {total}", { round: 2, total: "3" }),
		).toBe("Round 2 of 3");
		expect(interpolate("Code {code}", {})).toBe("Code {code}");
		expect(interpolate("No tokens")).toBe("No tokens");
	});

	it("resolves the active locale, then en, then the key; params apply in every case", () => {
		const zh = createTranslator("zh");
		expect(zh("progress.stage.validationFailed", { code: "X" })).toBe(
			"验证失败：X",
		);
		// A key present in every catalog translates; a key absent from zh (the
		// release namespace, a listed follow-up) falls back to en; an unknown
		// key renders itself.
		const en = createTranslator("en");
		expect(zh("nav.language")).not.toBe(en("nav.language"));
		expect(zh("release.openRelease")).toBe(en("release.openRelease"));
		expect(en("does.not.exist {x}" as DemoMessageKey, { x: "1" })).toBe(
			"does.not.exist 1",
		);
	});

	it("formats counts and timestamps per locale with Intl", () => {
		expect(formatNumber("en", "12345")).toBe("12,345");
		expect(formatNumber("ko", 7)).toBe("7");
		const iso = "2026-10-23T19:51:41.648689Z";
		for (const locale of ["en", "zh", "ja", "ko"] as const) {
			const text = formatDateTime(locale, iso);
			expect(text).toMatch(/2026/);
			expect(text).not.toBe(iso);
		}
		expect(formatDateTime("en", "not a date")).toBe("not a date");
	});
});
