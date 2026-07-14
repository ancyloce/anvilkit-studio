import { useGSAP } from "@gsap/react";
import { Link } from "@tanstack/react-router";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
	ArrowRight,
	Boxes,
	FileCode2,
	History,
	Share2,
	Sparkles,
	Users,
} from "lucide-react";
import { useRef } from "react";
import { getHomeMessages } from "@/lib/home-messages";
import { docSplat } from "@/lib/i18n";
import { baseOptions } from "@/lib/layout.shared";
import { HomeComponentsSection } from "./home/home-components-section";
import type { HomeFeatureLayer } from "./home/home-features-section";
import { HomeFeaturesSection } from "./home/home-features-section";
import { HomeFinaleSection } from "./home/home-finale-section";
import { HomeHero } from "./home/home-hero";
import { HomeInstallSection } from "./home/home-install-section";
import { HomePluginsSection } from "./home/home-plugins-section";
import "@/styles/home.css";

// GSAP must never touch the DOM during SSR; register only in the browser. The
// `useGSAP` hook itself is a no-op on the server (isomorphic layout effect).
if (typeof window !== "undefined") {
	gsap.registerPlugin(useGSAP, ScrollTrigger);
}

// Marketing home, shared by the default-locale `/` route and the localized
// `/zh`, `/ja`, `/ko` home pages served through the docs splat. Prose comes from
// `getHomeMessages(locale)`; internal doc links are locale-prefixed via
// `docSplat` (playground + GitHub stay un-prefixed). The whole tree renders on
// the server (content-first / LCP-safe) and GSAP layers entrance + scroll
// motion on top during client hydration, skipping under reduced-motion.
export function HomeContent({ locale }: { locale: string }) {
	const t = getHomeMessages(locale);
	const root = useRef<HTMLDivElement>(null);

	// Feature "layers" — each Liquid Glass card groups several capabilities into
	// a labeled multi-icon cluster (the six features regrouped into two layers).
	const layers: HomeFeatureLayer[] = [
		{
			title: t.layerCoreTitle,
			body: t.layerCoreBody,
			tint: "var(--akh-iris)",
			items: [
				{
					icon: <Boxes />,
					label: t.featPackagesTitle,
					description: t.featPackagesBody,
				},
				{
					icon: <FileCode2 />,
					label: t.featIrTitle,
					description: t.featIrBody,
				},
				{
					icon: <Share2 />,
					label: t.featExportTitle,
					description: t.featExportBody,
				},
			],
			footer: (
				<Link
					to="/$"
					params={{ _splat: docSplat(locale, "components") }}
					className="aklg-cta"
				>
					{t.browseComponents} <ArrowRight size={13} />
				</Link>
			),
		},
		{
			title: t.layerLiveTitle,
			body: t.layerLiveBody,
			tint: "var(--akh-ember)",
			items: [
				{ icon: <Sparkles />, label: t.featAiTitle, description: t.featAiBody },
				{
					icon: <Users />,
					label: t.featCollabTitle,
					description: t.featCollabBody,
				},
				{
					icon: <History />,
					label: t.featHistoryTitle,
					description: t.featHistoryBody,
				},
			],
			footer: (
				<Link
					to="/$"
					params={{ _splat: docSplat(locale, "plugins") }}
					className="aklg-cta"
				>
					{t.browsePlugins} <ArrowRight size={13} />
				</Link>
			),
		},
	];

	useGSAP(
		() => {
			// Content-first: under prefers-reduced-motion we never touch the DOM, so
			// the server-rendered page simply stays put (nothing is ever hidden).
			// `useGSAP` owns all cleanup — its context.revert() restores the inline
			// styles between StrictMode's double-invoke, so the final pass animates
			// cleanly to completion (a manual matchMedia.revert() here strands the
			// hero timeline at opacity 0).
			if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

			const q = gsap.utils.selector(root);

			// Hero entrance — explicit set→to (not from) so the reveal can't be left
			// stranded mid-tween: staggered slide-up, then the product frame scales in.
			gsap.set("[data-hero-item]", { autoAlpha: 0, y: 24 });
			gsap.set("[data-hero-frame]", { autoAlpha: 0, y: 32, scale: 0.96 });
			gsap
				.timeline({ defaults: { ease: "power3.out" } })
				.to("[data-hero-item]", {
					autoAlpha: 1,
					y: 0,
					duration: 0.7,
					stagger: 0.08,
				})
				.to(
					"[data-hero-frame]",
					{ autoAlpha: 1, y: 0, scale: 1, duration: 0.9 },
					"-=0.55",
				);

			// Aurora beam — gentle parallax drift as the hero scrolls away.
			gsap.to("[data-aurora]", {
				yPercent: 14,
				ease: "none",
				scrollTrigger: {
					trigger: root.current,
					start: "top top",
					end: "bottom top",
					scrub: true,
				},
			});

			// Section reveals — each group's items stagger up once on enter.
			for (const group of q("[data-reveal]")) {
				gsap.from(group.querySelectorAll("[data-reveal-item]"), {
					y: 28,
					autoAlpha: 0,
					duration: 0.6,
					stagger: 0.06,
					ease: "power2.out",
					scrollTrigger: { trigger: group, start: "top 82%", once: true },
				});
			}
		},
		{ scope: root },
	);

	return (
		<HomeLayout {...baseOptions()}>
			{/* Fumadocs HomeLayout already provides the <main> landmark, so this
			    GSAP scope root is a plain <div> to avoid a nested/duplicate main. */}
			<div ref={root} className="akh flex flex-1 flex-col">
				<HomeHero t={t} locale={locale} />
				<HomeComponentsSection t={t} locale={locale} />
				<HomePluginsSection t={t} locale={locale} />
				<HomeFeaturesSection t={t} layers={layers} />
				<HomeInstallSection t={t} locale={locale} />
				<HomeFinaleSection t={t} locale={locale} />
			</div>
		</HomeLayout>
	);
}
