"use client";

import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useRef } from "react";

// Register GSAP plugins once. This module is "use client", so it never runs
// during SSR. Registering `useGSAP` enables the hook's auto-cleanup contract.
gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText);

interface MarketingMotionProps {
	/**
	 * Selector for the page root to scope every animation to. Defaults to the
	 * marketing `<main>` (each page renders exactly one).
	 */
	readonly rootSelector?: string;
}

/**
 * Progressive-enhancement motion layer for the marketing pages (Home / Editor /
 * About). It renders NO DOM of its own (returns `null`) and never alters the
 * page markup, layout, colors, or styles — it only *reads* existing elements
 * (by their `data-anim` attributes, kept separate from the Tailwind styling
 * classes in `marketing-styles.ts` so animation targeting doesn't couple to
 * presentation) and animates their transform/opacity:
 *
 *   1. Hero headline split into characters with an `expo.out` fade-up stagger,
 *      then eyebrow → lede → CTAs → meta → media on a hierarchy-staggered
 *      timeline (entrance plays on load).
 *   2. Each section header reveals on scroll (word-level fade-up, `power3.out`).
 *   3. Card grids (features / steps / capability links) reveal with a
 *      scroll-linked `scrub` stagger, so the section "breathes" with the
 *      scrollbar.
 *   4. The embedded-editor frame gets a gentle scrubbed parallax.
 *
 * Honors `prefers-reduced-motion`: when set, nothing animates and every element
 * stays in its natural, fully-visible state. Because the work runs in
 * `useGSAP` (a layout effect), the `from()` start-states are applied before the
 * browser paints, so there is no flash; if JS never runs, the server-rendered
 * text stays fully visible (no opacity is baked into the markup).
 */
export function MarketingMotion({
	rootSelector = "main",
}: MarketingMotionProps) {
	// SplitText mutates the DOM (wraps words/chars in spans). useGSAP reverts
	// the tweens + ScrollTriggers automatically, but not SplitText, so we track
	// instances and revert them in the cleanup below.
	const splitsRef = useRef<SplitText[]>([]);

	useGSAP(
		() => {
			const root = document.querySelector<HTMLElement>(rootSelector);
			if (!root) return;

			// Respect reduced-motion: leave the page exactly as rendered.
			if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
				return;
			}

			// Scoped helpers — these return real elements (never bare selector
			// strings), so nothing outside `root` is ever touched.
			const all = (sel: string) =>
				gsap.utils.toArray<HTMLElement>(root.querySelectorAll(sel));
			const one = (sel: string) => root.querySelector<HTMLElement>(sel);

			const splits = splitsRef.current;
			const split = (el: Element, type: "words,chars" | "words") => {
				const instance = new SplitText(el, { type });
				splits.push(instance);
				return instance;
			};

			// ---- 1. Hero entrance (time-based, plays on load) --------------
			const heroTitle = one('[data-anim="hero-title"]');
			const heroTl = gsap.timeline({
				defaults: { ease: "expo.out", duration: 0.9 },
			});
			if (heroTitle) {
				// Per-character fade-up — the signature headline reveal.
				heroTl.from(split(heroTitle, "words,chars").chars, {
					yPercent: 110,
					opacity: 0,
					stagger: 0.03, // within the 0.03–0.08s spec
				});
			}
			// Supporting hero elements rise in after the headline, lightly
			// staggered by visual hierarchy (eyebrow → lede → CTAs → meta).
			const heroBits = [
				one('[data-anim="eyebrow"]'),
				one('[data-anim="hero-lede"]'),
				one('[data-anim="hero-actions"]'),
				one('[data-anim="hero-meta"]'),
			].filter((node): node is HTMLElement => node !== null);
			if (heroBits.length > 0) {
				heroTl.from(
					heroBits,
					{
						y: 40,
						opacity: 0,
						ease: "power3.out",
						duration: 0.8,
						stagger: 0.08,
					},
					heroTitle ? "-=0.55" : 0,
				);
			}
			// Hero media (the product mock) eases up alongside the copy.
			const heroMedia = one('[data-anim="product-frame"]');
			if (heroMedia) {
				heroTl.from(
					heroMedia,
					{ y: 60, opacity: 0, ease: "power3.out", duration: 1 },
					"-=0.7",
				);
			}

			// ---- 2. Section headers reveal on scroll ----------------------
			for (const head of all('[data-anim="section-head"]')) {
				const title = head.querySelector('[data-anim="section-title"]');
				const lede = head.querySelector('[data-anim="section-lede"]');
				const tl = gsap.timeline({
					// Start a little before the header fully enters the viewport.
					scrollTrigger: { trigger: head, start: "top 80%" },
					defaults: { ease: "power3.out" },
				});
				if (title) {
					// Word-level reveal keeps longer section titles readable.
					tl.from(split(title, "words").words, {
						yPercent: 100,
						opacity: 0,
						duration: 0.7,
						stagger: 0.06,
					});
				}
				if (lede) {
					tl.from(lede, { y: 24, opacity: 0, duration: 0.6 }, "-=0.3");
				}
			}

			// ---- 3. Card grids — scrubbed, scroll-linked stagger ----------
			// As a grid scrolls through the start→end window its cards reveal in
			// sequence tied to the scrollbar, so the section breathes.
			for (const gridSelector of [
				'[data-anim="feature-grid"]',
				'[data-anim="steps-grid"]',
				'[data-anim="link-grid"]',
			]) {
				for (const grid of all(gridSelector)) {
					const items = gsap.utils.toArray<HTMLElement>(grid.children);
					if (items.length === 0) continue;
					gsap.from(items, {
						y: 50,
						opacity: 0,
						ease: "power2.out",
						duration: 0.6,
						stagger: 0.08,
						scrollTrigger: {
							trigger: grid,
							start: "top 85%",
							end: "top 55%",
							scrub: 1,
						},
					});
				}
			}

			// ---- 4. Embedded-editor frame — gentle scrubbed parallax ------
			for (const frame of all('[data-anim="embed-frame"]')) {
				gsap.fromTo(
					frame,
					{ y: 36 },
					{
						y: -36,
						ease: "none",
						scrollTrigger: {
							trigger: frame,
							start: "top bottom",
							end: "bottom top",
							scrub: true,
						},
					},
				);
			}

			// Recalculate trigger positions once the display font swaps in (it
			// loads from a <link>, which can shift text metrics after split).
			document.fonts?.ready.then(() => ScrollTrigger.refresh());

			// Restore the original (un-split) DOM on unmount / re-run.
			return () => {
				for (const instance of splits) {
					instance.revert();
				}
				splits.length = 0;
			};
		},
		{ dependencies: [rootSelector] },
	);

	return null;
}
