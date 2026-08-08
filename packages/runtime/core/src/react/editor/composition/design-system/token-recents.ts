"use client";

/**
 * @file The session's most-recently-applied tokens (ADR 0005 Part 2 §4
 * — "one picker pattern", of which recents is one element).
 *
 * **Moved here by `p4-003`, unchanged.** It previously lived inside
 * `tokens/use-token-picker.ts`, which binds to the editor bridge and
 * dies with it. Two pickers now exist while the shell is promoted (the
 * bridge-bound one in the inspector controls, the canonical one in the
 * Design System panel) and they must share ONE recents list — a second
 * module-level array would give the same author two different "recent"
 * answers depending on which surface they opened.
 *
 * Deliberately module state, not the persisted UI store: recents are a
 * convenience that must not survive a reload as durable document data,
 * and adding a slice to the versioned `editor-ui-store` would force a
 * persist migration for throwaway state.
 *
 * Exposed as a `useSyncExternalStore` source rather than a bare array —
 * a mutated module array is invisible to React, so pickers would keep
 * rendering a stale list until some unrelated state change happened to
 * re-run their memo.
 */

import { useSyncExternalStore } from "react";

/** How many recently-applied tokens a picker offers. */
export const RECENT_TOKEN_LIMIT = 5;

let recentTokenIds: readonly string[] = [];
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

function getSnapshot(): readonly string[] {
	return recentTokenIds;
}

function setRecents(next: readonly string[]): void {
	recentTokenIds = next;
	for (const listener of listeners) {
		listener();
	}
}

/** Record a token as just-applied, newest first, deduplicated. */
export function rememberToken(tokenId: string): void {
	setRecents(
		[tokenId, ...recentTokenIds.filter((id) => id !== tokenId)].slice(
			0,
			RECENT_TOKEN_LIMIT,
		),
	);
}

/** Test seam: clear the session recents. */
export function clearTokenRecents(): void {
	setRecents([]);
}

/** The session recents, newest first. */
export function useTokenRecents(): readonly string[] {
	return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
