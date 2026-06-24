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
import { EditorMockup } from "./_site/EditorMockup";
import { MarketingMotion } from "./_site/MarketingMotion";
import { MiniEditor } from "./_site/MiniEditor";
import marketing from "./_site/marketing.module.css";
import { SiteFooter } from "./_site/SiteFooter";
import { DOCS_URL } from "./_site/site-config";

export const metadata: Metadata = {
	title: "AnvilKit — Puck-native component studio",
	description:
		"Independently publishable, Puck-native React component packages, composed into a real visual editor, canvas studio, AI copilot, and export pipeline.",
};

interface Feature {
	readonly icon: LucideIcon;
	readonly title: string;
	readonly body: string;
	readonly ember?: boolean;
}

const FEATURES: readonly Feature[] = [
	{
		icon: Blocks,
		title: "Puck-native",
		body: "Every package exports a Puck componentConfig — fields, defaultProps, render, metadata — so it drops straight into the editor.",
	},
	{
		icon: Package,
		title: "Independent packages",
		body: "No umbrella bundle. Install only the @anvilkit/* blocks you need; each is versioned and published on its own.",
		ember: true,
	},
	{
		icon: Sparkles,
		title: "AI Copilot",
		body: "Generate whole pages or regenerate a single section from a prompt, wired through the @anvilkit/plugin-ai-copilot pipeline.",
	},
	{
		icon: Users,
		title: "Real-time collaboration",
		body: "A one-line managed transport adds shared editing, live cursors, and presence over Yjs — no backend wiring required.",
		ember: true,
	},
	{
		icon: PenTool,
		title: "Canvas studio",
		body: "A Konva-powered free-form canvas with geometry, snapping, alignment, brand kits, and accessible keyboard tools.",
	},
	{
		icon: FileCode2,
		title: "Export pipeline",
		body: "Publish to a Headless Page IR, then export clean HTML, React/TSX, or JSON with resolved assets.",
		ember: true,
	},
	{
		icon: Palette,
		title: "Design system tokens",
		body: "Token-bound field renderers plus off-token and WCAG-AA contrast validators keep every page on-brand.",
	},
	{
		icon: Languages,
		title: "Built-in i18n",
		body: "Components and Studio ship en/zh/ja/ko catalogs with a config-centric locale switch baked into the shell.",
		ember: true,
	},
];

interface Step {
	readonly title: string;
	readonly body: string;
	readonly code: string;
}

const STEPS: readonly Step[] = [
	{
		title: "Install the packages",
		body: "Add the core runtime and just the blocks you want. Each is an independent @anvilkit/* package.",
		code: "pnpm add @anvilkit/core \\\n  @anvilkit/hero @anvilkit/navbar",
	},
	{
		title: "Compose a Puck config",
		body: "Each package exports a componentConfig. Assemble them into one consumer-owned Puck Config.",
		code: 'import { createHeroConfig } from "@anvilkit/hero";\n\nconst config = {\n  components: { Hero: createHeroConfig() },\n};',
	},
	{
		title: "Mount the Studio",
		body: "Render <Studio> from @anvilkit/core with your config and data. Plugins extend it without forking.",
		code: 'import { Studio } from "@anvilkit/core";\n\n<Studio puckConfig={config} data={data} />;',
	},
	{
		title: "Publish & export",
		body: "Publish to the Headless Page IR, then export production HTML, React, or JSON with resolved assets.",
		code: "// Publish → IR → export\nawait exportHtml(ir);\nawait exportReact(ir, { syntax: 'tsx' });",
	},
];

