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

	useEffect(() => {
		// `session` from the closure may be the initial one, which already
		// matches `mode`; only replace when the mode actually diverged.
		if (session.mode === mode && !session.disposed) return;
		const next = createPreviewSession(mode);
		setSession(next);
		return () => {
			next.dispose();
		};
	}, [mode, session]);

	useEffect(() => {
		return () => {
			session.dispose();
		};
	}, [session]);

	return session;
}

function noop(): void {
	// No `matchMedia` (SSR or a very old browser): nothing to unsubscribe.
}
