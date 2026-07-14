import { Link } from "@tanstack/react-router";
import { ArrowRight, Star } from "lucide-react";
import type { HomeMessages } from "@/lib/home-messages";
import { docSplat } from "@/lib/i18n";
import { gitConfig } from "@/lib/shared";
import { COMPONENTS, PLUGINS } from "./home-data";

const VERSION = "0.1.x";

export interface HomeHeroProps {
	t: HomeMessages;
	locale: string;
}

// Hero band — badge/eyebrow/title/lede/CTA row/stats plus the stylized
// <Studio> product-frame mock. `data-hero-item` / `data-hero-frame` /
// `data-aurora` are queried live by `HomeContent`'s GSAP scope, so they must
// stay on these exact elements.
export function HomeHero({ t, locale }: HomeHeroProps) {
	return (
		<section className="akh-band akh-hero">
			<div className="akh-aurora" data-aurora aria-hidden="true" />
			<div className="akh-aurora-base" aria-hidden="true" />
			<div className="akh-inner akh-hero-grid">
				<div>
					<span className="akh-badge" data-hero-item>
						<span className="akh-tag-dot text-[#5683da]" />
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
							<span className="akh-rail-item w-[60%]" />
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
	);
}
