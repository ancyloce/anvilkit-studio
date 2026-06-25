import { buttonVariants } from "@anvilkit/ui/button";
import { Card } from "@anvilkit/ui/card";
import type { Metadata } from "next";
import Link from "next/link";
import type { DemoMessageKey } from "../../lib/i18n/messages";
import { getServerT } from "../../lib/i18n/server";
import { MarketingMotion } from "../_site/MarketingMotion";
import marketing from "../_site/marketing.module.css";
import { SiteFooter } from "../_site/SiteFooter";
import { DOCS_URL, GITHUB_URL } from "../_site/site-config";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getServerT();
	return {
		title: t("meta.about.title"),
		description: t("meta.about.description"),
	};
}

const PRINCIPLES: readonly DemoMessageKey[] = [
	"about.principle.1",
	"about.principle.2",
	"about.principle.3",
	"about.principle.4",
];

interface Pkg {
	/** Literal package name (kept untranslated), or a localized name via key. */
	readonly name?: string;
	readonly nameKey?: DemoMessageKey;
	readonly bodyKey: DemoMessageKey;
}

const STACK: readonly Pkg[] = [
	{ name: "@anvilkit/core", bodyKey: "about.stack.core.body" },
	{ name: "@anvilkit/ir", bodyKey: "about.stack.ir.body" },
	{ name: "@anvilkit/schema", bodyKey: "about.stack.schema.body" },
	{ name: "@anvilkit/validator", bodyKey: "about.stack.validator.body" },
	{
		nameKey: "about.stack.components.name",
		bodyKey: "about.stack.components.body",
	},
	{ nameKey: "about.stack.plugins.name", bodyKey: "about.stack.plugins.body" },
];

export default async function AboutPage() {
	const t = await getServerT();
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
								{t("about.intro.tag")}
							</span>
							<h1 className={marketing.heroTitle}>{t("about.intro.title")}</h1>
							<p className={marketing.heroLede}>{t("about.intro.lede")}</p>
							<div className={marketing.heroActions}>
								<a
									className={buttonVariants({ size: "lg" })}
									href={GITHUB_URL}
									target="_blank"
									rel="noreferrer noopener"
								>
									{t("about.intro.github")}
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
									{t("about.intro.docs")}
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
								{t("about.principles.tag")}
							</span>
							<h2 className={marketing.sectionTitle}>
								{t("about.principles.title")}
							</h2>
							<p className={marketing.sectionLede}>
								{t("about.principles.lede")}
							</p>
						</div>
						<ul className={marketing.proseList}>
							{PRINCIPLES.map((principleKey) => (
								<li key={principleKey}>{t(principleKey)}</li>
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
							{t("about.stack.tag")}
						</span>
						<h2 className={marketing.sectionTitle}>{t("about.stack.title")}</h2>
						<p className={marketing.sectionLede}>{t("about.stack.lede")}</p>
					</div>
					<div className={marketing.linkGrid}>
						{STACK.map((pkg) => (
							<Card key={pkg.bodyKey} className="gap-2 p-6">
								<h3 className={marketing.linkCardTitle}>
									{pkg.nameKey ? t(pkg.nameKey) : pkg.name}
								</h3>
								<p className={marketing.featureBody}>{t(pkg.bodyKey)}</p>
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
						<h2 className={marketing.sectionTitle}>{t("about.cta.title")}</h2>
						<p className={marketing.sectionLede}>{t("about.cta.lede")}</p>
					</div>
					<div
						className={marketing.heroActions}
						style={{ justifyContent: "center" }}
					>
						<Link className={buttonVariants({ size: "lg" })} href="/editor">
							{t("about.cta.explore")}
						</Link>
						<Link
							className={buttonVariants({ variant: "outline", size: "lg" })}
							href="/"
						>
							{t("about.cta.home")}
						</Link>
					</div>
				</div>
			</section>

			<SiteFooter />
		</main>
	);
}
