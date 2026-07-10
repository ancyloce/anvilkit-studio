/**
 * @file Language switcher — an optional header dropdown that drives the
 * per-`<Studio>` locale store.
 *
 * Mount it anywhere inside `<Studio>` (e.g. a header action slot) to let end
 * users switch the active locale. Selecting an entry calls `requestLocale`:
 * in uncontrolled mounts that applies the switch (re-rendering every
 * `useMsg` / `useT` consumer **in place** — no `<Studio>` remount — and
 * triggering the lazy load of that locale's message packs) and notifies the
 * host's `onLocaleChange`; in controlled mounts (`config.i18n.locale`
 * host-set) it only notifies, and the host applies the switch by
 * re-rendering with the new config value. Missing keys fall back to English.
 *
 * Hosts opt in either by rendering it themselves (e.g. via `headerEnd`) or
 * by setting `config.i18n.showLocaleSwitch: true`, which mounts this
 * component in the chrome header's right cluster.
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
import {
	SUPPORTED_LOCALES,
	type SupportedLocale,
} from "./LanguageSwitcher.locales";

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
	// `requestLocale`, not `setLocale`: in uncontrolled mounts it applies
	// (persisting, as before) and additionally notifies `onLocaleChange`;
	// in controlled mounts (`config.i18n.locale` host-set) it notifies
	// ONLY — the host applies the switch by re-rendering with the new
	// config value, so the radio selection tracks `locale` like a
	// controlled <input>.
	const requestLocale = useLocaleStore((state) => state.requestLocale);

	const handleValueChange = useCallback(
		(value: unknown): void => {
			if (typeof value === "string") requestLocale(value);
		},
		[requestLocale],
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
