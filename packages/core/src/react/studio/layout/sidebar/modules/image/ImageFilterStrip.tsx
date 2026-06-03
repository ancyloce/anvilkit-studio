/**
 * @file `image` module filter strip — All / Images / Videos / Audio.
 *
 * Single-select segmented control bound to the persisted
 * `assetCategoryFilter` slice (PRD §7.4 / §9.2). Selection survives
 * reload — that's why this is a slice, not local state.
 */

import { type ReactNode } from "react";

import { ToggleGroup, ToggleGroupItem } from "@/primitives/toggle-group";
import { useMsg } from "@/state/editor-i18n-context";
import type { AssetCategoryFilter } from "@/state/editor-ui-store";
import { useAssetCategoryFilter } from "@/state/hooks";

export function ImageFilterStrip(): ReactNode {
	const msg = useMsg();
	const [value, setValue] = useAssetCategoryFilter();

	const handleChange = (next: readonly string[]): void => {
		const picked = next[0] as AssetCategoryFilter | undefined;
		if (picked === undefined) return;
		setValue(picked);
	};

	return (
		<ToggleGroup
			value={[value]}
			onValueChange={handleChange}
			aria-label={msg("studio.module.image.name")}
			data-testid="ak-image-filter"
			size="sm"
			spacing={1}
		>
			<ToggleGroupItem value="all">
				{msg("studio.module.image.filter.all")}
			</ToggleGroupItem>
			<ToggleGroupItem value="images">
				{msg("studio.module.image.filter.images")}
			</ToggleGroupItem>
			<ToggleGroupItem value="videos">
				{msg("studio.module.image.filter.videos")}
			</ToggleGroupItem>
			<ToggleGroupItem value="audio">
				{msg("studio.module.image.filter.audio")}
			</ToggleGroupItem>
		</ToggleGroup>
	);
}
