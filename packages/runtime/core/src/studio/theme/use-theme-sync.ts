/**
 * @file `useThemeSync()` — system theme resolver + DOM/iframe sync.
 *
 * Responsibilities (PRD §3.4):
 *
 * 1. Resolve the user's `mode` ("light" | "dark" | "system") into a
 *    concrete `resolved` ("light" | "dark") via `matchMedia` and
 *    write it back to the existing `useThemeStore.resolved` slice.
 * 2. Toggle the `.dark` class on `document.documentElement` so the
 *    Tailwind v4 `.dark` selector flips theme tokens.
 * 3. Mirror the same toggle plus a one-shot `<style>` tag inside the
 *    Puck render iframe so canvas content stays in sync with the
 *    surrounding chrome.
 *
 * The hook is a no-op on the server — every effect bails out when
 * `window` is undefined.
 */

import { useEffect } from "react";

import {
	resolveQueryRoot,
	useStudioRootRef,
} from "@/context/StudioRootProvider";
import { useThemeStore } from "@/state/index";
import { IFRAME_THEME_CSS, IFRAME_THEME_STYLE_ID } from "./iframe-theme";

const MEDIA_QUERY = "(prefers-color-scheme: dark)";

function resolveSystemPreference(): "light" | "dark" {
	if (typeof window === "undefined") return "light";
	// Older WebViews / constrained or test environments expose `window`
	// but not `matchMedia`; default to light rather than crashing.
	if (typeof window.matchMedia !== "function") return "light";
	return window.matchMedia(MEDIA_QUERY).matches ? "dark" : "light";
}

function applyClass(target: Element, dark: boolean): void {
	target.classList.toggle("dark", dark);
}

// Module-scoped coordinator for the global `<html>.dark` class (finding
// P2-1). Every `<Studio>` shares one host document, so the class is
// ref-counted: the first instance to mount snapshots the host's prior
// value, instances apply last-writer-wins while active, and the LAST to
// unmount restores the snapshot — so a dark Studio that unmounts no
// longer strands the host document dark, and a host that was already
// dark before any Studio mounted is left dark afterwards.
let htmlThemeOwners = 0;
let htmlThemePrevDark = false;

function acquireHtmlTheme(): void {
	if (htmlThemeOwners === 0 && typeof document !== "undefined") {
		htmlThemePrevDark = document.documentElement.classList.contains("dark");
	}
	htmlThemeOwners += 1;
}

function releaseHtmlTheme(): void {
	if (htmlThemeOwners === 0) return;
	htmlThemeOwners -= 1;
	if (htmlThemeOwners === 0 && typeof document !== "undefined") {
		applyClass(document.documentElement, htmlThemePrevDark);
	}
}

function injectIframeStyle(doc: Document): void {
	if (doc.getElementById(IFRAME_THEME_STYLE_ID) !== null) return;
	const style = doc.createElement("style");
	style.id = IFRAME_THEME_STYLE_ID;
	style.textContent = IFRAME_THEME_CSS;
	doc.head.appendChild(style);
}

// Puck hardcodes `id="preview-frame"` (no override prop), so with two
// `<Studio>` instances on one page the ids are duplicated. Scoping the
// query to this editor's root subtree disambiguates them; falling back
// to `document` preserves single-editor / test behavior. (Puck's own
// internal global lookup of this id is an upstream limitation we can't
// fix from here.)
function findPuckIframe(root: ParentNode): HTMLIFrameElement | null {
	if (typeof document === "undefined") return null;
	return root.querySelector<HTMLIFrameElement>("iframe#preview-frame");
}

function subscribeToSystemPreference(
	media: MediaQueryList,
	listener: () => void,
): (() => void) | undefined {
	if (typeof media.addEventListener === "function") {
		media.addEventListener("change", listener);
		return () => media.removeEventListener("change", listener);
	}
	if (typeof media.addListener === "function") {
		media.addListener(listener);
		return () => media.removeListener(listener);
	}
}

/**
 * Subscribe to the user's mode preference, derive the resolved
 * value, and mirror it everywhere it needs to live: the theme store,
 * `<html>`, and the Puck iframe (when one exists).
 *
 * Returns nothing — the hook is invoked for its side effects from
 * `<Studio>` once the chrome decides to render.
 */
export function useThemeSync(): void {
	const mode = useThemeStore((s) => s.mode);
	const setResolved = useThemeStore((s) => s.setResolved);
	const rootRef = useStudioRootRef();

	// Ref-count ownership of the global `<html>.dark` class. Declared
	// before the apply effect so the snapshot is taken *before* the first
	// `apply()` mutates the class; the last instance to unmount restores
	// the host's prior theme (finding P2-1).
	useEffect(() => {
		acquireHtmlTheme();
		return releaseHtmlTheme;
	}, []);

	useEffect(() => {
		if (typeof window === "undefined") return;

		function resolve(): "light" | "dark" {
			if (mode === "system") {
				return resolveSystemPreference();
			}
			return mode;
		}

		function apply(): void {
			const resolved = resolve();
			setResolved(resolved);
			applyClass(document.documentElement, resolved === "dark");

			const iframe = findPuckIframe(resolveQueryRoot(rootRef));
			const doc = iframe?.contentDocument;
			if (doc !== null && doc !== undefined) {
				injectIframeStyle(doc);
				applyClass(doc.documentElement, resolved === "dark");
			}
		}

		apply();

		if (mode !== "system") {
			return;
		}
		// `apply()` already resolved the class above; without `matchMedia`
		// we simply can't subscribe to live OS-preference changes.
		if (typeof window.matchMedia !== "function") {
			return;
		}
		const media = window.matchMedia(MEDIA_QUERY);
		const listener = (): void => apply();
		// Legacy WebKit/WebViews expose `matchMedia` but the returned
		// `MediaQueryList` only supports the deprecated `addListener`
		// /`removeListener` API, not `addEventListener`. Prefer the modern
		// API, fall back to the legacy one, and bail if neither exists.
		return subscribeToSystemPreference(media, listener);
	}, [mode, setResolved, rootRef]);
}
