/**
 * @file Theme toggle — the built-in header dropdown that drives the
 * per-`<Studio>` theme store (the long-promised renderer behind
 * `config.theme.allowToggle`).
 *
 * Mirrors `LanguageSwitcher`'s shape: a ghost trigger button opening a
 * radio dropdown with the three {@link ThemeMode} preferences. Selecting
 * one calls `setMode`, which `useThemeSync` resolves onto the chrome (and
 * persists under `anvilkit-core-theme-${storeId}`). The trigger's icon
 * reflects the current *preference* — Sun / Moon / Monitor for
 * `light` / `dark` / `system` — so a `system` user isn't shown a
 * misleading concrete-mode icon.
 *
 * Rendered by `<ThemeToggleRegion>` in the chrome header when
 * `config.theme.allowToggle` is `true` (the shipped schema default —
 * hosts that manage theme externally set it to `false`). It can also be
 * mounted manually anywhere inside `<Studio>`.
 */

import { Monitor, Moon, Sun } from "lucide-react";
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
import { useThemeStore } from "@/state/slices/ThemeStoreProvider";
import type { ThemeMode } from "@/state/slices/theme-store";

/** Message key per selectable mode, in menu order. */
const MODE_MESSAGE_KEYS: readonly { mode: ThemeMode; key: string }[] = [
	{ mode: "light", key: "studio.theme.light" },
	{ mode: "dark", key: "studio.theme.dark" },
	{ mode: "system", key: "studio.theme.system" },
];

/** Trigger icon per *preference* (not per resolved value — see file doc). */
const MODE_ICONS: Readonly<Record<ThemeMode, typeof Sun>> = {
	light: Sun,
	dark: Moon,
	system: Monitor,
};

export interface ThemeToggleProps {
	/** Extra classes for the trigger button (replaces the default chrome styling). */
	readonly className?: string;
}

/**
 * Header dropdown bound to the theme store. Must be rendered inside a
 * `<ThemeStoreProvider>` (always present under `<Studio>`).
 */
export function ThemeToggle({ className }: ThemeToggleProps): ReactNode {
	const msg = useMsg();
	const mode = useThemeStore((state) => state.mode);
	const setMode = useThemeStore((state) => state.setMode);

	const handleValueChange = useCallback(
		(value: unknown): void => {
			if (value === "light" || value === "dark" || value === "system") {
				setMode(value);
			}
		},
		[setMode],
	);

	const label = msg("studio.theme.label");
	const TriggerIcon = MODE_ICONS[mode];

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						variant="ghost"
						size="icon"
						className={className ?? "text-[var(--ak-studio-fg)]"}
						aria-label={label}
					>
						<TriggerIcon className="size-4" aria-hidden="true" />
					</Button>
				}
			/>
			<DropdownMenuContent align="end">
				<DropdownMenuRadioGroup value={mode} onValueChange={handleValueChange}>
					{MODE_MESSAGE_KEYS.map(({ mode: itemMode, key }) => (
						<DropdownMenuRadioItem key={itemMode} value={itemMode}>
							{msg(key)}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
