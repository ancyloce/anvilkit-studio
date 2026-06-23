/**
 * @file Optional ICU-subset `MessageFormatter` for `@anvilkit/core`.
 *
 * Opt-in via the `@anvilkit/core/i18n/icu` subpath, so the base bundle keeps
 * its zero-dependency `{token}`-only `braceFormatter`. This adds the
 * common ICU MessageFormat constructs — `plural` / `selectordinal`, `select`,
 * and `number` / `date` / `time` argument formatting — built entirely on the
 * platform `Intl` APIs (`Intl.PluralRules`, `Intl.NumberFormat`,
 * `Intl.DateTimeFormat`). **No runtime dependency.**
 *
 * Inject it through the `MessageFormatter` seam on `studioConfig.i18n`:
 *
 * ```ts
 * import { createIcuFormatter } from "@anvilkit/core/i18n/icu";
 * createStudioConfig({ i18n: { formatter: createIcuFormatter() } });
 * ```
 *
 * **Scope — a subset, not a spec-complete ICU parser.** Supported:
 *
 * - simple args:            `{name}`
 * - plural / selectordinal: `{n, plural, one {# item} other {# items}}`
 *                           (`#` → the formatted number; `=N` exact cases)
 * - select:                 `{g, select, female {…} male {…} other {…}}`
 * - number:                 `{n, number}`, `{n, number, integer|percent}`,
 *                           `{n, number, ::currency/USD}`
 * - date / time:            `{d, date|time[, short|medium|long|full]}`
 *
 * Sub-messages nest and recurse. Anything unrecognized degrades gracefully
 * (the placeholder is left literal, matching `braceFormatter`); the
 * formatter **never throws**. ICU apostrophe escaping (`'{'`) is out of scope.
 *
 * React-free.
 */

import type { MessageFormatter } from "../format";
import type { Locale } from "../registry";

type Vars = Readonly<Record<string, string | number>>;

// ---------------------------------------------------------------------------
// Cached `Intl` factories. The constructors are comparatively expensive and a
// formatter is called once per rendered message, so memoize by locale+options.
// Keys are bounded in practice (a handful of locales × a handful of styles).
// ---------------------------------------------------------------------------

const numberFormats = new Map<string, Intl.NumberFormat>();
const dateTimeFormats = new Map<string, Intl.DateTimeFormat>();
const pluralRules = new Map<string, Intl.PluralRules>();

function numberFormat(
	locale: Locale,
	options: Intl.NumberFormatOptions,
): Intl.NumberFormat {
	const key = `${locale}|${JSON.stringify(options)}`;
	let fmt = numberFormats.get(key);
	if (fmt === undefined) {
		fmt = new Intl.NumberFormat(locale, options);
		numberFormats.set(key, fmt);
	}
	return fmt;
}

function dateTimeFormat(
	locale: Locale,
	options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
	const key = `${locale}|${JSON.stringify(options)}`;
	let fmt = dateTimeFormats.get(key);
	if (fmt === undefined) {
		fmt = new Intl.DateTimeFormat(locale, options);
		dateTimeFormats.set(key, fmt);
	}
	return fmt;
}

function pluralRule(
	locale: Locale,
	type: Intl.PluralRuleType,
): Intl.PluralRules {
	const key = `${locale}|${type}`;
	let rule = pluralRules.get(key);
	if (rule === undefined) {
		rule = new Intl.PluralRules(locale, { type });
		pluralRules.set(key, rule);
	}
	return rule;
}

// ---------------------------------------------------------------------------
// Brace-aware scanning helpers.
// ---------------------------------------------------------------------------

/** Index of the `}` matching the `{` at `open`, or -1 when unbalanced. */
function matchBrace(str: string, open: number): number {
	let depth = 0;
	for (let i = open; i < str.length; i++) {
		const char = str[i];
		if (char === "{") {
			depth++;
		} else if (char === "}") {
			depth--;
			if (depth === 0) {
				return i;
			}
		}
	}
	return -1;
}

/** Index of the first `ch` at brace-depth 0 at or after `from`, else -1. */
function indexOfTopLevel(str: string, ch: string, from: number): number {
	let depth = 0;
	for (let i = from; i < str.length; i++) {
		const char = str[i];
		if (char === "{") {
			depth++;
		} else if (char === "}") {
			depth--;
		} else if (char === ch && depth === 0) {
			return i;
		}
	}
	return -1;
}

/** Split an argument body `name[, type[, style]]` on its top-level commas. */
function splitArg(inner: string): {
	name: string;
	type?: string;
	style?: string;
} {
	const firstComma = indexOfTopLevel(inner, ",", 0);
	if (firstComma === -1) {
		return { name: inner.trim() };
	}
	const name = inner.slice(0, firstComma).trim();
	const rest = inner.slice(firstComma + 1);
	const secondComma = indexOfTopLevel(rest, ",", 0);
	if (secondComma === -1) {
		return { name, type: rest.trim() };
	}
	return {
		name,
		type: rest.slice(0, secondComma).trim(),
		style: rest.slice(secondComma + 1).trim(),
	};
}

