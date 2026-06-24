/**
 * @file Tests for the optional ICU-subset MessageFormatter (report 0003, P1-4).
 */

import { describe, expect, it } from "vitest";
import { createIcuFormatter, icuFormatter } from "@/i18n/icu";

const fmt = createIcuFormatter();
const en = "en";

describe("icu formatter — simple interpolation", () => {
	it("interpolates {name}", () => {
		expect(fmt("Hi {name}", { name: "Ada" }, en)).toBe("Hi Ada");
	});
	it("leaves a missing simple arg literal (brace-formatter parity)", () => {
		expect(fmt("Hi {name}", {}, en)).toBe("Hi {name}");
	});
	it("the icuFormatter singleton behaves the same", () => {
		expect(icuFormatter("Hi {name}", { name: "Ada" }, en)).toBe("Hi Ada");
	});
	it("passes plain text through unchanged", () => {
		expect(fmt("just text", {}, en)).toBe("just text");
	});
});

describe("icu formatter — plural", () => {
	const msg = "{n, plural, one {# item} other {# items}}";
	it("selects one/other and substitutes #", () => {
		expect(fmt(msg, { n: 1 }, en)).toBe("1 item");
		expect(fmt(msg, { n: 5 }, en)).toBe("5 items");
	});
	it("honors =N exact cases over the keyword category", () => {
		const exact = "{n, plural, =0 {no items} one {# item} other {# items}}";
		expect(fmt(exact, { n: 0 }, en)).toBe("no items");
		expect(fmt(exact, { n: 1 }, en)).toBe("1 item");
	});
	it("nests sub-arguments inside a plural case", () => {
		const nested = "{n, plural, one {# {thing}} other {# {thing}s}}";
		expect(fmt(nested, { n: 1, thing: "box" }, en)).toBe("1 box");
		expect(fmt(nested, { n: 3, thing: "box" }, en)).toBe("3 boxs");
	});
});

describe("icu formatter — selectordinal", () => {
	it("formats English ordinals", () => {
		const msg = "{n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}";
		expect(fmt(msg, { n: 1 }, en)).toBe("1st");
		expect(fmt(msg, { n: 2 }, en)).toBe("2nd");
		expect(fmt(msg, { n: 3 }, en)).toBe("3rd");
		expect(fmt(msg, { n: 4 }, en)).toBe("4th");
	});
});

describe("icu formatter — select", () => {
	const msg = "{g, select, female {she} male {he} other {they}}";
	it("selects by exact value, falling back to other", () => {
		expect(fmt(msg, { g: "female" }, en)).toBe("she");
		expect(fmt(msg, { g: "male" }, en)).toBe("he");
		expect(fmt(msg, { g: "nonbinary" }, en)).toBe("they");
	});
});

describe("icu formatter — number", () => {
	it("formats with grouping", () => {
		expect(fmt("{n, number}", { n: 1234.5 }, en)).toBe("1,234.5");
	});
	it("integer style rounds and drops fractions", () => {
		expect(fmt("{n, number, integer}", { n: 1234.9 }, en)).toBe("1,235");
	});
	it("percent style", () => {
		expect(fmt("{n, number, percent}", { n: 0.5 }, en)).toBe("50%");
	});
	it("currency skeleton", () => {
		expect(fmt("{n, number, ::currency/USD}", { n: 5 }, en)).toBe("$5.00");
	});
	it("honors the locale", () => {
		expect(fmt("{n, number}", { n: 1234.5 }, "de")).toBe("1.234,5");
	});
});

describe("icu formatter — date / time", () => {
	const ts = Date.UTC(2023, 5, 15, 12, 0, 0); // 2023-06-15T12:00:00Z

	it("formats a medium date containing the year", () => {
		expect(fmt("{d, date}", { d: ts }, en)).toContain("2023");
	});
	it("formats a short date as a non-empty, non-literal string", () => {
		const out = fmt("{d, date, short}", { d: ts }, en);
		expect(out).not.toBe("{d, date, short}");
		expect(out.length).toBeGreaterThan(0);
	});
	it("formats a time as a non-empty string", () => {
		expect(fmt("{t, time, short}", { t: ts }, en).length).toBeGreaterThan(0);
	});
});

