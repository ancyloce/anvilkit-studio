import Link from "next/link";
import styles from "./site.module.css";
import { DOCS_URL, GITHUB_URL } from "./site-config";

interface FooterLink {
	readonly label: string;
	readonly href: string;
	readonly external?: boolean;
}

const FOOTER_COLUMNS: ReadonlyArray<{
	readonly title: string;
	readonly links: readonly FooterLink[];
}> = [
	{
		title: "Editor",
		links: [
			{ label: "Visual editor", href: "/puck/editor" },
			{ label: "Server render", href: "/puck/render" },
			{ label: "Canvas studio", href: "/studio/canvas/home" },
			{ label: "Collaboration", href: "/collab" },
		],
	},
	{
		title: "Components",
		links: [
			{ label: "Editor hub", href: "/editor" },
			{ label: "Hero playground", href: "/hero" },
			{ label: "Navbar playground", href: "/navbar" },
		],
	},
	{
		title: "Resources",
		links: [
			{ label: "Documentation", href: DOCS_URL, external: true },
			{ label: "GitHub", href: GITHUB_URL, external: true },
			{ label: "About", href: "/about" },
		],
	},
];

function FooterEntry({ link }: { link: FooterLink }) {
	if (link.external) {
		return (
			<a
				href={link.href}
				target="_blank"
				rel="noreferrer noopener"
				className={styles.footerLink}
			>
				{link.label}
			</a>
		);
	}
	return (
		<Link href={link.href} className={styles.footerLink}>
			{link.label}
		</Link>
	);
}

export function SiteFooter() {
	return (
		<footer className={`huly-root ${styles.footer}`}>
			<div className={styles.footerInner}>
				<div className={styles.footerBrandCol}>
					<span className={styles.brand}>AnvilKit</span>
					<p className={styles.footerTagline}>
						Independently publishable, Puck-native React component packages —
						composed into a real visual editor, canvas studio, and export
						pipeline. This demo validates every package end to end.
					</p>
				</div>
				<div className={styles.footerCols}>
					{FOOTER_COLUMNS.map((column) => (
						<div key={column.title}>
							<p className={styles.footerColTitle}>{column.title}</p>
							{column.links.map((link) => (
								<FooterEntry key={link.label} link={link} />
							))}
						</div>
					))}
				</div>
			</div>
			<div className={styles.footerBottom}>
				Built with Next.js, Puck, and the @anvilkit/* packages · Styled after
				the DESIGN.md reference.
			</div>
		</footer>
	);
}
