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

import { type ReactNode } from "react";

import { cn } from "@/utils/cn";
import { useReactivePuck } from "../utils/use-reactive-puck";

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
	// Reactive: label placement depends on the component's position in
	// the tree, which changes on reorder/move. Selecting a primitive
	// boolean keeps re-renders limited to actual placement flips.
	const isTopmost = useReactivePuck((s) => {
		const selector = s.getSelectorForId(componentId);
		return (
			selector !== undefined &&
			selector.index === 0 &&
			selector.zone === ROOT_DROPPABLE_ID
		);
	});
	const labelPosition = isTopmost ? "inside" : "above";

	return (
		<div
			data-ak-overlay
			data-overlay-state={isSelected ? "selected" : hover ? "hover" : "idle"}
			data-label-position={labelPosition}
			className={cn("relative h-full w-full transition-colors")}
		>
			{isSelected ? <span data-ak-overlay-label>{componentType}</span> : null}
			{children}
		</div>
	);
}
