import { Link } from "@tanstack/react-router";
import { Card, Cards } from "fumadocs-ui/components/card";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import { getHomeMessages } from "@/lib/home-messages";
import { docSplat, localizedPath } from "@/lib/i18n";
import { baseOptions } from "@/lib/layout.shared";
import { gitConfig } from "@/lib/shared";

const COMPONENTS: Array<{ slug: string; pkg: string; blurb: string }> = [
	{
		slug: "bento-grid",
		pkg: "@anvilkit/bento-grid",
		blurb: "Responsive bento-style grid layout.",
	},
	{
		slug: "blog-list",
		pkg: "@anvilkit/blog-list",
		blurb: "Paginated blog post list.",
	},
	{
		slug: "button",
		pkg: "@anvilkit/button",
		blurb: "Primary, secondary, and ghost button variants.",
	},
	{
		slug: "helps",
		pkg: "@anvilkit/helps",
		blurb: "Help / FAQ accordion section.",
	},
	{
		slug: "hero",
		pkg: "@anvilkit/hero",
		blurb: "Configurable hero section with CTAs.",
	},
	{
		slug: "input",
		pkg: "@anvilkit/input",
		blurb: "Text input with label and validation.",
	},
	{
		slug: "logo-clouds",
		pkg: "@anvilkit/logo-clouds",
		blurb: "Customer / partner logo cloud.",
	},
	{
		slug: "navbar",
		pkg: "@anvilkit/navbar",
		blurb: "Responsive top navigation bar.",
	},
	{
		slug: "pricing-minimal",
		pkg: "@anvilkit/pricing-minimal",
		blurb: "Minimal three-tier pricing table.",
	},
	{
		slug: "section",
		pkg: "@anvilkit/section",
		blurb: "Generic content section wrapper.",
	},
	{
		slug: "statistics",
		pkg: "@anvilkit/statistics",
		blurb: "Metrics / stat highlight block.",
	},
];

const INSTALL = `pnpm add @anvilkit/core @anvilkit/ir \\
         @anvilkit/schema @anvilkit/validator \\
         @anvilkit/plugin-ai-copilot \\
         @anvilkit/plugin-asset-manager \\
         @anvilkit/plugin-export-html \\
         @anvilkit/plugin-export-react \\
         @anvilkit/plugin-version-history`;

// Marketing home, shared by the default-locale `/` route and the localized
// `/zh`, `/ja`, `/ko` home pages served through the docs splat. Prose comes from
// `getHomeMessages(locale)`; internal links are locale-prefixed via `docSplat` /
// `localizedPath` (playground + GitHub stay un-prefixed).
export function HomeContent({ locale }: { locale: string }) {
	const t = getHomeMessages(locale);

	return (
		<HomeLayout {...baseOptions()}>
			<main className="flex flex-1 flex-col">
				{/* Hero */}
				<section className="mx-auto w-full max-w-5xl px-4 py-16 text-center sm:py-24">
					<div className="mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-fd-muted-foreground">
						{t.badgeBefore}{" "}
						<strong className="text-fd-foreground">0.1.x</strong> {t.badgeAfter}
					</div>
					<h1 className="mb-4 text-4xl font-semibold tracking-tight sm:text-5xl">
						AnvilKit
					</h1>
					<p className="mx-auto mb-8 max-w-2xl text-lg text-fd-muted-foreground">
						{t.tagline}
					</p>
					<div className="flex flex-wrap items-center justify-center gap-3">
						<Link
							to="/$"
							params={{ _splat: docSplat(locale, "getting-started") }}
							className="rounded-lg bg-fd-primary px-5 py-2.5 text-sm font-medium text-fd-primary-foreground"
						>
							{t.quickstart}
						</Link>
						<a
							href="/playground"
							className="rounded-lg border px-5 py-2.5 text-sm font-medium hover:bg-fd-accent"
						>
							{t.openPlayground}
						</a>
						<a
							href={`https://github.com/${gitConfig.user}/${gitConfig.repo}`}
							className="rounded-lg px-5 py-2.5 text-sm font-medium text-fd-muted-foreground hover:text-fd-foreground"
						>
							{t.viewGithub}
						</a>
					</div>
				</section>

				{/* Install */}
				<section className="mx-auto w-full max-w-5xl px-4 pb-12">
					<h2 className="mb-3 text-xl font-semibold">{t.installHeading}</h2>
					<p className="mb-4 text-fd-muted-foreground">
						{t.installBodyBefore} <code>@anvilkit/plugin-*</code>{" "}
						{t.installBodyAfter}
					</p>
					<pre className="overflow-x-auto rounded-lg border bg-fd-card p-4 text-sm">
						<code>{INSTALL}</code>
					</pre>
					<p className="mt-4 text-fd-muted-foreground">
						{t.collabBefore}{" "}
						<Link
							to="/$"
							params={{ _splat: docSplat(locale, "guides/collaboration") }}
							className="text-fd-primary underline"
						>
							{t.collabLink}
						</Link>{" "}
						{t.collabAfter}
					</p>
				</section>

				{/* Component packages */}
				<section className="mx-auto w-full max-w-5xl px-4 pb-12">
					<h2 className="mb-1 text-xl font-semibold">{t.componentsHeading}</h2>
					<p className="mb-4 text-fd-muted-foreground">
						{t.componentsBodyBefore} <code>@anvilkit/*</code>{" "}
						{t.componentsBodyAfter}
					</p>
					<Cards>
						{COMPONENTS.map((c) => (
							<Card
								key={c.slug}
								title={c.pkg}
								href={localizedPath(locale, `components/${c.slug}`)}
								description={c.blurb}
							/>
						))}
					</Cards>
				</section>

				{/* Runtime & plugins */}
				<section className="mx-auto w-full max-w-5xl px-4 pb-24">
					<h2 className="mb-4 text-xl font-semibold">{t.runtimeHeading}</h2>
					<Cards>
						<Card
							title={t.studioTitle}
							href={localizedPath(locale, "api/core/functions/Studio")}
							description={t.studioDesc}
						/>
						<Card
							title={t.pluginTitle}
							href={localizedPath(locale, "guides/plugin-authoring")}
							description={t.pluginDesc}
						/>
					</Cards>
				</section>
			</main>
		</HomeLayout>
	);
}
