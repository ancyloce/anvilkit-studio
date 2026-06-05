/**
 * @file `image` module source tabs (PRD 0002 §9.4). Lets the user switch the
 * active asset source (Library / Unsplash / …) with an animated sliding
 * highlight (animate-ui Tabs). Rendered only when the source exposes more than
 * one tab — a flat source shows nothing extra.
 */

import { type ReactNode } from "react";

import { Tabs, TabsList, TabsTab } from "@/primitives/tabs";

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
		<Tabs
			value={active}
			onValueChange={(next) => {
				if (next != null) onChange(String(next));
			}}
		>
			<TabsList
				aria-label={ariaLabel}
				data-testid="ak-image-source-tabs"
				className="w-full"
			>
				{tabs.map((tab) => (
					<TabsTab key={tab.id} value={tab.id} data-source-tab={tab.id}>
						{tab.label}
					</TabsTab>
				))}
			</TabsList>
		</Tabs>
	);
}
