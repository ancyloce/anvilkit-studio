/**
 * Demo-site i18n core — the message catalogs plus a tiny, dependency-free
 * resolver shared by both server and client code paths.
 *
 * This localizes the demo's MARKETING chrome (global nav, footer, and the
 * Home / Editor / About pages). The Studio editor surfaces have their own
 * locale handling inside `@anvilkit/core` (an uncontrolled, per-`storeId`
 * persisted store + the built-in `<LanguageSwitcher>`); this module does not
 * touch that. The locales here mirror core's `SUPPORTED_LOCALES`
 * (en / zh / ja / ko) so the two surfaces speak the same language tags.
 */

import en from "./messages/en.json";
import ja from "./messages/ja.json";
import ko from "./messages/ko.json";
import zh from "./messages/zh.json";

/** Active locale tag. Maps the brief's `jp`/`kr` to the BCP-47 `ja`/`ko`. */
export type DemoLocale = "en" | "zh" | "ja" | "ko";

/** Every catalog key (the `en` baseline is the source of truth). */
export type DemoMessageKey = keyof typeof en;

/** The locale a returning/first-time visitor falls back to. */
export const DEFAULT_LOCALE: DemoLocale = "en";

/** Cookie the switcher writes and the server reads (see `server.ts`). */
export const LOCALE_COOKIE = "anvilkit-demo-locale";

/** One selectable locale: its tag plus the endonym shown in the switcher. */
export interface DemoLocaleOption {
	readonly locale: DemoLocale;
	/** Display name in the language's own script (matches core's labels). */
	readonly label: string;
}

/** Offered locales, in display order — endonyms mirror core's catalog. */
export const DEMO_LOCALES: readonly DemoLocaleOption[] = [
	{ locale: "en", label: "English" },
	{ locale: "zh", label: "中文" },
	{ locale: "ja", label: "日本語" },
	{ locale: "ko", label: "한국어" },
];

const CATALOGS: Record<DemoLocale, Record<string, string>> = {
	en,
	zh,
	ja,
	ko,
};

/** Narrow an arbitrary cookie/query value to a supported locale tag. */
export function resolveLocale(value: string | null | undefined): DemoLocale {
	return value === "zh" || value === "ja" || value === "ko" || value === "en"
		? value
		: DEFAULT_LOCALE;
}

/** Values for the `{name}` tokens of a message; numbers are rendered as given (format them first). */
export type DemoMessageParams = Readonly<Record<string, string | number>>;

/** A bound message resolver: missing keys back-fill from `en`, then the key. */
export type DemoTranslator = (
	key: DemoMessageKey,
	params?: DemoMessageParams,
) => string;

/**
 * Replaces every `{name}` token of `template` with `params[name]`; a token
 * without a value stays visible, so a missing parameter is noticed rather
 * than rendered as an empty string. No plural or select syntax: counts are
 * formatted by the caller (see {@link formatNumber}).
 */
export function interpolate(
	template: string,
	params?: DemoMessageParams,
): string {
	if (!params) return template;
	return template.replace(/\{([A-Za-z0-9_]+)\}/g, (token, name: string) =>
		name in params ? String(params[name]) : token,
	);
}

/**
 * Build a translator for `locale`. Resolution order: active locale → `en`
 * baseline → the key itself (so a typo'd key renders visibly rather than as
 * an empty string). Optional `params` fill the message's `{name}` tokens.
 */
export function createTranslator(locale: DemoLocale): DemoTranslator {
	const active = CATALOGS[locale] ?? CATALOGS[DEFAULT_LOCALE];
	return (key, params) => interpolate(active[key] ?? en[key] ?? key, params);
}

/** A count in the locale's digits and grouping (`Intl.NumberFormat`). */
export function formatNumber(
	locale: DemoLocale,
	value: number | string | bigint,
): string {
	const n = typeof value === "string" ? Number(value) : value;
	return new Intl.NumberFormat(locale).format(n);
}

/** A timestamp in the locale's medium date and time style (`Intl.DateTimeFormat`). */
export function formatDateTime(locale: DemoLocale, iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso;
	return new Intl.DateTimeFormat(locale, {
		dateStyle: "medium",
		timeStyle: "medium",
	}).format(date);
}
