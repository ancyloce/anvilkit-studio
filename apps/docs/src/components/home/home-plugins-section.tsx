import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import type { HomeMessages } from "@/lib/home-messages";
import { docSplat } from "@/lib/i18n";
import { PLUGINS } from "./home-data";

export interface HomePluginsSectionProps {
	t: HomeMessages;
	locale: string;
}

// Plugins band — catalog grid. `data-reveal` / `data-reveal-item` are queried
// live by `HomeContent`'s GSAP scope.
export function HomePluginsSection({ t, locale }: HomePluginsSectionProps) {
	return (
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
	);
}
