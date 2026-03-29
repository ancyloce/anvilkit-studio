import { Render } from "@puckeditor/core/rsc";
import Link from "next/link";
import { createDemoData, demoConfig } from "../../../lib/puck-demo";
import styles from "../puck.module.css";

export default function PuckRenderPage() {
	return (
		<main className={styles.shell}>
			<section className={styles.masthead}>
				<div>
					<p className={styles.eyebrow}>Render Validation</p>
					<h1 className={styles.title}>
						Server-safe rendering with the same component config.
					</h1>
					<p className={styles.lede}>
						This route renders the shared demo data with `Render` from
						`@puckeditor/core/rsc`, using the same package-level component
						configs as the editor view, including the new hero and navbar
						packages.
					</p>
				</div>
				<div className={styles.actions}>
					<Link href="/" className={styles.secondaryAction}>
						Back to demo hub
					</Link>
					<Link href="/hero" className={styles.secondaryAction}>
						Open hero demo
					</Link>
					<Link href="/navbar" className={styles.secondaryAction}>
						Open navbar demo
					</Link>
					<Link href="/puck/editor" className={styles.primaryAction}>
						Open editor surface
					</Link>
				</div>
			</section>

			<section className={styles.renderFrame}>
				<div className={styles.renderNote}>
					<span>Shared config</span>
					<span>RSC-friendly components</span>
					<span>No client-only hooks required</span>
				</div>
				<div className={styles.renderCanvas}>
					<Render config={demoConfig} data={createDemoData()} />
				</div>
			</section>
		</main>
	);
}
