"use client";

/**
 * @file The responsive editing state and `StudioViewportController`
 * (PLAN-0020 CORE-P1A-008; DD-0019 §12.3, §22.3 — snapshot-gated
 * public surface).
 *
 * Transient per-instance state (never undoable, never part of the
 * sidecar): the actual preview viewport width versus the **active
 * write target**, follow mode (write target tracks the viewport), and
 * the overrides-only filter. Switching the write target or viewport
 * never dispatches to Puck and never enters history.
 */

import type {
	BreakpointDefinition,
	ResponsiveEditorState,
	ResponsiveLayerRef,
} from "@anvilkit/contracts/editor";
import { createStore } from "zustand/vanilla";
import { getMatchingBreakpoints } from "../../../editor/index.js";

/** The public viewport/write-target controller (DD-0019 §22.3). */
export interface StudioViewportController {
	/** The current responsive editing state. */
	getState(): ResponsiveEditorState;
	/** Subscribe to changes. Returns an unsubscribe fn. */
	subscribe(listener: (state: ResponsiveEditorState) => void): () => void;
	/**
	 * Set the active write target explicitly. Disables follow mode
	 * (an explicit choice pins the target).
	 */
	setWriteTarget(layer: ResponsiveLayerRef): void;
	/** Toggle follow mode (write target derives from the viewport). */
	setFollowViewport(followViewport: boolean): void;
	/** Toggle the overrides-only inspector filter. */
	setShowOnlyOverrides(showOnlyOverrides: boolean): void;
}

/** Controller plus the seams the editor root and chrome wire up. */
export interface InternalStudioViewportController
	extends StudioViewportController {
	/** Chrome feed: the live preview viewport width in CSS px. */
	readonly notifyViewportWidth: (width: number) => void;
	/** Effective-breakpoint feed (follow mode derives against it). */
	readonly setBreakpoints: (
		breakpoints: readonly BreakpointDefinition[],
	) => void;
}

/** Options for {@link createStudioViewportController}. */
export interface ViewportControllerOptions {
	readonly initialViewportWidth?: number;
	readonly onChange?: (state: ResponsiveEditorState) => void;
}

const DEFAULT_WIDTH = 1280;

/**
 * Derive the follow-mode write target for a viewport width: the
 * narrowest enabled breakpoint matching the width, else base.
 */
export function deriveFollowTarget(
	breakpoints: readonly BreakpointDefinition[],
	viewportWidth: number,
): ResponsiveLayerRef {
	const matching = getMatchingBreakpoints(breakpoints, viewportWidth);
	return matching.at(-1)?.id ?? "base";
}

/** Create the per-instance responsive controller. */
export function createStudioViewportController(
	options?: ViewportControllerOptions,
): InternalStudioViewportController {
	let breakpoints: readonly BreakpointDefinition[] = [];
	const store = createStore<ResponsiveEditorState>(() => ({
		viewportWidth: options?.initialViewportWidth ?? DEFAULT_WIDTH,
		activeBreakpoint: "base",
		followViewport: true,
		showOnlyOverrides: false,
	}));

	const commit = (next: ResponsiveEditorState): void => {
		const prev = store.getState();
		if (
			prev.viewportWidth === next.viewportWidth &&
			prev.activeBreakpoint === next.activeBreakpoint &&
			prev.followViewport === next.followViewport &&
			prev.showOnlyOverrides === next.showOnlyOverrides
		) {
			return;
		}
		store.setState(next, true);
		options?.onChange?.(next);
	};

	const refollow = (): void => {
		const state = store.getState();
		if (!state.followViewport) {
			return;
		}
		commit({
			...state,
			activeBreakpoint: deriveFollowTarget(breakpoints, state.viewportWidth),
		});
	};

	return {
		getState: () => store.getState(),
		subscribe: (listener) => store.subscribe(listener),
		setWriteTarget(layer) {
			commit({
				...store.getState(),
				activeBreakpoint: layer,
				followViewport: false,
			});
		},
		setFollowViewport(followViewport) {
			commit({ ...store.getState(), followViewport });
			refollow();
		},
		setShowOnlyOverrides(showOnlyOverrides) {
			commit({ ...store.getState(), showOnlyOverrides });
		},
		notifyViewportWidth(width) {
			if (width <= 0) {
				return;
			}
			commit({ ...store.getState(), viewportWidth: width });
			refollow();
		},
		setBreakpoints(next) {
			breakpoints = next;
			refollow();
		},
	};
}
