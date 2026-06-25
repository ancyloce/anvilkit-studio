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
	Star,
	Users,
} from "lucide-react";
import { type ReactNode, useRef } from "react";
import {
	LiquidGlassCard,
	type LiquidGlassItem,
} from "@/components/liquid-glass-card";
import { getHomeMessages } from "@/lib/home-messages";
import { docSplat } from "@/lib/i18n";
import { baseOptions } from "@/lib/layout.shared";
import { gitConfig } from "@/lib/shared";
import "@/styles/home.css";

// GSAP must never touch the DOM during SSR; register only in the browser. The
// `useGSAP` hook itself is a no-op on the server (isomorphic layout effect).
if (typeof window !== "undefined") {
	gsap.registerPlugin(useGSAP, ScrollTrigger);
}

const VERSION = "0.1.x";

const COMPONENTS: Array<{ slug: string; pkg: string; blurb: string }> = [
	{
		slug: "bento-grid",
		pkg: "@anvilkit/bento-grid",
		blurb: "Responsive bento-style grid layout.",
	},
	{
		slug: "blog-list",
		pkg: "@anvilkit/blog-list",
		blurb: "Paginated blog post list.",
	},
	{
		slug: "button",
		pkg: "@anvilkit/button",
		blurb: "Primary, secondary, and ghost variants.",
	},
	{ slug: "helps", pkg: "@anvilkit/helps", blurb: "Help / FAQ accordion." },
	{
		slug: "hero",
		pkg: "@anvilkit/hero",
		blurb: "Configurable hero section with CTAs.",
	},
	{
		slug: "input",
		pkg: "@anvilkit/input",
		blurb: "Text input with label and validation.",
	},
	{
		slug: "logo-clouds",
		pkg: "@anvilkit/logo-clouds",
		blurb: "Customer / partner logo cloud.",
	},
	{
		slug: "navbar",
		pkg: "@anvilkit/navbar",
		blurb: "Responsive top navigation bar.",
	},
	{
		slug: "pricing-minimal",
		pkg: "@anvilkit/pricing-minimal",
		blurb: "Minimal three-tier pricing table.",
	},
	{
		slug: "section",
		pkg: "@anvilkit/section",
		blurb: "Generic content section wrapper.",
	},
	{
		slug: "statistics",
		pkg: "@anvilkit/statistics",
		blurb: "Metrics / stat highlight block.",
	},
];

