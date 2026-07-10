"use client";

import {
	Tooltip,
	TooltipPanel,
	TooltipTrigger,
} from "@anvilkit/ui/components/animate-ui/components/base/tooltip";
import { cn } from "@anvilkit/ui/lib/utils";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@anvilkit/ui/select";
import { Languages } from "lucide-react";
import { useDemoLocale, useDemoT } from "@/lib/i18n/client";
import { DEMO_LOCALES, type DemoLocale } from "@/lib/i18n/messages";

/**
 * Site-wide language switcher for the marketing chrome, built from the shared
 * `@anvilkit/ui` primitives: a base-ui `Select` for the selector and the
 * animate-ui `Tooltip` for the hover hint (no native `<select>` / `title=`).
 * The active endonym shows next to a globe icon; the popup lists all locales.
 *
 * Selecting a locale drives `<DemoI18nProvider>`: client islands retranslate
 * immediately and Server Components re-render via `router.refresh()`. The
 * choice persists in the `anvilkit-demo-locale` cookie.
 *
 * Independent of the Studio editor's own locale switch (core's uncontrolled,
 * per-`storeId` store) on the immersive editor routes that don't render this
 * chrome.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
	const { locale, setLocale } = useDemoLocale();
	const t = useDemoT();
	const label = t("nav.language");

	return (
		<Select
			items={DEMO_LOCALES.map((option) => ({
				value: option.locale,
				label: option.label,
			}))}
			value={locale}
			onValueChange={(next) => {
				if (next) {
					setLocale(next as DemoLocale);
				}
			}}
		>
			<Tooltip>
				<TooltipTrigger
					render={
						<span className="inline-flex">
							<SelectTrigger
								aria-label={label}
								className={cn(
									"rounded-full text-muted-foreground hover:text-foreground",
									className,
								)}
							>
								<Languages className="size-4" aria-hidden="true" />
								<SelectValue />
							</SelectTrigger>
						</span>
					}
				/>
				<TooltipPanel>{label}</TooltipPanel>
			</Tooltip>
			<SelectContent align="end">
				{DEMO_LOCALES.map((option) => (
					<SelectItem key={option.locale} value={option.locale}>
						{option.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
