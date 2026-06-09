/**
 * @file Language switcher — an optional header dropdown that drives the
 * per-`<Studio>` locale store.
 *
 * Mount it anywhere inside `<Studio>` (e.g. a header action slot) to let end
 * users switch the active locale. Selecting an entry calls `setLocale`, which
 * re-renders every `useMsg` / `useT` consumer **in place** (no `<Studio>`
 * remount) and triggers the lazy load of that locale's message packs via the
 * registry's `loadMessages` loaders. Missing keys fall back to English.
 *
 * It is intentionally **not** auto-wired into the chrome — hosts opt in by
 * rendering it — so adding it changes no existing layout.
 */

import { Languages } from "lucide-react";
import { type ReactNode, useCallback } from "react";
import { Button } from "@/primitives/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@/primitives/dropdown-menu";
import { useMsg } from "@/state/editor-i18n-context";
import { useLocaleStore } from "@/state/slices/LocaleStoreProvider";

/** One selectable locale: its tag plus the label shown in its own script. */
export interface SupportedLocale {
	/** BCP-47-ish locale tag passed to `setLocale` (e.g. `"zh"`). */
	readonly locale: string;
	/** Display name in the language's own script (endonym). */
	readonly label: string;
}

/**
 * Locales with a bundled core `studio.*` catalog. English is the inline
 * baseline; `zh` / `ja` / `ko` lazy-load from `i18n/messages/`. Pass a custom
 * list via {@link LanguageSwitcherProps.locales} to offer a different set (any
 * locale whose packs resolve works — this only seeds the default UI).
 */
export const SUPPORTED_LOCALES: readonly SupportedLocale[] = [
	{ locale: "en", label: "English" },
	{ locale: "zh", label: "中文" },
	{ locale: "ja", label: "日本語" },
	{ locale: "ko", label: "한국어" },
];

export interface LanguageSwitcherProps {
	/**
	 * Locales to offer. Defaults to {@link SUPPORTED_LOCALES} (the locales
	 * with a bundled core catalog).
	 */
	readonly locales?: readonly SupportedLocale[];
	/** Extra classes for the trigger button (replaces the default chrome styling). */
	readonly className?: string;
}

/**
 * Header dropdown bound to the locale store. Must be rendered inside a
 * `<LocaleStoreProvider>` (always present under `<Studio>`).
 */
export function LanguageSwitcher({
	locales = SUPPORTED_LOCALES,
	className,
}: LanguageSwitcherProps): ReactNode {
	const msg = useMsg();
	const locale = useLocaleStore((state) => state.locale);
	const setLocale = useLocaleStore((state) => state.setLocale);

	const handleValueChange = useCallback(
		(value: unknown): void => {
			if (typeof value === "string") setLocale(value);
		},
		[setLocale],
	);

	const active = locales.find((entry) => entry.locale === locale);
	const label = msg("studio.language.label");

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						variant="ghost"
						size="sm"
						className={className ?? "gap-1.5 px-2 text-[var(--ak-studio-fg)]"}
						aria-label={label}
					>
						<Languages className="size-4" aria-hidden="true" />
						<span className="text-xs font-medium">
							{active ? active.label : label}
						</span>
					</Button>
				}
			/>
			<DropdownMenuContent align="end">
				<DropdownMenuRadioGroup
					value={locale}
					onValueChange={handleValueChange}
				>
					{locales.map((entry) => (
						<DropdownMenuRadioItem key={entry.locale} value={entry.locale}>
							{entry.label}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
