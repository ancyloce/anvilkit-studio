import { buttonVariants } from "@anvilkit/ui/button";
import { Card } from "@anvilkit/ui/card";
import { cn } from "@anvilkit/ui/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";
import { MarketingMotion } from "../_site/MarketingMotion";
import marketing from "../_site/marketing.module.css";
import { SiteFooter } from "../_site/SiteFooter";

export const metadata: Metadata = {
	title: "Editor — AnvilKit",
	description:
		"Every interactive surface of the AnvilKit editor in one place: the visual builder, server render, canvas studio, live collaboration, AI copilot, and the export pipeline.",
};

interface Capability {
	readonly title: string;
	readonly body: string;
	readonly href: string;
	readonly path: string;
}

/** Editor surfaces that are their own routes. */
const SURFACES: readonly Capability[] = [
	{
		title: "Visual editor",
		body: "The full Studio shell — drag blocks in, edit their props in the inspector, manage pages, and publish.",
		href: "/puck/editor",
		path: "/puck/editor",
	},
	{
		title: "Server render",
		body: "The RSC-safe read view of the same Puck payload, shipping zero editor JavaScript to the client.",
		href: "/puck/render",
		path: "/puck/render",
	},
	{
		title: "Canvas studio",
		body: "A free-form Konva canvas: shapes, snapping, alignment, brand kits, and accessible keyboard tools.",
		href: "/studio/canvas/home",
		path: "/studio/canvas/[id]",
	},
	{
		title: "Live collaboration",
		body: "Shared editing with live remote cursors and presence over Yjs — the managed-transport one-liner.",
		href: "/collab",
		path: "/collab",
	},
	{
		title: "Navbar playground",
		body: "Tune the @anvilkit/navbar props live — logo modes, links, CTA variants — and copy the generated JSX.",
		href: "/navbar",
		path: "/navbar",
	},
	{
		title: "Hero playground",
		body: "Render the @anvilkit/hero package with its real exported defaults and styles.",
		href: "/hero",
		path: "/hero",
	},
];

/** Plugins exercised from inside the visual editor. */
const PLUGINS: readonly Capability[] = [
	{
		title: "AI Copilot",
		body: "Generate a whole page or regenerate a single section from a prompt. Open the AI Copilot tab in the left rail.",
		href: "/puck/editor",
		path: "left rail · AI Copilot",
	},
	{
		title: "Export pipeline",
		body: "Publish to the Headless Page IR, then download production HTML, React/TSX, or JSON with resolved assets.",
		href: "/puck/editor",
		path: "header · Export",
	},
	{
		title: "Asset manager",
		body: "Upload images, browse folders, and (with a key) pull from Unsplash — all resolvable at export time.",
		href: "/puck/editor",
		path: "left rail · Assets",
	},
	{
		title: "Version history",
		body: "Snapshot the document as you edit and restore any earlier state from the history panel.",
		href: "/puck/editor",
		path: "left rail · History",
	},
	{
		title: "Design system",
		body: "Token-bound field renderers with off-token and WCAG-AA contrast validators keep pages on-brand.",
		href: "/puck/editor",
		path: "left rail · Design System",
	},
	{
		title: "Page SEO",
		body: "Edit canonical URL, Open Graph image, description, and robots directives on the page model.",
		href: "/puck/editor",
		path: "left rail · SEO",
	},
];

function CapabilityCard({ item }: { item: Capability }) {
	return (
		<Link href={item.href} className="block">
			<Card
				className={cn(
					"relative h-full gap-2.5 p-[22px] hover:ring-[color:var(--huly-electric-iris)]",
					marketing.linkCardInteractive,
				)}
			>
				<div className={marketing.linkCardHead}>
					<h3 className={marketing.linkCardTitle}>{item.title}</h3>
					<span className={marketing.linkCardArrow} aria-hidden="true">
						→
					</span>
				</div>
				<p className={marketing.linkCardBody}>{item.body}</p>
				<span className={marketing.linkCardPath}>{item.path}</span>
			</Card>
		</Link>
	);
}

export default function EditorHubPage() {
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
								The editor
							</span>
							<h1 className={marketing.heroTitle}>
								Every editor surface, in one place
							</h1>
							<p className={marketing.heroLede}>
								The visual builder, server render, canvas studio, live
								collaboration, the AI copilot, and the export pipeline — each
								wired to the same consumer-owned Puck config. Try the live
								editor below, then dive into any surface.
							</p>
							<div className={marketing.heroActions}>
								<Link
									className={buttonVariants({ size: "lg" })}
									href="/puck/editor"
								>
									Open the visual editor
								</Link>
								<Link
									className={buttonVariants({
										variant: "secondary",
										size: "lg",
									})}
									href="/puck/render"
								>
									View server render →
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
							Embedded demo
						</span>
						<h2 className={marketing.sectionTitle}>
							The real editor, right here
						</h2>
						<p className={marketing.sectionLede}>
							This is a live, embedded instance of the Studio editor — the same
							route as <code>/puck/editor</code>. Drag blocks, edit props, and
							open the left-rail plugins. It loads lazily to keep this page
							fast.
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
							title="AnvilKit visual editor"
							loading="lazy"
						/>
					</div>
					<div className={marketing.heroActions} style={{ marginTop: 18 }}>
						<Link
							className={buttonVariants({ variant: "outline" })}
							href="/puck/editor"
						>
							Open in full page →
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
							Surfaces
						</span>
						<h2 className={marketing.sectionTitle}>Routes you can open now</h2>
						<p className={marketing.sectionLede}>
							Each surface renders the same shared component config from a
							different angle.
						</p>
					</div>
					<div className={marketing.linkGrid}>
						{SURFACES.map((item) => (
							<CapabilityCard key={item.title} item={item} />
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
							Inside the editor
						</span>
						<h2 className={marketing.sectionTitle}>
							Plugins that extend the Studio
						</h2>
						<p className={marketing.sectionLede}>
							These ship as @anvilkit plugins and are wired into the demo
							editor. Open the visual editor and find each in the header or left
							rail.
						</p>
					</div>
					<div className={marketing.linkGrid}>
						{PLUGINS.map((item) => (
							<CapabilityCard key={item.title} item={item} />
						))}
					</div>
				</div>
			</section>

			<SiteFooter />
		</main>
	);
}
