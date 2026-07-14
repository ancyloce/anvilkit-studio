"use client";

import { useEffect, useState } from "react";

/**
 * Minimal cursor coordinate. Coordinates are document-relative
 * (CSS pixels from the top-left of the editor surface), not
 * viewport-relative — that lets two peers with different scroll
 * positions still render each other's cursors at the right node.
 */
export interface PresenceCursorCoords {
	readonly x: number;
	readonly y: number;
}

/**
 * Selection state — a peer can have any number of node IDs
 * selected at once. Empty array means "no selection."
 */
export interface PresenceSelectionState {
	readonly nodeIds: readonly string[];
}

/**
 * Identity for a single peer. `id` is required and globally
 * unique per session; `displayName` and `color` are optional.
 *
 * Mirrors `PeerInfo` from `@anvilkit/plugin-version-history` — kept
 * structurally compatible so a host can pass a peer object across
 * the boundary without conversion.
 */
export interface PresencePeer {
	readonly id: string;
	readonly displayName?: string;
	readonly color?: string;
}

export interface PresenceStateFrame {
	readonly peer: PresencePeer;
	readonly cursor?: PresenceCursorCoords;
	readonly selection?: PresenceSelectionState;
}

/**
 * Subset of `SnapshotAdapterPresence` used by the UI layer.
 *
 * Re-stating the contract as a local interface keeps the UI
 * package's runtime free of a dependency on the
 * `@anvilkit/plugin-version-history` types — `@anvilkit/ui` stays
 * a leaf in the dependency graph, and any adapter that satisfies
 * the SnapshotAdapter v2 surface satisfies this hook.
 */
export interface PresenceSource {
	update(state: PresenceStateFrame): void;
	onPeerChange(
		callback: (peers: readonly PresenceStateFrame[]) => void,
	): () => void;
}

export interface UsePresenceResult {
	readonly peers: readonly PresenceStateFrame[];
	readonly updateSelf: (state: Partial<PresenceStateFrame>) => void;
}

export interface UsePresenceOptions {
	readonly self: PresencePeer;
}

/**
 * Subscribe to presence updates from a `SnapshotAdapter` v2 source
 * and return the deduped peer list.
 *
 * The hook never mutates the source — `updateSelf` is the only
 * write API. Calling it overwrites the local peer's state via
 * `source.update()` (Yjs Awareness clears prior fields not
 * supplied, matching the v2 contract).
 */
export function usePresence(
	source: PresenceSource | undefined,
	options: UsePresenceOptions,
): UsePresenceResult {
	const [peers, setPeers] = useState<readonly PresenceStateFrame[]>([]);
	const selfId = options.self.id;

	useEffect(() => {
		if (!source) return;
		return source.onPeerChange((next) => {
			setPeers(next.filter((peer) => peer.peer.id !== selfId));
		});
	}, [source, selfId]);

	return {
		peers,
		updateSelf(state) {
			if (!source) return;
			source.update({
				peer: options.self,
				cursor: state.cursor,
				selection: state.selection,
			});
		},
	};
}
