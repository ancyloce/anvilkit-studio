/**
 * @file `ComponentOverlay` — Puck `componentOverlay` override.
 *
 * Receives `{ children, hover, isSelected, componentId,
 * componentType }` from Puck. Replaces the default outline with a
 * token-themed ring; selection wins over hover in the styling
 * priority. When selected, a small label tab sits flush on the
 * top edge of the outline so the selected component is identifiable
 * at a glance — the floating `ActionBar` no longer carries the
 * label inline. The label is suppressed when the selected component
 * is the topmost child of the root zone, since the tab would render
 * outside the canvas viewport above it.
 */

import { useGetPuck } from "@puckeditor/core";
import { type ReactNode } from "react";

import { cn } from "@/utils/cn";

const ROOT_DROPPABLE_ID = "root:default-zone";

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
	componentId,
	componentType,
}: ComponentOverlayOverrideProps): ReactNode {
	const getPuck = useGetPuck();
	const showLabel = isSelected && !isTopmostInRoot(getPuck, componentId);

	return (
		<div
			data-ak-overlay
			data-overlay-state={isSelected ? "selected" : hover ? "hover" : "idle"}
			className={cn("relative h-full w-full transition-colors")}
		>
			{showLabel ? (
				<span data-ak-overlay-label>{componentType}</span>
			) : null}
			{children}
		</div>
	);
}

function isTopmostInRoot(
	getPuck: ReturnType<typeof useGetPuck>,
	componentId: string,
): boolean {
	const selector = getPuck().getSelectorForId(componentId);
	if (selector === undefined) return false;
	return selector.index === 0 && selector.zone === ROOT_DROPPABLE_ID;
}
