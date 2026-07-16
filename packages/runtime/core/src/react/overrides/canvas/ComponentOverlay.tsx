/**
 * @file `ComponentOverlay` — Puck `componentOverlay` override.
 *
 * Receives `{ children, hover, isSelected, componentId,
 * componentType }` from Puck. Replaces the default outline with a
 * token-themed ring; selection wins over hover in the styling
 * priority.
 *
 * When selected, a small label tab identifies the component using its
 * friendly display name (Puck config `components[type].label`, task
 * Phase 8 — the same lookup `use-layer-tree.ts` already uses for the
 * Layer tree) rather than the raw internal component-type key.
 * Default placement is *above* the outline (flush with the top edge).
 * When there isn't room above — measured against the label's own
 * document viewport via `getBoundingClientRect()`, which resolves
 * correctly whether this renders inside the canvas iframe or the
 * parent document — it flips to *inside* placement (sitting on the
 * top edge of the component itself). The position is published as a
 * `data-label-position` attribute and the actual placement rules live
 * in the CSS sidecar.
 */

import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/shared/cn";
import { useReactivePuck } from "../utils/use-reactive-puck";

/** Approx. label height (11px text + padding) plus a small clearance margin. */
const LABEL_CLEARANCE_PX = 28;

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
	const displayLabel = useReactivePuck((s) => {
		const entry = s.config.components?.[componentType] as
			| { label?: string }
			| undefined;
		return entry?.label ?? componentType;
	});

	const overlayRef = useRef<HTMLDivElement | null>(null);
	const [insufficientSpaceAbove, setInsufficientSpaceAbove] = useState(false);

	useLayoutEffect(() => {
		if (!isSelected) return;
		const el = overlayRef.current;
		if (el === null) return;

		const measure = (): void => {
			const rect = el.getBoundingClientRect();
			setInsufficientSpaceAbove(rect.top < LABEL_CLEARANCE_PX);
		};
		measure();

		const view = el.ownerDocument.defaultView;
		if (view === null) return;
		view.addEventListener("resize", measure);
		return () => view.removeEventListener("resize", measure);
	}, [isSelected]);

	const labelPosition = insufficientSpaceAbove ? "inside" : "above";

	return (
		<div
			ref={overlayRef}
			data-ak-overlay
			data-overlay-state={isSelected ? "selected" : hover ? "hover" : "idle"}
			data-label-position={labelPosition}
			className={cn("relative h-full w-full transition-colors")}
		>
			{isSelected ? <span data-ak-overlay-label>{displayLabel}</span> : null}
			{children}
		</div>
	);
}
