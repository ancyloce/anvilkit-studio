/**
 * @file `image` module source tabs (PRD 0002 §9.4). Lets the user switch the
 * active asset source (Library / Unsplash / …). Rendered only when the source
 * exposes more than one tab — a flat source shows nothing extra.
 */

import { type ReactNode } from "react";

import { ToggleGroup, ToggleGroupItem } from "@/primitives/toggle-group";

export interface SourceTab {
	readonly id: string;
	readonly label: string;
}

export function ImageSourceTabs({
	tabs,
	active,
	onChange,
	ariaLabel,
}: {
	readonly tabs: readonly SourceTab[];
	readonly active: string;
	readonly onChange: (id: string) => void;
	readonly ariaLabel: string;
}): ReactNode {
	if (tabs.length <= 1) return null;
	return (
		<ToggleGroup
			value={[active]}
			onValueChange={(next: readonly string[]) => {
				const picked = next[0];
				if (picked !== undefined) onChange(picked);
			}}
			aria-label={ariaLabel}
			data-testid="ak-image-source-tabs"
			size="sm"
			spacing={1}
		>
			{tabs.map((tab) => (
				<ToggleGroupItem key={tab.id} value={tab.id} data-source-tab={tab.id}>
					{tab.label}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	);
}
