"use client";

import type { PresenceCursorCoords, PresencePeer } from "./use-presence";

export interface PresenceCursorProps {
	readonly peer: PresencePeer;
	readonly cursor: PresenceCursorCoords;
	readonly className?: string;
}

const DEFAULT_COLOR = "#7c3aed";
const ROOT_CLASSES = "pointer-events-none absolute z-50 select-none";

/**
 * Document-positioned cursor for a remote peer.
 *
 * The component renders an absolutely-positioned arrow + name
 * label at the given coordinates. The host is responsible for
 * mounting it inside a positioned container — typically the
 * Studio canvas overlay — and for translating remote cursor
 * coordinates into the same coordinate space (document-relative
 * CSS pixels).
 */
export function PresenceCursor({
	peer,
	cursor,
	className,
}: PresenceCursorProps) {
	const color = peer.color ?? DEFAULT_COLOR;
	return (
		<div
			data-slot="presence-cursor"
			data-peer-id={peer.id}
			aria-hidden="true"
			className={className ? `${ROOT_CLASSES} ${className}` : ROOT_CLASSES}
			style={{
				transform: `translate(${cursor.x}px, ${cursor.y}px)`,
			}}
		>
			<svg
				width="14"
				height="20"
				viewBox="0 0 14 20"
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
				style={{ color, filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.25))" }}
			>
				<path
					d="M1 1 L1 16 L5.5 12 L8 18 L10.5 17 L8 11 L13 11 Z"
					fill="currentColor"
					stroke="white"
					strokeWidth="1"
					strokeLinejoin="round"
				/>
			</svg>
			{peer.displayName ? (
				<span
					data-slot="presence-cursor-label"
					className="ml-3 inline-block translate-y-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-white"
					style={{ backgroundColor: color }}
				>
					{peer.displayName}
				</span>
			) : null}
		</div>
	);
}
