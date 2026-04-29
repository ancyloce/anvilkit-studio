"use client";

import { PresenceCursor } from "./presence-cursor";
import {
	PresenceSelectionRing,
	type PresenceSelectionRingRect,
} from "./presence-selection-ring";
import type { PresenceStateFrame } from "./use-presence";

export interface PresenceLayerProps {
	readonly peers: readonly PresenceStateFrame[];
	/**
	 * Optional callback so the host can resolve a node ID to its
	 * current bounding rect. Returning `null` (or omitting the
	 * resolver entirely) disables selection rings while keeping
	 * cursor overlays.
	 */
	readonly resolveSelectionRect?: (
		nodeId: string,
	) => PresenceSelectionRingRect | null;
	readonly className?: string;
}

const ROOT_CLASSES = "pointer-events-none absolute inset-0 overflow-hidden";

/**
 * Mounts cursors and selection rings for every remote peer.
 *
 * Renders a transparent absolutely-positioned wrapper that does
 * not intercept pointer events — Puck's editor surface keeps
 * receiving clicks and drags while the layer floats above. The
 * host is responsible for placing the layer inside a positioned
 * container that matches the document coordinate space the
 * cursors are written in.
 */
export function PresenceLayer({
	peers,
	resolveSelectionRect,
	className,
}: PresenceLayerProps) {
	return (
		<div
			data-slot="presence-layer"
			aria-hidden="true"
			className={className ? `${ROOT_CLASSES} ${className}` : ROOT_CLASSES}
		>
			{peers.map((frame) => (
				<PeerOverlays
					key={frame.peer.id}
					frame={frame}
					resolveSelectionRect={resolveSelectionRect}
				/>
			))}
		</div>
	);
}

function PeerOverlays({
	frame,
	resolveSelectionRect,
}: {
	readonly frame: PresenceStateFrame;
	readonly resolveSelectionRect?: (
		nodeId: string,
	) => PresenceSelectionRingRect | null;
}) {
	const cursor = frame.cursor;
	const selection = frame.selection?.nodeIds ?? [];
	return (
		<>
			{cursor ? (
				<PresenceCursor peer={frame.peer} cursor={cursor} />
			) : null}
			{resolveSelectionRect
				? selection.map((nodeId) => {
						const rect = resolveSelectionRect(nodeId);
						if (!rect) return null;
						return (
							<PresenceSelectionRing
								key={`${frame.peer.id}:${nodeId}`}
								peer={frame.peer}
								rect={rect}
							/>
						);
					})
				: null}
		</>
	);
}
