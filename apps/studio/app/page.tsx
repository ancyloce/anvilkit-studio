import { buttonVariants } from "@anvilkit/ui/button";
import { Card } from "@anvilkit/ui/card";
import { cn } from "@anvilkit/ui/lib/utils";
import {
	Blocks,
	FileCode2,
	Languages,
	type LucideIcon,
	Package,
	Palette,
	PenTool,
	Sparkles,
	Users,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { DemoMessageKey } from "../lib/i18n/messages";
import { getServerT } from "../lib/i18n/server";
import { EditorMockup } from "./_site/EditorMockup";
import { MarketingMotion } from "./_site/MarketingMotion";
import { MiniEditor } from "./_site/MiniEditor";
import * as marketing from "./_site/marketing-styles";
import { SiteFooter } from "./_site/SiteFooter";
import { DOCS_URL, HULY_ROOT } from "./_site/site-config";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getServerT();
	return {
		title: t("meta.home.title"),
		description: t("meta.home.description"),
	};
}

interface Feature {
	readonly icon: LucideIcon;
	readonly titleKey: DemoMessageKey;
	readonly bodyKey: DemoMessageKey;
	readonly ember?: boolean;
}

const FEATURES: readonly Feature[] = [
	{
		icon: Blocks,
		titleKey: "home.feature.puckNative.title",
		bodyKey: "home.feature.puckNative.body",
	},
	{
		icon: Package,
		titleKey: "home.feature.independent.title",
		bodyKey: "home.feature.independent.body",
		ember: true,
	},
	{
		icon: Sparkles,
		titleKey: "home.feature.ai.title",
		bodyKey: "home.feature.ai.body",
	},
	{
		icon: Users,
		titleKey: "home.feature.collab.title",
		bodyKey: "home.feature.collab.body",
		ember: true,
	},
	{
		icon: PenTool,
		titleKey: "home.feature.canvas.title",
		bodyKey: "home.feature.canvas.body",
	},
	{
		icon: FileCode2,
		titleKey: "home.feature.export.title",
		bodyKey: "home.feature.export.body",
		ember: true,
	},
	{
		icon: Palette,
		titleKey: "home.feature.tokens.title",
		bodyKey: "home.feature.tokens.body",
	},
	{
		icon: Languages,
		titleKey: "home.feature.i18n.title",
		bodyKey: "home.feature.i18n.body",
		ember: true,
	},
];

interface Step {
	readonly titleKey: DemoMessageKey;
	readonly bodyKey: DemoMessageKey;
	readonly code: string;
}

const STEPS: readonly Step[] = [
	{
		titleKey: "home.step.install.title",
		bodyKey: "home.step.install.body",
		code: "pnpm add @anvilkit/core \\\n  @anvilkit/hero @anvilkit/navbar",
	},
	{
		titleKey: "home.step.compose.title",
		bodyKey: "home.step.compose.body",
		code: 'import { createHeroConfig } from "@anvilkit/hero";\n\nconst config = {\n  components: { Hero: createHeroConfig() },\n};',
	},
	{
		titleKey: "home.step.mount.title",
		bodyKey: "home.step.mount.body",
		code: 'import { Studio } from "@anvilkit/core";\n\n<Studio puckConfig={config} data={data} />;',
	},
	{
		titleKey: "home.step.publish.title",
		bodyKey: "home.step.publish.body",
		code: "// Publish → IR → export\nawait exportHtml(ir);\nawait exportReact(ir, { syntax: 'tsx' });",
	},
];

