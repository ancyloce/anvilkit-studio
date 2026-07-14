import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import type { HomeMessages } from "@/lib/home-messages";
import { docSplat } from "@/lib/i18n";

export interface HomeFinaleSectionProps {
	t: HomeMessages;
	locale: string;
}

// Finale band — closing CTA. `data-reveal` / `data-reveal-item` are queried
// live by `HomeContent`'s GSAP scope.
export function HomeFinaleSection({ t, locale }: HomeFinaleSectionProps) {
	return (
		<section className="akh-band akh-band--alt akh-section">
			<div className="akh-inner" data-reveal>
				<div className="akh-finale" data-reveal-item>
					<h2 className="akh-display akh-display--mid">{t.finaleHeading}</h2>
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
	);
}