/** Parse `keyword {submsg} keyword {submsg} …` into a `keyword → submsg` map. */
function parseCases(str: string): Map<string, string> {
	const cases = new Map<string, string>();
	let i = 0;
	while (i < str.length) {
		const braceStart = str.indexOf("{", i);
		if (braceStart === -1) {
			break;
		}
		const keyword = str.slice(i, braceStart).trim();
		const braceEnd = matchBrace(str, braceStart);
		if (braceEnd === -1) {
			break;
		}
		if (keyword.length > 0) {
			cases.set(keyword, str.slice(braceStart + 1, braceEnd));
		}
		i = braceEnd + 1;
	}
	return cases;
}

function toNumber(value: string | number | undefined): number {
	return typeof value === "number" ? value : Number(value);
}

// ---------------------------------------------------------------------------
// Argument formatters.
// ---------------------------------------------------------------------------

function formatNumber(
	value: string | number | undefined,
	style: string | undefined,
	locale: Locale,
): string {
	const options: Intl.NumberFormatOptions = {};
	if (style === "integer") {
		options.maximumFractionDigits = 0;
	} else if (style === "percent") {
		options.style = "percent";
	} else if (style?.startsWith("::currency/")) {
		options.style = "currency";
		options.currency = style.slice("::currency/".length).trim();
	}
	return numberFormat(locale, options).format(toNumber(value));
}

function formatDateTime(
	value: string | number | undefined,
	style: string | undefined,
	locale: Locale,
	kind: "date" | "time",
): string {
	const named = ["short", "medium", "long", "full"] as const;
	type NamedStyle = (typeof named)[number];
	const resolved: NamedStyle = (named as readonly string[]).includes(
		style ?? "",
	)
		? (style as NamedStyle)
		: "medium";
	const options: Intl.DateTimeFormatOptions =
		kind === "date" ? { dateStyle: resolved } : { timeStyle: resolved };
	return dateTimeFormat(locale, options).format(new Date(value ?? Date.now()));
}

function formatPlural(
	name: string,
	value: string | number | undefined,
	casesStr: string,
	vars: Vars,
	locale: Locale,
	ordinal: boolean,
): string {
	const num = toNumber(value);
	const cases = parseCases(casesStr);
	// Exact `=N` cases win over the keyword category (ICU semantics).
	let chosen = cases.get(`=${num}`);
	if (chosen === undefined) {
		const category = Number.isNaN(num)
			? "other"
			: pluralRule(locale, ordinal ? "ordinal" : "cardinal").select(num);
		chosen = cases.get(category) ?? cases.get("other");
	}
	if (chosen === undefined) {
		return value === undefined ? `{${name}}` : String(value);
	}
	// `#` inside the chosen sub-message renders the formatted number.
	const pound = numberFormat(locale, {}).format(num);
	return format(chosen, vars, locale, pound);
}

function formatSelect(
	name: string,
	value: string | number | undefined,
	casesStr: string,
	vars: Vars,
	locale: Locale,
): string {
	const cases = parseCases(casesStr);
	const chosen = cases.get(String(value)) ?? cases.get("other");
	if (chosen === undefined) {
		return value === undefined ? `{${name}}` : String(value);
	}
	return format(chosen, vars, locale);
}

function formatArg(inner: string, vars: Vars, locale: Locale): string {
	const { name, type, style } = splitArg(inner);
	const value = vars[name];
	if (type === undefined) {
		// Simple `{name}` — leave literal when missing (brace-formatter parity).
		return value === undefined ? `{${name}}` : String(value);
	}
	try {
		switch (type) {
			case "number":
				return formatNumber(value, style, locale);
			case "date":
				return formatDateTime(value, style, locale, "date");
			case "time":
				return formatDateTime(value, style, locale, "time");
			case "plural":
				return formatPlural(name, value, style ?? "", vars, locale, false);
			case "selectordinal":
				return formatPlural(name, value, style ?? "", vars, locale, true);
			case "select":
				return formatSelect(name, value, style ?? "", vars, locale);
			default:
				// Unknown argument type — leave the whole placeholder literal.
				return `{${inner}}`;
		}
	} catch {
		return value === undefined ? `{${name}}` : String(value);
	}
}

/**
 * Recursively format an ICU(-subset) message. `pound`, when set, is the value
 * substituted for `#` inside a plural sub-message.
 */
function format(
	message: string,
	vars: Vars,
	locale: Locale,
	pound?: string,
): string {
	let out = "";
	let i = 0;
	while (i < message.length) {
		const char = message[i];
		if (char === "#" && pound !== undefined) {
			out += pound;
			i++;
			continue;
		}
		if (char !== "{") {
			out += char;
			i++;
			continue;
		}
		const close = matchBrace(message, i);
		if (close === -1) {
			// Unbalanced `{` — emit the remainder verbatim and stop.
			out += message.slice(i);
			break;
		}
		out += formatArg(message.slice(i + 1, close), vars, locale);
		i = close + 1;
	}
	return out;
}

/**
 * Create an ICU-subset `MessageFormatter`. The returned formatter never
 * throws: a malformed message degrades to its closest literal rendering.
 */
export function createIcuFormatter(): MessageFormatter {
	return (message, vars, locale) => {
		try {
			return format(message, vars, locale);
		} catch {
			// Last-resort safety net — never throw out of the formatter.
			return message;
		}
	};
}

/** A ready-made ICU-subset formatter (equivalent to `createIcuFormatter()`). */
export const icuFormatter: MessageFormatter = createIcuFormatter();