export default async function Home() {
	const t = await getServerT();
	return (
		<main className={cn(HULY_ROOT, marketing.page)}>
			{/* Progressive-enhancement GSAP motion (renders null) */}
			<MarketingMotion />
			{/* Module 1 — Product Introduction (Hero) */}
			<section className={marketing.hero}>
				<span className={marketing.heroAurora} aria-hidden="true" />
				<span className={marketing.heroSunburst} aria-hidden="true" />
				<div className={marketing.container}>
					<div className={marketing.heroInner}>
						<div>
							<span
								className={cn(
									marketing.tag,
									marketing.tagIris,
									marketing.eyebrow,
								)}
								data-anim="eyebrow"
							>
								{t("home.hero.tag")}
							</span>
							<h1 className={marketing.heroTitle} data-anim="hero-title">
								{t("home.hero.titleLead")}{" "}
								<span className={marketing.heroTitleAccent}>
									{t("home.hero.titleAccent")}
								</span>
							</h1>
							<p className={marketing.heroLede} data-anim="hero-lede">
								{t("home.hero.lede")}
							</p>
							<div className={marketing.heroActions} data-anim="hero-actions">
								<Link className={buttonVariants({ size: "lg" })} href="/editor">
									{t("home.hero.ctaPrimary")}
								</Link>
								<a
									className={buttonVariants({
										variant: "secondary",
										size: "lg",
									})}
									href="#demo"
								>
									{t("home.hero.ctaSecondary")}
								</a>
							</div>
							<div className={marketing.heroMeta} data-anim="hero-meta">
								<span>
									<strong className={marketing.heroMetaStrong}>11+</strong>{" "}
									{t("home.hero.metaBlocks")}
								</span>
								<span>
									<strong className={marketing.heroMetaStrong}>Puck</strong>{" "}
									{t("home.hero.metaBuilder")}
								</span>
								<span>
									<strong className={marketing.heroMetaStrong}>
										HTML · React · JSON
									</strong>{" "}
									{t("home.hero.metaExport")}
								</span>
							</div>
						</div>
						<EditorMockup />
					</div>
				</div>
			</section>

			{/* Module 2 — Interactive Editor Demo (live preview) */}
			<section
				id="demo"
				className={cn(marketing.bandDark, marketing.sectionPad)}
			>
				<div className={marketing.container}>
					<div className={marketing.sectionHead} data-anim="section-head">
						<span
							className={cn(
								marketing.tag,
								marketing.tagEmber,
								marketing.kicker,
							)}
						>
							{t("home.demo.tag")}
						</span>
						<h2 className={marketing.sectionTitle} data-anim="section-title">
							{t("home.demo.title")}
						</h2>
						<p className={marketing.sectionLede} data-anim="section-lede">
							{t("home.demo.lede")}
						</p>
					</div>
					<MiniEditor />
				</div>
			</section>

			{/* Module 3 — Usage Guide (How to Use) */}
			<section className={cn(marketing.bandLight, marketing.sectionPad)}>
				<div className={marketing.container}>
					<div className={marketing.sectionHead} data-anim="section-head">
						<span
							className={cn(marketing.tag, marketing.tagIris, marketing.kicker)}
						>
							{t("home.howto.tag")}
						</span>
						<h2 className={marketing.sectionTitle} data-anim="section-title">
							{t("home.howto.title")}
						</h2>
						<p className={marketing.sectionLede} data-anim="section-lede">
							{t("home.howto.lede")}
						</p>
					</div>
					<div className={marketing.steps} data-anim="steps-grid">
						{STEPS.map((step, index) => (
							<Card key={step.titleKey} className="gap-3.5 p-6">
								<span className={marketing.stepNum}>{index + 1}</span>
								<h3 className={marketing.stepTitle}>{t(step.titleKey)}</h3>
								<p className={marketing.stepBody}>{t(step.bodyKey)}</p>
								<pre className={marketing.codeBlock}>
									<code>{step.code}</code>
								</pre>
							</Card>
						))}
					</div>
				</div>
			</section>

			{/* Module 4 — Core Features List */}
			<section className={cn(marketing.bandVoid, marketing.sectionPad)}>
				<div className={marketing.container}>
					<div
						className={cn(marketing.sectionHead, marketing.sectionHeadCenter)}
						data-anim="section-head"
					>
						<span
							className={cn(
								marketing.tag,
								marketing.tagEmber,
								marketing.kicker,
							)}
						>
							{t("home.features.tag")}
						</span>
						<h2 className={marketing.sectionTitle} data-anim="section-title">
							{t("home.features.title")}
						</h2>
						<p className={marketing.sectionLede} data-anim="section-lede">
							{t("home.features.lede")}
						</p>
					</div>
					<div className={marketing.featureGrid} data-anim="feature-grid">
						{FEATURES.map((feature) => {
							const Icon = feature.icon;
							return (
								<Card
									key={feature.titleKey}
									className={cn("relative gap-3 p-6", marketing.cardGlow)}
								>
									<span
										className={cn(
											marketing.featureIcon,
											feature.ember && marketing.featureIconEmber,
										)}
									>
										<Icon size={20} strokeWidth={1.75} />
									</span>
									<h3 className={marketing.featureTitle}>
										{t(feature.titleKey)}
									</h3>
									<p className={marketing.featureBody}>{t(feature.bodyKey)}</p>
								</Card>
							);
						})}
					</div>
				</div>
			</section>

			{/* Closing CTA */}
			<section className={cn(marketing.bandDark, marketing.sectionPad)}>
				<div className={marketing.container}>
					<div
						className={cn(marketing.sectionHead, marketing.sectionHeadCenter)}
						data-anim="section-head"
					>
						<h2 className={marketing.sectionTitle} data-anim="section-title">
							{t("home.cta.title")}
						</h2>
						<p className={marketing.sectionLede} data-anim="section-lede">
							{t("home.cta.lede")}
						</p>
					</div>
					<div className={cn(marketing.heroActions, "justify-center")}>
						<Link className={buttonVariants({ size: "lg" })} href="/editor">
							{t("home.cta.primary")}
						</Link>
						<a
							className={buttonVariants({ variant: "outline", size: "lg" })}
							href={DOCS_URL}
							target="_blank"
							rel="noreferrer noopener"
						>
							{t("home.cta.docs")}
						</a>
					</div>
				</div>
			</section>

			<SiteFooter />
		</main>
	);
}
