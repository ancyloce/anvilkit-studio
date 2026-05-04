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

import { useThemeStore } from "@/stores/theme-store";
import { IFRAME_THEME_CSS, IFRAME_THEME_STYLE_ID } from "./iframe-theme";

const MEDIA_QUERY = "(prefers-color-scheme: dark)";

function resolveSystemPreference(): "light" | "dark" {
	if (typeof window === "undefined") return "light";
	return window.matchMedia(MEDIA_QUERY).matches ? "dark" : "light";
}

function applyClass(target: Element, dark: boolean): void {
	target.classList.toggle("dark", dark);
}

function injectIframeStyle(doc: Document): void {
	if (doc.getElementById(IFRAME_THEME_STYLE_ID) !== null) return;
	const style = doc.createElement("style");
	style.id = IFRAME_THEME_STYLE_ID;
	style.textContent = IFRAME_THEME_CSS;
	doc.head.appendChild(style);
}

function findPuckIframe(): HTMLIFrameElement | null {
	if (typeof document === "undefined") return null;
	return document.querySelector<HTMLIFrameElement>("iframe#preview-frame");
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

			const iframe = findPuckIframe();
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
		const media = window.matchMedia(MEDIA_QUERY);
		const listener = (): void => apply();
		media.addEventListener("change", listener);
		return () => {
			media.removeEventListener("change", listener);
		};
	}, [mode, setResolved]);
}
