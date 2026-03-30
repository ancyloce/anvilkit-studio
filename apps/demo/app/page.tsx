import Link from "next/link";
import styles from "./page.module.css";

export default function Home() {
	return (
		<main className={styles.page}>
			<section className={styles.hero}>
				<p className={styles.eyebrow}>Anvilkit x Puck</p>
				<h1 className={styles.title}>
					Validate the shared navbar, hero, and logo cloud blocks in editor and
					render mode.
				</h1>
				<p className={styles.lede}>
					This demo app focuses on the two Puck surfaces that matter for package
					validation: the editor and the shared render view. Both use the same
					consumer-owned config with `@anvilkit/navbar` first, followed by
					`@anvilkit/hero` and `@anvilkit/logo-clouds`.
				</p>
				<div className={styles.actions}>
					<Link href="/puck/editor" className={styles.primary}>
						Open editor mode
					</Link>
					<Link href="/puck/render" className={styles.secondary}>
						Open render mode
					</Link>
				</div>
			</section>

			<section className={styles.grid}>
				<article className={styles.card}>
					<span className={styles.cardLabel}>Demo sequence</span>
					<h2>Shared content order</h2>
					<ul className={styles.list}>
						<li>
							`@anvilkit/navbar` renders first so navigation behavior is visible
							at the top of both demo surfaces.
						</li>
						<li>
							`@anvilkit/hero` follows immediately after and validates the
							marketing section beneath the nav.
						</li>
						<li>
							`@anvilkit/logo-clouds` closes the stack with the scrolling brand
							proof section shown in both demo surfaces.
						</li>
						<li>
							The Puck palette is intentionally trimmed to these three blocks.
						</li>
					</ul>
				</article>

				<article className={styles.card}>
					<span className={styles.cardLabel}>Available modes</span>
					<h2>Focused validation flow</h2>
					<p className={styles.cardBody}>
						Use editor mode to adjust data and publish snapshots, then check the
						same payload in render mode to confirm the shared config stays
						server-safe.
					</p>
					<code className={styles.command}>
						/puck/editor -&gt; /puck/render
					</code>
				</article>

				<article className={styles.card}>
					<span className={styles.cardLabel}>Compatibility notes</span>
					<h2>Puck-first contract</h2>
					<ul className={styles.list}>
						<li>
							Each package exports `componentConfig`, `defaultProps`, `fields`,
							and `metadata`, ready for both direct rendering and Puck usage.
						</li>
						<li>
							All editable props stay serializable so they can live inside Puck
							data.
						</li>
						<li>
							Interactive behavior is disabled in edit mode so the editor stays
							stable.
						</li>
					</ul>
				</article>
			</section>
		</main>
	);
}
