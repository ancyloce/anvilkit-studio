import { Hero, defaultProps as heroDefaultProps } from "@anvilkit/hero";
import type { Metadata } from "next";
import Link from "next/link";
import styles from "./page.module.css";

export const metadata: Metadata = {
	title: "Hero Demo | Anvilkit Components Demo",
	description: "Reference-driven demo surface for the @anvilkit/hero package.",
};

const heroSnippet = `import { Hero, defaultProps } from "@anvilkit/hero";

export function MarketingHero() {
	return <Hero {...defaultProps} />;
}`;

export default function HeroDemoPage() {
	return (
		<main className={styles.page}>
			<section className={styles.preview}>
				<div className={styles.heroFrame}>
					<Hero {...heroDefaultProps} />
				</div>
			</section>

			<section className={styles.content}>
				<div className={styles.header}>
					<div>
						<p className={styles.eyebrow}>Marketing Surface</p>
						<h1 className={styles.title}>
							Hero package demo with the real exported defaults.
						</h1>
						<p className={styles.lede}>
							This route renders `@anvilkit/hero` directly, using the same
							default props and styles that the package exposes to consumers and
							to the Puck demo config.
						</p>
					</div>

					<div className={styles.actions}>
						<Link href="/" className={styles.secondaryAction}>
							Back to demo hub
						</Link>
						<Link href="/puck/editor" className={styles.secondaryAction}>
							Open Puck editor
						</Link>
						<Link href="/puck/render" className={styles.primaryAction}>
							Open render surface
						</Link>
					</div>
				</div>

				<div className={styles.grid}>
					<article className={styles.card}>
						<span className={styles.cardLabel}>Package contract</span>
						<h2>What this validates</h2>
						<ul className={styles.list}>
							<li>
								The announcement pill uses `RainbowButton` from `@anvilkit/ui`.
							</li>
							<li>Both download CTAs use the shared `Button` primitive.</li>
							<li>
								The demo route consumes the published package surface, not local
								mock markup.
							</li>
							<li>
								Edit-mode-safe behavior is preserved in the shared Puck config.
							</li>
						</ul>
					</article>

					<article className={styles.card}>
						<span className={styles.cardLabel}>Usage</span>
						<h2>Import from the package</h2>
						<pre className={styles.codeBlock}>{heroSnippet}</pre>
					</article>
				</div>
			</section>
		</main>
	);
}
