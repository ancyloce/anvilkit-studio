"use client";

import type { PresencePeer } from "./use-presence";

export interface PresenceSelectionRingRect {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

export interface PresenceSelectionRingProps {
	readonly peer: PresencePeer;
	readonly rect: PresenceSelectionRingRect;
	readonly className?: string;
}

const DEFAULT_COLOR = "#7c3aed";
const ROOT_CLASSES =
	"pointer-events-none absolute z-40 rounded-md border-2 transition-[transform,width,height] duration-100";

/**
 * Outline overlay rendered behind a selected node to surface
 * which peer is currently editing it.
 *
 * The host computes the bounding rect from the live DOM (e.g.
 * `node.getBoundingClientRect()` adjusted for scroll) and passes
 * it in. We never measure inside the component so the host can
 * cache rects and avoid layout thrash on every presence frame.
 */
export function PresenceSelectionRing({
	peer,
	rect,
	className,
}: PresenceSelectionRingProps) {
	const color = peer.color ?? DEFAULT_COLOR;
	return (
		<div
			data-slot="presence-selection-ring"
			data-peer-id={peer.id}
			aria-hidden="true"
			className={className ? `${ROOT_CLASSES} ${className}` : ROOT_CLASSES}
			style={{
				transform: `translate(${rect.x}px, ${rect.y}px)`,
				width: rect.width,
				height: rect.height,
				borderColor: color,
				boxShadow: `0 0 0 2px ${color}33`,
			}}
		/>
	);
}
