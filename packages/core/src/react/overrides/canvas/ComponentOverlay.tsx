/**
 * @file `ComponentOverlay` — Puck `componentOverlay` override.
 *
 * Receives `{ children, hover, isSelected, componentId,
 * componentType }` from Puck. Replaces the default outline with a
 * token-themed ring; selection wins over hover in the styling
 * priority.
 */

import { type ReactNode } from "react";

import { cn } from "../utils/cn.js";

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
}: ComponentOverlayOverrideProps): ReactNode {
	return (
		<div
			data-overlay-state={isSelected ? "selected" : hover ? "hover" : "idle"}
			className={cn(
				"relative outline outline-offset-[-1px] transition-colors",
				isSelected
					? "outline-2 outline-[var(--ak-studio-accent)]"
					: hover
						? "outline-1 outline-[var(--ak-studio-ring)]/60"
						: "outline-0 outline-transparent",
			)}
		>
			{children}
		</div>
	);
}