const PLUGINS: Array<{ slug: string; name: string; blurb: string }> = [
	{
		slug: "plugin-ai-copilot",
		name: "AI Copilot",
		blurb: "Generate and edit sections with natural language.",
	},
	{
		slug: "plugin-export-html",
		name: "Export · HTML",
		blurb: "Emit clean, framework-free HTML.",
	},
	{
		slug: "plugin-export-react",
		name: "Export · React",
		blurb: "Emit a typed React component tree.",
	},
	{
		slug: "plugin-asset-manager",
		name: "Asset Manager",
		blurb: "Folders, uploads, and Unsplash search.",
	},
	{
		slug: "plugin-version-history",
		name: "Version History",
		blurb: "Branch-safe snapshots with one-click restore.",
	},
	{
		slug: "plugin-collab-yjs",
		name: "Collab · Yjs",
		blurb: "Yjs transport for realtime multiplayer editing.",
	},
	{
		slug: "plugin-collab-ui",
		name: "Collab · UI",
		blurb: "Live cursors, presence avatars, and status.",
	},
	{
		slug: "plugin-canvas-studio",
		name: "Canvas Studio",
		blurb: "A freeform design canvas inside Studio.",
	},
	{
		slug: "plugin-export-canvas",
		name: "Export · Canvas",
		blurb: "Export canvas designs to PNG, SVG, and PDF.",
	},
	{
		slug: "plugin-ai-image",
		name: "AI Image",
		blurb: "Generate and place imagery from prompts.",
	},
	{
		slug: "plugin-design-system",
		name: "Design System",
		blurb: "Tokens, themes, and a design-system rail.",
	},
	{
		slug: "plugin-page-seo",
		name: "Page SEO",
		blurb: "Metadata, Open Graph, and structured data.",
	},
];

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
	const layers: Array<{
		title: string;
		body: string;
		tint: string;
		items: LiquidGlassItem[];
		footer: ReactNode;
	}> = [
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
				{/* ----------------------------------------------------------- Hero */}
				<section className="akh-band akh-hero">
					<div className="akh-aurora" data-aurora aria-hidden="true" />
					<div className="akh-aurora-base" aria-hidden="true" />
					<div className="akh-inner akh-hero-grid">
						<div>
							<span className="akh-badge" data-hero-item>
								<span className="akh-tag-dot" style={{ color: "#5683da" }} />
								{t.badgeBefore} <strong>{VERSION}</strong> {t.badgeAfter}
							</span>
							<p className="akh-eyebrow" data-hero-item>
								{t.heroEyebrow}
							</p>
							<h1 className="akh-display" data-hero-item>
								{t.heroTitleLead}{" "}
								<span className="akh-gradient-text">{t.heroTitleAccent}</span>
							</h1>
							<p className="akh-lede" data-hero-item>
								{t.tagline}
							</p>
							<div className="akh-cta-row" data-hero-item>
								<Link
									to="/$"
									params={{ _splat: docSplat(locale, "getting-started") }}
									className="akh-btn akh-btn--primary"
								>
									{t.quickstart} <ArrowRight size={16} />
								</Link>
								<a href="/playground" className="akh-btn akh-btn--ghost">
									{t.openPlayground}
								</a>
								<a
									href={`https://github.com/${gitConfig.user}/${gitConfig.repo}`}
									className="akh-btn akh-btn--ghost"
								>
									<Star size={15} /> {t.viewGithub}
								</a>
							</div>
							<div className="akh-stats" data-hero-item>
								<div>
									<div className="akh-stat-num">{COMPONENTS.length}</div>
									<div className="akh-stat-label">{t.statComponents}</div>
								</div>
								<div>
									<div className="akh-stat-num">{PLUGINS.length}</div>
									<div className="akh-stat-label">{t.statPlugins}</div>
								</div>
								<div>
									<div className="akh-stat-num">100%</div>
									<div className="akh-stat-label">{t.statTyped}</div>
								</div>
							</div>
						</div>

						{/* Product screenshot frame — a stylized <Studio> editor mock. */}
						<div className="akh-frame" data-hero-frame aria-hidden="true">
							<div className="akh-frame-bar">
								<span className="akh-frame-dot" />
								<span className="akh-frame-dot" />
								<span className="akh-frame-dot" />
								<span className="akh-frame-title">{t.frameTitle}</span>
							</div>
							<div className="akh-frame-body">
								<div className="akh-frame-rail">
									<span className="akh-rail-item akh-rail-item--active" />
									<span className="akh-rail-item" />
									<span className="akh-rail-item" />
									<span className="akh-rail-item" />
									<span className="akh-rail-item" />
									<span className="akh-rail-item" style={{ width: "60%" }} />
								</div>
								<div className="akh-frame-canvas">
									<div className="akh-canvas-block akh-canvas-block--hero" />
									<div className="akh-canvas-row">
										<div className="akh-canvas-block akh-canvas-block--cell" />
										<div className="akh-canvas-block akh-canvas-block--cell" />
										<div className="akh-canvas-block akh-canvas-block--cell" />
									</div>
									<div className="akh-canvas-block akh-canvas-block--wide" />
									<div className="akh-canvas-block akh-canvas-block--wide" />
								</div>
							</div>
						</div>
					</div>
				</section>

				{/* ----------------------------------------------------- Components */}
				<section className="akh-band akh-band--alt akh-section">
					<div className="akh-inner" data-reveal>
						<div className="akh-section-head">
							<p className="akh-eyebrow" data-reveal-item>
								{t.componentsEyebrow}
							</p>
							<h2 className="akh-display akh-display--mid" data-reveal-item>
								{t.componentsHeading}
							</h2>
							<p className="akh-lede" data-reveal-item>
								{t.componentsBody}
							</p>
						</div>
						<div className="akh-grid akh-grid--3">
							{COMPONENTS.map((c) => (
								<Link
									key={c.slug}
									to="/$"
									params={{ _splat: docSplat(locale, `components/${c.slug}`) }}
									className="akh-card"
									data-reveal-item
								>
									<span className="akh-card-pkg">{c.pkg}</span>
									<p className="akh-card-body">{c.blurb}</p>
									<span className="akh-card-meta">
										{t.viewDocs} <ArrowRight size={13} />
									</span>
								</Link>
							))}
							<Link
								to="/$"
								params={{ _splat: docSplat(locale, "components") }}
								className="akh-card akh-card--glow"
								data-reveal-item
							>
								<span className="akh-card-icon">
									<Boxes size={20} />
								</span>
								<h3 className="akh-card-title">{t.browseComponents}</h3>
								<span className="akh-card-meta">
									{t.viewDocs} <ArrowRight size={13} />
								</span>
							</Link>
						</div>
					</div>
				</section>

				{/* -------------------------------------------------------- Plugins */}
				<section className="akh-band akh-band--base akh-section">
					<div className="akh-inner" data-reveal>
						<div className="akh-section-head">
							<p className="akh-eyebrow" data-reveal-item>
								{t.pluginsEyebrow}
							</p>
							<h2 className="akh-display akh-display--mid" data-reveal-item>
								{t.pluginsHeading}
							</h2>
							<p className="akh-lede" data-reveal-item>
								{t.pluginsBody}
							</p>
						</div>
						<div className="akh-grid akh-grid--3">
							{PLUGINS.map((p) => (
								<Link
									key={p.slug}
									to="/$"
									params={{ _splat: docSplat(locale, `plugins/${p.slug}`) }}
									className="akh-card"
									data-reveal-item
								>
									<h3 className="akh-card-title">{p.name}</h3>
									<p className="akh-card-body">{p.blurb}</p>
									<span className="akh-card-meta">
										{t.viewDocs} <ArrowRight size={13} />
									</span>
								</Link>
							))}
						</div>
					</div>
				</section>

				{/* ------------------------------------------------------- Features */}
				<section className="akh-band akh-band--alt akh-section">
					<div className="akh-inner" data-reveal>
						<div className="akh-section-head akh-section-head--center">
							<p className="akh-eyebrow" data-reveal-item>
								{t.featuresEyebrow}
							</p>
							<h2 className="akh-display akh-display--mid" data-reveal-item>
								{t.featuresHeading}
							</h2>
							<p
								className="akh-lede"
								data-reveal-item
								style={{ marginInline: "auto" }}
							>
								{t.featuresBody}
							</p>
						</div>
						<div className="aklg-stage">
							{/* Blurred brand orbs the glass cards refract over the flat band. */}
							<span
								className="aklg-stage-orb"
								aria-hidden="true"
								style={{
									top: -60,
									left: "10%",
									width: 360,
									height: 360,
									background: "var(--akh-iris)",
								}}
							/>
							<span
								className="aklg-stage-orb"
								aria-hidden="true"
								style={{
									bottom: -80,
									right: "8%",
									width: 320,
									height: 320,
									background: "var(--akh-ember)",
								}}
							/>
							<div className="akh-grid akh-grid--2 aklg-stage-grid">
								{layers.map((layer) => (
									<LiquidGlassCard
										key={layer.title}
										title={layer.title}
										description={layer.body}
										items={layer.items}
										footer={layer.footer}
										tint={layer.tint}
										data-reveal-item
									/>
								))}
							</div>
						</div>
					</div>
				</section>

				{/* -------------------------------------------------------- Install */}
				<section className="akh-band akh-band--base akh-section">
					<div className="akh-inner" data-reveal>
						<div
							className="akh-grid akh-grid--2"
							style={{ alignItems: "start" }}
						>
							<div className="akh-section-head" style={{ marginBottom: 0 }}>
								<p className="akh-eyebrow" data-reveal-item>
									{t.installEyebrow}
								</p>
								<h2 className="akh-display akh-display--mid" data-reveal-item>
									{t.installHeading}
								</h2>
								<p className="akh-lede" data-reveal-item>
									{t.installBody}
								</p>
								<p
									className="akh-card-body"
									data-reveal-item
									style={{ marginTop: 20 }}
								>
									{t.collabBefore}{" "}
									<Link
										to="/$"
										params={{
											_splat: docSplat(locale, "guides/collaboration"),
										}}
										className="akh-link"
									>
										{t.collabLink}
									</Link>{" "}
									{t.collabAfter}
								</p>
							</div>
							<div className="akh-install" data-reveal-item>
								<div className="akh-install-bar">
									<span className="akh-frame-dot" />
									<span className="akh-frame-dot" />
									<span className="akh-frame-dot" />
									<span style={{ marginLeft: 6 }}>Terminal</span>
								</div>
								<pre>
									<code>
										<span className="tok-cmd">pnpm add</span>{" "}
										<span className="tok-pkg">@anvilkit/core</span>{" "}
										<span className="tok-pkg">@anvilkit/ir</span> \{"\n"}
										{"         "}
										<span className="tok-pkg">@anvilkit/schema</span>{" "}
										<span className="tok-pkg">@anvilkit/validator</span> \{"\n"}
										{"         "}
										<span className="tok-pkg">@anvilkit/plugin-ai-copilot</span>{" "}
										\{"\n"}
										{"         "}
										<span className="tok-pkg">
											@anvilkit/plugin-asset-manager
										</span>{" "}
										\{"\n"}
										{"         "}
										<span className="tok-pkg">
											@anvilkit/plugin-export-html
										</span>{" "}
										\{"\n"}
										{"         "}
										<span className="tok-pkg">
											@anvilkit/plugin-export-react
										</span>{" "}
										\{"\n"}
										{"         "}
										<span className="tok-pkg">
											@anvilkit/plugin-version-history
										</span>
									</code>
								</pre>
							</div>
						</div>
					</div>
				</section>

				{/* --------------------------------------------------------- Finale */}
				<section className="akh-band akh-band--alt akh-section">
					<div className="akh-inner" data-reveal>
						<div className="akh-finale" data-reveal-item>
							<h2 className="akh-display akh-display--mid">
								{t.finaleHeading}
							</h2>
							<p
								className="akh-lede"
								style={{ marginInline: "auto", marginTop: 18 }}
							>
								{t.finaleBody}
							</p>
							<div className="akh-cta-row">
								<Link
									to="/$"
									params={{ _splat: docSplat(locale, "getting-started") }}
									className="akh-btn akh-btn--primary"
								>
									{t.finalePrimary} <ArrowRight size={16} />
								</Link>
								<a href="/playground" className="akh-btn akh-btn--white">
									{t.finaleSecondary}
								</a>
							</div>
						</div>
					</div>
				</section>
			</div>
		</HomeLayout>
	);
}
