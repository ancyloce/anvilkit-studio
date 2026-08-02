"use client";

/**
 * @file `usePreviewSession` / `usePrefersReducedMotion` — the React
 * binding for §16 preview mode (PLAN-0020 CORE-P3-002;
 * ED-MOTION-002/003).
 *
 * The lifecycle rules live in the React-free
 * `editor/interactions/preview-runtime.ts`; this file only ties a
 * session to a component's lifetime. Keeping it that thin is the
 * point — the disposal guarantee is asserted without a renderer, and
 * this hook cannot quietly acquire a fourth kind of resource that
 * teardown does not know about.
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import {
	createPreviewSession,
	type EditorRunMode,
	type PreviewSession,
} from "../../../editor/index.js";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * The user's reduced-motion preference, kept live.
 *
 * Subscribed rather than read once: the preference can change mid
 * session (OS setting, or a tester toggling it), and a stale read
 * would keep animating for someone who just asked us to stop.
 */
export function usePrefersReducedMotion(): boolean {
	return useSyncExternalStore(
		subscribeReducedMotion,
		getReducedMotionSnapshot,
		// Server render: assume reduced motion. Erring toward *less*
		// movement avoids a burst of animation during hydration for a
		// user who has asked for none.
		getReducedMotionServerSnapshot,
	);
}

function subscribeReducedMotion(onChange: () => void): () => void {
	if (typeof window === "undefined" || !window.matchMedia) return noop;
	const query = window.matchMedia(REDUCED_MOTION_QUERY);
	query.addEventListener("change", onChange);
	return () => query.removeEventListener("change", onChange);
}

function getReducedMotionSnapshot(): boolean {
	if (typeof window === "undefined" || !window.matchMedia) return false;
	return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function getReducedMotionServerSnapshot(): boolean {
	return true;
}

/**
 * A preview session bound to `mode`.
 *
 * A new session is created whenever the mode changes and the previous
 * one is disposed, so every timer, observer, animation and temporary
 * variant override acquired under the old mode is released at the
 * switch — not merely when the component unmounts.
 */
export function usePreviewSession(mode: EditorRunMode): PreviewSession {
	const [session, setSession] = useState(() => createPreviewSession(mode));

	// ONE effect owns both replacement and disposal, and it disposes only
	// the session it is responsible for — never the replacement it just
	// scheduled.
	//
	// This was two effects, and the split was an infinite render loop.
	// The replacing effect returned `() => next.dispose()`, so the
	// sequence was: create `next` → `setSession(next)` → deps change →
	// React runs that cleanup and disposes `next` → the effect re-runs,
	// the `!session.disposed` guard now fails against the session it had
	// just installed → create another → forever. Under React StrictMode
	// (Next dev) it needs no mode change at all to start: the simulated
	// unmount disposes the initial session, and the remount finds it
	// disposed. "Maximum update depth exceeded" on `?editor=1` was this.
	//
	// The guard has to test `disposed` as well as `mode` — a StrictMode
	// remount must get a live session back — so the cleanup must not be
	// the thing that makes it disposed.
	useEffect(() => {
		if (session.mode === mode && !session.disposed) {
			// This session is the current one: own its teardown, so a mode
			// change or an unmount releases every timer, observer,
			// animation and temporary variant override it acquired.
			return () => {
				session.dispose();
			};
		}
		// Stale or disposed: schedule the replacement and return NO
		// cleanup. `next` becomes `session` on the next render, and that
		// render's run of this effect takes ownership of disposing it.
		setSession(createPreviewSession(mode));
		return undefined;
	}, [mode, session]);

	return session;
}

function noop(): void {
	// No `matchMedia` (SSR or a very old browser): nothing to unsubscribe.
}