describe("icu formatter — graceful degradation (never throws)", () => {
	it("leaves an unknown argument type literal", () => {
		expect(fmt("{x, frobnicate, a {b}}", { x: 1 }, en)).toContain("frobnicate");
	});
	it("does not throw on an unbalanced brace", () => {
		expect(() => fmt("hello {n, plural, one {x", { n: 1 }, en)).not.toThrow();
	});
});

describe("icu formatter — missing typed vars degrade to literal", () => {
	it("leaves {n, number} literal when n is missing (not NaN)", () => {
		expect(fmt("{n, number}", {}, en)).toBe("{n, number}");
	});
	it("leaves {d, date} literal when d is missing (not the current date)", () => {
		expect(fmt("{d, date}", {}, en)).toBe("{d, date}");
	});
	it("leaves a plural literal when its var is missing (not 'NaN items')", () => {
		const msg = "{n, plural, one {# item} other {# items}}";
		expect(fmt(msg, {}, en)).toBe(msg);
	});
});

describe("icu formatter — Intl failures degrade to the full placeholder", () => {
	it("leaves an invalid currency skeleton literal (not the bare value)", () => {
		// `US` is not a valid ISO-4217 code → Intl throws → full literal.
		expect(fmt("{n, number, ::currency/US}", { n: 5 }, en)).toBe(
			"{n, number, ::currency/US}",
		);
	});
});

describe("icu formatter — # propagation + locale categories", () => {
	it("propagates the plural # into a nested select case", () => {
		const msg = "{n, plural, other {{g, select, x {# files} other {# docs}}}}";
		expect(fmt(msg, { n: 3, g: "x" }, en)).toBe("3 files");
		expect(fmt(msg, { n: 7, g: "y" }, en)).toBe("7 docs");
	});
	it("uses locale-specific plural categories (Polish few/many)", () => {
		const msg = "{n, plural, one {jeden} few {kilka} many {dużo} other {inne}}";
		expect(fmt(msg, { n: 2 }, "pl")).toBe("kilka");
		expect(fmt(msg, { n: 5 }, "pl")).toBe("dużo");
	});
});

describe("icu formatter — unsupported styles & bad values degrade to literal", () => {
	it("leaves an unsupported number style literal (not a plain number)", () => {
		expect(fmt("{n, number, watts}", { n: 5 }, en)).toBe("{n, number, watts}");
	});
	it("leaves an unsupported date style literal (not a medium date)", () => {
		const ts = Date.UTC(2023, 5, 15, 12, 0, 0);
		expect(fmt("{d, date, bogus}", { d: ts }, en)).toBe("{d, date, bogus}");
	});
	it("leaves {n, number} literal for a non-numeric value (not NaN)", () => {
		expect(fmt("{n, number}", { n: "abc" }, en)).toBe("{n, number}");
	});
	it("leaves a plural literal for a non-numeric value (not 'NaN items')", () => {
		const msg = "{n, plural, other {# items}}";
		expect(fmt(msg, { n: "abc" }, en)).toBe(msg);
	});
	it("accepts a numeric-string timestamp for a date", () => {
		const ts = Date.UTC(2023, 5, 15, 12, 0, 0);
		expect(fmt("{d, date}", { d: String(ts) }, en)).toContain("2023");
	});
	it("leaves a plural literal when no case matches and there is no other", () => {
		const msg = "{n, plural, one {# item}}";
		expect(fmt(msg, { n: 2 }, en)).toBe(msg);
	});
	it("leaves a select literal when no value matches and there is no other", () => {
		const msg = "{g, select, male {he}}";
		expect(fmt(msg, { g: "female" }, en)).toBe(msg);
	});
});
