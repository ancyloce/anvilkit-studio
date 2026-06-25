import Link from "next/link";
import type { DemoMessageKey } from "../../lib/i18n/messages";
import { getServerT } from "../../lib/i18n/server";
import styles from "./site.module.css";
import { DOCS_URL, GITHUB_URL } from "./site-config";

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
				className={styles.footerLink}
			>
				{label}
			</a>
		);
	}
	return (
		<Link href={href} className={styles.footerLink}>
			{label}
		</Link>
	);
}

export async function SiteFooter() {
	const t = await getServerT();
	return (
		<footer className={`huly-root ${styles.footer}`}>
			<div className={styles.footerInner}>
				<div className={styles.footerBrandCol}>
					<span className={styles.brand}>AnvilKit</span>
					<p className={styles.footerTagline}>{t("footer.tagline")}</p>
				</div>
				<div className={styles.footerCols}>
					{FOOTER_COLUMNS.map((column) => (
						<div key={column.titleKey}>
							<p className={styles.footerColTitle}>{t(column.titleKey)}</p>
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
			<div className={styles.footerBottom}>{t("footer.bottom")}</div>
		</footer>
	);
}
