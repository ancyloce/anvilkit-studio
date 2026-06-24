import { buttonVariants } from "@anvilkit/ui/button";
import { Card } from "@anvilkit/ui/card";
import type { Metadata } from "next";
import Link from "next/link";
import { MarketingMotion } from "../_site/MarketingMotion";
import marketing from "../_site/marketing.module.css";
import { SiteFooter } from "../_site/SiteFooter";
import { DOCS_URL, GITHUB_URL } from "../_site/site-config";

export const metadata: Metadata = {
	title: "About — AnvilKit",
	description:
		"AnvilKit is a monorepo of independently publishable, Puck-native React component packages, plus the Studio shell, IR, and plugin ecosystem that compose them.",
};

const PRINCIPLES: readonly string[] = [
	"Each component is its own npm package under @anvilkit/* — no umbrella bundle, so consumers install only what they need.",
	"Every package honours the Puck contract: componentConfig, defaultProps, fields, and metadata, ready for both direct rendering and the editor.",
	"Render components accept only serializable props, so a page is just data that round-trips through Puck, the IR, and export.",
	"Components are built with Rslib to ship CJS, ESM, and type definitions, and are versioned independently with Changesets.",
];

interface Pkg {
	readonly name: string;
	readonly body: string;
}

const STACK: readonly Pkg[] = [
	{
		name: "@anvilkit/core",
		body: "The runtime, plugin engine, and the <Studio> editor shell that hosts Puck.",
	},
	{
		name: "@anvilkit/ir",
		body: "The Headless Page IR and the transforms that turn Puck data into portable output.",
	},
	{
		name: "@anvilkit/schema",
		body: "AI-friendly schema derivation that powers the copilot and validation.",
	},
	{
		name: "@anvilkit/validator",
		body: "A Puck Config validator that guards the editor and publish path.",
	},
	{
		name: "Component packages",
		body: "Hero, Navbar, Pricing, Bento Grid, Statistics, Blog List, and more — each publishable on its own.",
	},
	{
		name: "Plugin ecosystem",
		body: "AI copilot, asset manager, canvas studio, collaboration, design system, version history, and export plugins.",
	},
];

export default function AboutPage() {
	return (
		<main className={`huly-root ${marketing.page}`}>
			{/* Progressive-enhancement GSAP motion (renders null) */}
			<MarketingMotion />
			{/* Intro */}
			<section className={marketing.hero}>
				<span className={marketing.heroAurora} aria-hidden="true" />
				<span className={marketing.heroSunburst} aria-hidden="true" />
				<div className={marketing.container}>
					<div
						className={marketing.heroInner}
						style={{ gridTemplateColumns: "1fr" }}
					>
						<div>
							<span
								className={`${marketing.tag} ${marketing.tagEmber} ${marketing.eyebrow}`}
							>
								About
							</span>
							<h1 className={marketing.heroTitle}>
								Pages built from packages you can publish
							</h1>
							<p className={marketing.heroLede}>
								AnvilKit is a monorepo of independently publishable, Puck-native
								React components — and the Studio shell, IR, and plugins that
								compose them into a complete authoring experience.
							</p>
							<div className={marketing.heroActions}>
								<a
									className={buttonVariants({ size: "lg" })}
									href={GITHUB_URL}
									target="_blank"
									rel="noreferrer noopener"
								>
									View on GitHub ↗
								</a>
								<a
									className={buttonVariants({
										variant: "secondary",
										size: "lg",
									})}
									href={DOCS_URL}
									target="_blank"
									rel="noreferrer noopener"
								>
									Read the docs ↗
								</a>
							</div>
						</div>
					</div>
				</div>
			</section>

			{/* Principles */}
			<section className={`${marketing.bandLight} ${marketing.sectionPad}`}>
				<div className={marketing.container}>
					<div className={marketing.split}>
						<div className={marketing.sectionHead} style={{ marginBottom: 0 }}>
							<span
								className={`${marketing.tag} ${marketing.tagIris} ${marketing.kicker}`}
							>
								The model
							</span>
							<h2 className={marketing.sectionTitle}>
								A publishing model, not a kitchen sink
							</h2>
							<p className={marketing.sectionLede}>
								The whole project is organised around one idea: a component is a
								package, and a page is serializable data.
							</p>
						</div>
						<ul className={marketing.proseList}>
							{PRINCIPLES.map((principle) => (
								<li key={principle}>{principle}</li>
							))}
						</ul>
					</div>
				</div>
			</section>

			{/* Stack */}
			<section className={`${marketing.bandVoid} ${marketing.sectionPad}`}>
				<div className={marketing.container}>
					<div className={marketing.sectionHead}>
						<span
							className={`${marketing.tag} ${marketing.tagEmber} ${marketing.kicker}`}
						>
							In the monorepo
						</span>
						<h2 className={marketing.sectionTitle}>What powers the studio</h2>
						<p className={marketing.sectionLede}>
							A small set of foundational packages, a growing catalog of
							components, and a plugin layer that extends the editor without
							forking it.
						</p>
					</div>
					<div className={marketing.linkGrid}>
						{STACK.map((pkg) => (
							<Card key={pkg.name} className="gap-2 p-6">
								<h3 className={marketing.linkCardTitle}>{pkg.name}</h3>
								<p className={marketing.featureBody}>{pkg.body}</p>
							</Card>
						))}
					</div>
				</div>
			</section>

			{/* CTA */}
			<section className={`${marketing.bandDark} ${marketing.sectionPad}`}>
				<div className={marketing.container}>
					<div
						className={`${marketing.sectionHead} ${marketing.sectionHeadCenter}`}
					>
						<h2 className={marketing.sectionTitle}>See it for yourself</h2>
						<p className={marketing.sectionLede}>
							Open the editor hub to try every surface, or jump straight into
							the visual builder.
						</p>
					</div>
					<div
						className={marketing.heroActions}
						style={{ justifyContent: "center" }}
					>
						<Link className={buttonVariants({ size: "lg" })} href="/editor">
							Explore the editor
						</Link>
						<Link
							className={buttonVariants({ variant: "outline", size: "lg" })}
							href="/"
						>
							Back to home
						</Link>
					</div>
				</div>
			</section>

			<SiteFooter />
		</main>
	);
}
