/**
 * @file `ComponentOverlay` — Puck `componentOverlay` override.
 *
 * Receives `{ children, hover, isSelected, componentId,
 * componentType }` from Puck. Replaces the default outline with a
 * token-themed ring; selection wins over hover in the styling
 * priority. When selected, a small label tab sits on the top-left
 * corner of the outline so the selected component is identifiable
 * at a glance — the floating `ActionBar` no longer carries the
 * label inline.
 */

import { type ReactNode } from "react";

import { cn } from "@/utils/cn";

export interface ComponentOverlayOverrideProps {
	readonly children: ReactNode;
	readonly hover: boolean;
	readonly isSelected: boolean;
	readonly componentId: string;
	readonly componentType: string;
}

export function ComponentOverlay({
	children,
	hover,
	isSelected,
	componentType,
}: ComponentOverlayOverrideProps): ReactNode {
	return (
		<div
			data-ak-overlay
			data-overlay-state={isSelected ? "selected" : hover ? "hover" : "idle"}
			className={cn(
				"relative h-full w-full transition-colors",
			)}
		>
			{isSelected ? (
				<span
					data-ak-overlay-label
					className={cn(
						"pointer-events-none absolute -top-[22px] left-0 z-10",
						"inline-flex items-center gap-1 rounded-t-md px-2 py-0.5",
						"text-[11px] font-medium leading-none",
						"bg-[var(--ak-studio-accent)] text-[var(--ak-studio-accent-fg)]",
					)}
				>
					{componentType}
				</span>
			) : null}
			{children}
		</div>
	);
}
