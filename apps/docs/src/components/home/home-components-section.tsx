import { Link } from "@tanstack/react-router";
import { ArrowRight, Boxes } from "lucide-react";
import type { HomeMessages } from "@/lib/home-messages";
import { docSplat } from "@/lib/i18n";
import { COMPONENTS } from "./home-data";

export interface HomeComponentsSectionProps {
	t: HomeMessages;
	locale: string;
}

// Components band — catalog grid + "browse all" glow card. `data-reveal` /
// `data-reveal-item` are queried live by `HomeContent`'s GSAP scope.
export function HomeComponentsSection({
	t,
	locale,
}: HomeComponentsSectionProps) {
	return (
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
	);
}
