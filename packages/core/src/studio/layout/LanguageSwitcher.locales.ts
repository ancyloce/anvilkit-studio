export interface SupportedLocale {
	readonly locale: string;
	readonly label: string;
}

export const SUPPORTED_LOCALES: readonly SupportedLocale[] = [
	{ locale: "en", label: "English" },
	{ locale: "zh", label: "中文" },
	{ locale: "ja", label: "日本語" },
	{ locale: "ko", label: "한국어" },
];
