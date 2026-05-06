/**
 * @file `ComponentOverlay` — Puck `componentOverlay` override.
 *
 * Receives `{ children, hover, isSelected, componentId,
 * componentType }` from Puck. Replaces the default outline with a
 * token-themed ring; selection wins over hover in the styling
 * priority.
 *
 * When selected, a small label tab identifies the component.
 * Default placement is *above* the outline (flush with the top
 * edge). For the topmost component in the root zone the label
 * would render outside the canvas viewport, so it flips to
 * *inside* placement (sitting on the top edge of the component
 * itself). The position is published as a `data-label-position`
 * attribute and the actual placement rules live in the CSS
 * sidecar.
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
	const labelPosition = isTopmostInRoot(getPuck, componentId)
		? "inside"
		: "above";

	return (
		<div
			data-ak-overlay
			data-overlay-state={isSelected ? "selected" : hover ? "hover" : "idle"}
			data-label-position={labelPosition}
			className={cn("relative h-full w-full transition-colors")}
		>
			{isSelected ? (
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
