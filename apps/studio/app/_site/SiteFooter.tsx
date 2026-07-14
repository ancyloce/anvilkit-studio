import Link from "next/link";
import type { DemoMessageKey } from "@/lib/i18n/messages";
import { getServerT } from "@/lib/i18n/server";
import { BRAND_CLASS, DOCS_URL, GITHUB_URL, HULY_ROOT } from "./site-config";

const FOOTER = `${HULY_ROOT} bg-card border-t border-border text-muted-foreground`;

const FOOTER_INNER =
	"grid grid-cols-1 gap-10 max-w-huly mx-auto pt-14 px-6 pb-10 min-[720px]:grid-cols-[1.4fr_1fr]";

const FOOTER_BRAND_COL = "max-w-[26rem]";

const FOOTER_TAGLINE = "mt-3.5 text-muted-foreground text-[14px] leading-[1.6]";

const FOOTER_COLS = "grid grid-cols-2 gap-8 min-[720px]:grid-cols-3";

const FOOTER_COL_TITLE =
	"text-foreground text-[12px] font-semibold tracking-[0.14em] uppercase mb-3.5";

const FOOTER_LINK =
	"block text-muted-foreground text-[14px] py-[5px] transition-colors duration-[140ms] ease-[ease] hover:text-foreground";

const FOOTER_BOTTOM =
	"max-w-huly mx-auto pt-5 px-6 pb-10 border-t border-[color-mix(in_srgb,var(--border)_70%,transparent)] text-muted-foreground text-[12px]";

interface FooterLink {
	readonly labelKey: DemoMessageKey;
	readonly href: string;
	readonly external?: boolean;
}

const FOOTER_COLUMNS: ReadonlyArray<{
	readonly titleKey: DemoMessageKey;
	readonly links: readonly FooterLink[];
}> = [
	{
		titleKey: "footer.col.editor",
		links: [
			{ labelKey: "footer.link.visualEditor", href: "/puck/editor" },
			{ labelKey: "footer.link.serverRender", href: "/puck/render" },
			{ labelKey: "footer.link.canvasStudio", href: "/studio/canvas/home" },
			{ labelKey: "footer.link.collaboration", href: "/collab" },
		],
	},
	{
		titleKey: "footer.col.components",
		links: [
			{ labelKey: "footer.link.editorHub", href: "/editor" },
			{ labelKey: "footer.link.heroPlayground", href: "/hero" },
			{ labelKey: "footer.link.navbarPlayground", href: "/navbar" },
		],
	},
	{
		titleKey: "footer.col.resources",
		links: [
			{ labelKey: "footer.link.documentation", href: DOCS_URL, external: true },
			{ labelKey: "footer.link.github", href: GITHUB_URL, external: true },
			{ labelKey: "footer.link.about", href: "/about" },
		],
	},
];

function FooterEntry({
	href,
	external,
	label,
}: {
	href: string;
	external?: boolean;
	label: string;
}) {
	if (external) {
		return (
			<a
				href={href}
				target="_blank"
				rel="noreferrer noopener"
				className={FOOTER_LINK}
			>
				{label}
			</a>
		);
	}
	return (
		<Link href={href} className={FOOTER_LINK}>
			{label}
		</Link>
	);
}

export async function SiteFooter() {
	const t = await getServerT();
	return (
		<footer className={FOOTER}>
			<div className={FOOTER_INNER}>
				<div className={FOOTER_BRAND_COL}>
					<span className={BRAND_CLASS}>AnvilKit</span>
					<p className={FOOTER_TAGLINE}>{t("footer.tagline")}</p>
				</div>
				<div className={FOOTER_COLS}>
					{FOOTER_COLUMNS.map((column) => (
						<div key={column.titleKey}>
							<p className={FOOTER_COL_TITLE}>{t(column.titleKey)}</p>
							{column.links.map((link) => (
								<FooterEntry
									key={link.href}
									href={link.href}
									external={link.external}
									label={t(link.labelKey)}
								/>
							))}
						</div>
					))}
				</div>
			</div>
			<div className={FOOTER_BOTTOM}>{t("footer.bottom")}</div>
		</footer>
	);
}
