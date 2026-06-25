"use client";

import { cn } from "@anvilkit/ui/lib/utils";
import { Languages } from "lucide-react";
import { useDemoLocale, useDemoT } from "../../lib/i18n/client";
import { DEMO_LOCALES, type DemoLocale } from "../../lib/i18n/messages";

/**
 * Site-wide language switcher for the marketing chrome. A native `<select>`
 * (keyboard- and screen-reader-friendly out of the box) styled to match the
 * nav's pill controls, with the active endonym shown next to a globe icon.
 *
 * Selecting a locale drives `<DemoI18nProvider>`: client islands retranslate
 * immediately and Server Components re-render via `router.refresh()`. The
 * choice persists in the `anvilkit-demo-locale` cookie.
 *
 * This is independent of the Studio editor's own locale switch (core's
 * uncontrolled, per-`storeId` store), which lives on the immersive editor
 * routes that don't render this chrome.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
	const { locale, setLocale } = useDemoLocale();
	const t = useDemoT();
	const label = t("nav.language");

	return (
		<label
			className={cn(
				"relative inline-flex items-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-within:text-foreground",
				className,
			)}
			title={label}
		>
			<span className="sr-only">{label}</span>
			<Languages
				className="pointer-events-none absolute left-2.5 size-4"
				aria-hidden="true"
			/>
			<select
				aria-label={label}
				value={locale}
				onChange={(event) => setLocale(event.currentTarget.value as DemoLocale)}
				className="cursor-pointer appearance-none rounded-full border border-border bg-transparent py-1.5 pr-3 pl-8 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				{DEMO_LOCALES.map((option) => (
					<option key={option.locale} value={option.locale}>
						{option.label}
					</option>
				))}
			</select>
		</label>
	);
}