export default function Home() {
	return (
		<main className={`huly-root ${marketing.page}`}>
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
								className={`${marketing.tag} ${marketing.tagIris} ${marketing.eyebrow}`}
							>
								Anvilkit × Puck
							</span>
							<h1 className={marketing.heroTitle}>
								The Puck-native{" "}
								<span className={marketing.heroTitleAccent}>
									component studio
								</span>
							</h1>
							<p className={marketing.heroLede}>
								Independently publishable React components, composed into a real
								visual editor, a free-form canvas, an AI copilot, live
								collaboration, and a clean export pipeline.
							</p>
							<div className={marketing.heroActions}>
								<Link className={buttonVariants({ size: "lg" })} href="/editor">
									Open the editor
								</Link>
								<a
									className={buttonVariants({
										variant: "secondary",
										size: "lg",
									})}
									href="#demo"
								>
									See it in action →
								</a>
							</div>
							<div className={marketing.heroMeta}>
								<span>
									<strong>11+</strong> published blocks
								</span>
								<span>
									<strong>Puck</strong> headless builder
								</span>
								<span>
									<strong>HTML · React · JSON</strong> export
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
				className={`${marketing.bandDark} ${marketing.sectionPad}`}
			>
				<div className={marketing.container}>
					<div className={marketing.sectionHead}>
						<span
							className={`${marketing.tag} ${marketing.tagEmber} ${marketing.kicker}`}
						>
							Live preview
						</span>
						<h2 className={marketing.sectionTitle}>Edit props, render live</h2>
						<p className={marketing.sectionLede}>
							This is the editor's core loop in miniature: change a block's
							serializable props on the left and watch the render update on the
							right. The generated snippet is real, runnable usage.
						</p>
					</div>
					<MiniEditor />
				</div>
			</section>

			{/* Module 3 — Usage Guide (How to Use) */}
			<section className={`${marketing.bandLight} ${marketing.sectionPad}`}>
				<div className={marketing.container}>
					<div className={marketing.sectionHead}>
						<span
							className={`${marketing.tag} ${marketing.tagIris} ${marketing.kicker}`}
						>
							How to use
						</span>
						<h2 className={marketing.sectionTitle}>
							From install to published page
						</h2>
						<p className={marketing.sectionLede}>
							Four steps take you from an empty project to a published,
							exportable page built entirely from @anvilkit/* packages.
						</p>
					</div>
					<div className={marketing.steps}>
						{STEPS.map((step, index) => (
							<Card key={step.title} className="gap-3.5 p-6">
								<span className={marketing.stepNum}>{index + 1}</span>
								<h3 className={marketing.stepTitle}>{step.title}</h3>
								<p className={marketing.stepBody}>{step.body}</p>
								<pre className={marketing.codeBlock}>
									<code>{step.code}</code>
								</pre>
							</Card>
						))}
					</div>
				</div>
			</section>

			{/* Module 4 — Core Features List */}
			<section className={`${marketing.bandVoid} ${marketing.sectionPad}`}>
				<div className={marketing.container}>
					<div
						className={`${marketing.sectionHead} ${marketing.sectionHeadCenter}`}
					>
						<span
							className={`${marketing.tag} ${marketing.tagEmber} ${marketing.kicker}`}
						>
							Core features
						</span>
						<h2 className={marketing.sectionTitle}>
							Everything a page builder needs
						</h2>
						<p className={marketing.sectionLede}>
							The studio shell, plugins, and packages cover the full authoring
							lifecycle — editing, AI, collaboration, canvas, and export.
						</p>
					</div>
					<div className={marketing.featureGrid}>
						{FEATURES.map((feature) => {
							const Icon = feature.icon;
							return (
								<Card
									key={feature.title}
									className={cn("relative gap-3 p-6", marketing.cardGlow)}
								>
									<span
										className={`${marketing.featureIcon}${feature.ember ? ` ${marketing.featureIconEmber}` : ""}`}
									>
										<Icon size={20} strokeWidth={1.75} />
									</span>
									<h3 className={marketing.featureTitle}>{feature.title}</h3>
									<p className={marketing.featureBody}>{feature.body}</p>
								</Card>
							);
						})}
					</div>
				</div>
			</section>

			{/* Closing CTA */}
			<section className={`${marketing.bandDark} ${marketing.sectionPad}`}>
				<div className={marketing.container}>
					<div
						className={`${marketing.sectionHead} ${marketing.sectionHeadCenter}`}
					>
						<h2 className={marketing.sectionTitle}>Ready to build a page?</h2>
						<p className={marketing.sectionLede}>
							Jump into the editor hub for every interactive surface, or read
							the docs for the full package reference.
						</p>
					</div>
					<div
						className={marketing.heroActions}
						style={{ justifyContent: "center" }}
					>
						<Link className={buttonVariants({ size: "lg" })} href="/editor">
							Explore the editor
						</Link>
						<a
							className={buttonVariants({ variant: "outline", size: "lg" })}
							href={DOCS_URL}
							target="_blank"
							rel="noreferrer noopener"
						>
							Read the docs ↗
						</a>
					</div>
				</div>
			</section>

			<SiteFooter />
		</main>
	);
}
