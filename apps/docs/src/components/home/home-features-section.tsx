import type { ReactNode } from "react";
import {
	LiquidGlassCard,
	type LiquidGlassItem,
} from "@/components/liquid-glass-card";
import type { HomeMessages } from "@/lib/home-messages";

// A single Liquid Glass feature-layer card's data — built in `HomeContent`
// from `t` (kept there since it already types the array inline).
export interface HomeFeatureLayer {
	title: string;
	body: string;
	tint: string;
	items: LiquidGlassItem[];
	footer: ReactNode;
}

export interface HomeFeaturesSectionProps {
	t: HomeMessages;
	layers: HomeFeatureLayer[];
}

// Features band — the Liquid Glass "why AnvilKit" showcase. `data-reveal` /
// `data-reveal-item` are queried live by `HomeContent`'s GSAP scope.
export function HomeFeaturesSection({ t, layers }: HomeFeaturesSectionProps) {
	return (
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
	);
}
