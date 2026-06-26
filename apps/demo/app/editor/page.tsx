import { buttonVariants } from "@anvilkit/ui/button";
import { Card } from "@anvilkit/ui/card";
import { cn } from "@anvilkit/ui/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";
import type { DemoMessageKey } from "@/lib/i18n/messages";
import { getServerT } from "@/lib/i18n/server";
import { MarketingMotion } from "../_site/MarketingMotion";
import marketing from "../_site/marketing.module.css";
import { SiteFooter } from "../_site/SiteFooter";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getServerT();
	return {
		title: t("meta.editor.title"),
		description: t("meta.editor.description"),
	};
}

/** Editor surfaces that are their own routes (the `path` is a literal route). */
interface Surface {
	readonly titleKey: DemoMessageKey;
	readonly bodyKey: DemoMessageKey;
	readonly href: string;
	readonly path: string;
}

const SURFACES: readonly Surface[] = [
	{
		titleKey: "editorHub.surface.visual.title",
		bodyKey: "editorHub.surface.visual.body",
		href: "/puck/editor",
		path: "/puck/editor",
	},
	{
		titleKey: "editorHub.surface.render.title",
		bodyKey: "editorHub.surface.render.body",
		href: "/puck/render",
		path: "/puck/render",
	},
	{
		titleKey: "editorHub.surface.canvas.title",
		bodyKey: "editorHub.surface.canvas.body",
		href: "/studio/canvas/home",
		path: "/studio/canvas/[id]",
	},
	{
		titleKey: "editorHub.surface.collab.title",
		bodyKey: "editorHub.surface.collab.body",
		href: "/collab",
		path: "/collab",
	},
	{
		titleKey: "editorHub.surface.navbar.title",
		bodyKey: "editorHub.surface.navbar.body",
		href: "/navbar",
		path: "/navbar",
	},
	{
		titleKey: "editorHub.surface.hero.title",
		bodyKey: "editorHub.surface.hero.body",
		href: "/hero",
		path: "/hero",
	},
];

/** Plugins exercised from inside the visual editor (the `path` is localized). */
interface Plugin {
	readonly titleKey: DemoMessageKey;
	readonly bodyKey: DemoMessageKey;
	readonly pathKey: DemoMessageKey;
	readonly href: string;
}

const PLUGINS: readonly Plugin[] = [
	{
		titleKey: "editorHub.plugin.ai.title",
		bodyKey: "editorHub.plugin.ai.body",
		pathKey: "editorHub.plugin.ai.path",
		href: "/puck/editor",
	},
	{
		titleKey: "editorHub.plugin.export.title",
		bodyKey: "editorHub.plugin.export.body",
		pathKey: "editorHub.plugin.export.path",
		href: "/puck/editor",
	},
	{
		titleKey: "editorHub.plugin.assets.title",
		bodyKey: "editorHub.plugin.assets.body",
		pathKey: "editorHub.plugin.assets.path",
		href: "/puck/editor",
	},
	{
		titleKey: "editorHub.plugin.history.title",
		bodyKey: "editorHub.plugin.history.body",
		pathKey: "editorHub.plugin.history.path",
		href: "/puck/editor",
	},
	{
		titleKey: "editorHub.plugin.design.title",
		bodyKey: "editorHub.plugin.design.body",
		pathKey: "editorHub.plugin.design.path",
		href: "/puck/editor",
	},
	{
		titleKey: "editorHub.plugin.seo.title",
		bodyKey: "editorHub.plugin.seo.body",
		pathKey: "editorHub.plugin.seo.path",
		href: "/puck/editor",
	},
];

function CapabilityCard({
	title,
	body,
	path,
	href,
}: {
	title: string;
	body: string;
	path: string;
	href: string;
}) {
	return (
		<Link href={href} className="block">
			<Card
				className={cn(
					"relative h-full gap-2.5 p-[22px] hover:ring-[color:var(--huly-electric-iris)]",
					marketing.linkCardInteractive,
				)}
			>
				<div className={marketing.linkCardHead}>
					<h3 className={marketing.linkCardTitle}>{title}</h3>
					<span className={marketing.linkCardArrow} aria-hidden="true">
						→
					</span>
				</div>
				<p className={marketing.linkCardBody}>{body}</p>
				<span className={marketing.linkCardPath}>{path}</span>
			</Card>
		</Link>
	);
}

