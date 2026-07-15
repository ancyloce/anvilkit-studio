import { defineI18n } from "fumadocs-core/i18n";

// Docs internationalization. English is the default locale and keeps the live
// Starlight URLs (`/getting-started`, `/guides/...`) with NO locale prefix
// (`hideLocale: 'default-locale'`); zh/ja/ko are served under a prefix
// (`/zh/getting-started`, `/ja/...`, `/ko/...`).
//
// `parser` defaults to `'dot'`: the default locale uses the bare filename
// (`getting-started.mdx`) and translations use a locale suffix
// (`getting-started.zh.mdx`). Pages with no translation fall back to English via
// `fallbackLanguage`, so every page is reachable in every locale even before its
// content is translated.
export const i18n = defineI18n({
	languages: ["en", "zh", "ja", "ko"],
	defaultLanguage: "en",
	hideLocale: "default-locale",
	fallbackLanguage: "en",
});

// Non-default locales — the ones that carry a URL prefix.
const PREFIXED_LOCALES: string[] = i18n.languages.filter(
	(lang) => lang !== i18n.defaultLanguage,
);

// True when `segment` is a non-default locale that prefixes the URL.
export function isPrefixedLocale(segment: string | undefined): boolean {
	return segment !== undefined && PREFIXED_LOCALES.includes(segment);
}

// Split a docs splat into its locale + remaining slugs.
// `['zh', 'guides', 'collaboration']` → `{ locale: 'zh', slugs: ['guides', 'collaboration'] }`.
// Paths without a locale prefix resolve to the default language.
export function splitLocale(segments: string[]): {
	locale: string;
	slugs: string[];
} {
	if (segments.length > 0 && isPrefixedLocale(segments[0])) {
		return { locale: segments[0], slugs: segments.slice(1) };
	}
	return { locale: i18n.defaultLanguage, slugs: segments };
}

// Derive the active locale from a full pathname (e.g. `/zh/guides/x` → `zh`).
export function localeFromPathname(pathname: string): string {
	const [first] = pathname.split("/").filter(Boolean);
	return isPrefixedLocale(first) ? (first as string) : i18n.defaultLanguage;
}

// Strip a leading locale prefix from a pathname, returning the locale-agnostic
// remainder without a leading slash (`/zh/guides/x` → `guides/x`, `/` → ``).
export function stripLocaleFromPathname(pathname: string): string {
	const segments = pathname.split("/").filter(Boolean);
	if (isPrefixedLocale(segments[0])) segments.shift();
	return segments.join("/");
}

// Build the `$` splat value for a doc `path` (no leading slash) in `locale`.
// Default locale → `getting-started` (and `""` for the home); other locales
// → `zh/getting-started` (and `zh` for the localized home).
export function docSplat(locale: string, path: string): string {
	const clean = path.replace(/^\/+|\/+$/g, "");
	if (locale === i18n.defaultLanguage) return clean;
	return clean ? `${locale}/${clean}` : locale;
}
