"use client";

/**
 * Client-side locale context for the demo's interactive marketing chrome
 * (the nav language switcher, theme toggle, and the embedded MiniEditor).
 *
 * The provider is seeded from the server-read cookie value (`initialLocale`,
 * threaded through the root layout) so the first client render matches SSR.
 * Switching locale:
 *   1. updates context state so client components retranslate instantly;
 *   2. writes the {@link LOCALE_COOKIE} cookie (the source of truth the server
 *      reads on the next render);
 *   3. updates `<html lang>` for assistive tech;
 *   4. calls `router.refresh()` so Server Components (page bodies + metadata)
 *      re-render in the new language.
 *
 * Server Components do NOT consume this context — they translate via
 * `getServerT()` (see `server.ts`). This provider only serves the client
 * islands beneath it.
 */

import { useRouter } from "next/navigation";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";
import {
	createTranslator,
	type DemoLocale,
	type DemoTranslator,
	LOCALE_COOKIE,
} from "./messages";

interface DemoI18nContextValue {
	readonly locale: DemoLocale;
	readonly t: DemoTranslator;
	readonly setLocale: (next: DemoLocale) => void;
}

const DemoI18nContext = createContext<DemoI18nContextValue | null>(null);

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function DemoI18nProvider({
	initialLocale,
	children,
}: {
	readonly initialLocale: DemoLocale;
	readonly children: ReactNode;
}) {
	const router = useRouter();
	const [locale, setLocaleState] = useState<DemoLocale>(initialLocale);

	const setLocale = useCallback(
		(next: DemoLocale) => {
			setLocaleState(next);
			if (typeof document !== "undefined") {
				// biome-ignore lint/suspicious/noDocumentCookie: a single first-party flag cookie; the Cookie Store API isn't available in all target browsers (e.g. Safari).
				document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
				document.documentElement.lang = next;
			}
			// Re-render Server Components (page bodies + metadata) with the new
			// cookie value so server-rendered copy follows the switch too.
			router.refresh();
		},
		[router],
	);

	const value = useMemo<DemoI18nContextValue>(
		() => ({ locale, t: createTranslator(locale), setLocale }),
		[locale, setLocale],
	);

	return (
		<DemoI18nContext.Provider value={value}>
			{children}
		</DemoI18nContext.Provider>
	);
}

function useDemoI18n(): DemoI18nContextValue {
	const ctx = useContext(DemoI18nContext);
	if (!ctx) {
		throw new Error("useDemoI18n must be used within a <DemoI18nProvider>");
	}
	return ctx;
}

/** The active locale + a setter, for the language switcher. */
export function useDemoLocale(): {
	readonly locale: DemoLocale;
	readonly setLocale: (next: DemoLocale) => void;
} {
	const { locale, setLocale } = useDemoI18n();
	return { locale, setLocale };
}

/** A translator bound to the active client locale. */
export function useDemoT(): DemoTranslator {
	return useDemoI18n().t;
}