export default async function EditorHubPage() {
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
								className={`${marketing.tag} ${marketing.tagIris} ${marketing.eyebrow}`}
							>
								{t("editorHub.intro.tag")}
							</span>
							<h1 className={marketing.heroTitle}>
								{t("editorHub.intro.title")}
							</h1>
							<p className={marketing.heroLede}>{t("editorHub.intro.lede")}</p>
							<div className={marketing.heroActions}>
								<Link
									className={buttonVariants({ size: "lg" })}
									href="/puck/editor"
								>
									{t("editorHub.intro.ctaPrimary")}
								</Link>
								<Link
									className={buttonVariants({
										variant: "secondary",
										size: "lg",
									})}
									href="/puck/render"
								>
									{t("editorHub.intro.ctaSecondary")}
								</Link>
							</div>
						</div>
					</div>
				</div>
			</section>

			{/* Embedded live editor */}
			<section className={`${marketing.bandDark} ${marketing.sectionPad}`}>
				<div className={marketing.container}>
					<div className={marketing.sectionHead}>
						<span
							className={`${marketing.tag} ${marketing.tagEmber} ${marketing.kicker}`}
						>
							{t("editorHub.embed.tag")}
						</span>
						<h2 className={marketing.sectionTitle}>
							{t("editorHub.embed.title")}
						</h2>
						<p className={marketing.sectionLede}>
							{t("editorHub.embed.ledeBefore")} <code>/puck/editor</code>
							{t("editorHub.embed.ledeAfter")}
						</p>
					</div>
					<div className={marketing.embedFrame}>
						<div className={marketing.mockBar}>
							<span className={marketing.mockDot} />
							<span className={marketing.mockDot} />
							<span className={marketing.mockDot} />
							<span className={marketing.mockUrl}>anvilkit · /puck/editor</span>
						</div>
						<iframe
							className={marketing.embed}
							src="/puck/editor"
							title={t("editorHub.embed.iframeTitle")}
							loading="lazy"
						/>
					</div>
					<div className={marketing.heroActions} style={{ marginTop: 18 }}>
						<Link
							className={buttonVariants({ variant: "outline" })}
							href="/puck/editor"
						>
							{t("editorHub.embed.openFull")}
						</Link>
					</div>
				</div>
			</section>

			{/* Editor surfaces */}
			<section className={`${marketing.bandVoid} ${marketing.sectionPad}`}>
				<div className={marketing.container}>
					<div className={marketing.sectionHead}>
						<span
							className={`${marketing.tag} ${marketing.tagIris} ${marketing.kicker}`}
						>
							{t("editorHub.surfaces.tag")}
						</span>
						<h2 className={marketing.sectionTitle}>
							{t("editorHub.surfaces.title")}
						</h2>
						<p className={marketing.sectionLede}>
							{t("editorHub.surfaces.lede")}
						</p>
					</div>
					<div className={marketing.linkGrid}>
						{SURFACES.map((item) => (
							<CapabilityCard
								key={item.titleKey}
								title={t(item.titleKey)}
								body={t(item.bodyKey)}
								path={item.path}
								href={item.href}
							/>
						))}
					</div>
				</div>
			</section>

			{/* Plugins inside the editor */}
			<section className={`${marketing.bandDark} ${marketing.sectionPad}`}>
				<div className={marketing.container}>
					<div className={marketing.sectionHead}>
						<span
							className={`${marketing.tag} ${marketing.tagEmber} ${marketing.kicker}`}
						>
							{t("editorHub.plugins.tag")}
						</span>
						<h2 className={marketing.sectionTitle}>
							{t("editorHub.plugins.title")}
						</h2>
						<p className={marketing.sectionLede}>
							{t("editorHub.plugins.lede")}
						</p>
					</div>
					<div className={marketing.linkGrid}>
						{PLUGINS.map((item) => (
							<CapabilityCard
								key={item.titleKey}
								title={t(item.titleKey)}
								body={t(item.bodyKey)}
								path={t(item.pathKey)}
								href={item.href}
							/>
						))}
					</div>
				</div>
			</section>

			<SiteFooter />
		</main>
	);
}
