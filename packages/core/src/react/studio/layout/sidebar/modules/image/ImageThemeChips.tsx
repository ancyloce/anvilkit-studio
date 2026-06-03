/**
 * @file `image` module theme chips (PRD 0002 §8.2). Single-select browse themes
 * for a themed source (Unsplash topics). Labels are i18n keys supplied by the
 * source; `msg` falls back to the key when a translation is absent.
 */

import { type ReactNode } from "react";

import { ToggleGroup, ToggleGroupItem } from "@/primitives/toggle-group";
import { useMsg } from "@/state/editor-i18n-context";
import type { StudioAssetTheme } from "@/types/sidebar";

export function ImageThemeChips({
	themes,
	active,
	onChange,
}: {
	readonly themes: readonly StudioAssetTheme[];
	readonly active: string | undefined;
	readonly onChange: (id: string | undefined) => void;
}): ReactNode {
	const msg = useMsg();
	if (themes.length === 0) return null;
	return (
		<ToggleGroup
			value={active !== undefined ? [active] : []}
			onValueChange={(next: readonly string[]) => onChange(next[0])}
			aria-label={msg("studio.module.image.theme.label", "Themes")}
			data-testid="ak-image-theme-chips"
			size="sm"
			spacing={1}
		>
			{themes.map((theme) => (
				<ToggleGroupItem
					key={theme.id}
					value={theme.id}
					data-theme-id={theme.id}
				>
					{msg(theme.label, theme.label)}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	);
}
