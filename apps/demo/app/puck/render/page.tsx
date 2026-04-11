// The render path deliberately keeps `<Render>` from `@puckeditor/core/rsc`
// instead of importing `<Studio>` from `@anvilkit/core`. Three reasons:
//
//   1. `<Studio>` is the *editor* shell — it mounts `<Puck>`, runs the
//      plugin compile + lifecycle pipeline, and is `"use client"`. The
//      render route is a React Server Component and never needs any of
//      that machinery.
//   2. `@puckeditor/core/rsc` is the RSC-safe entry point for `Render`
//      so page rendering stays on the server and ships zero editor
//      JavaScript to the client.
//   3. Plugin lifecycle hooks (`onInit`, `onDataChange`, publish veto)
//      have no meaning on the read path — there is no editing session
//      to observe.
//
// See `docs/tasks/core-016-demo-migration.md` — implementation notes.
import { Render } from "@puckeditor/core/rsc";
import Link from "next/link";
import {
	createDemoModeHref,
	demoConfig,
	demoDataSearchParam,
	getDemoDataFromSearchParam,
} from "../../../lib/puck-demo";
import styles from "../puck.module.css";

interface PuckRenderPageProps {
	searchParams?:
		| Promise<Record<string, string | string[] | undefined>>
		| Record<string, string | string[] | undefined>;
}

export default async function PuckRenderPage({
	searchParams,
}: PuckRenderPageProps) {
	const resolvedSearchParams = searchParams ? await searchParams : undefined;
	const renderData = getDemoDataFromSearchParam(
		resolvedSearchParams?.[demoDataSearchParam],
	);
	const editorHref = createDemoModeHref("/puck/editor", renderData);

	return (
		<main className={styles.shell}>
			<section className={styles.masthead}>
				<div>
					<p className={styles.eyebrow}>Render Validation</p>
					<h1 className={styles.title}>
						Render mode for the same shared nine-block demo payload.
					</h1>
					<p className={styles.lede}>
						This route renders the shared demo data with `Render` from
						`@puckeditor/core/rsc`, using the same package-level component
						configs as the editor view for `@anvilkit/navbar`, `@anvilkit/hero`,
						`@anvilkit/pricing-minimal`, `@anvilkit/bento-grid`,
						`@anvilkit/section`, `@anvilkit/statistics`, `@anvilkit/blog-list`,
						`@anvilkit/helps`, and `@anvilkit/logo-clouds`.
					</p>
				</div>
				<div className={styles.actions}>
					<Link href="/" className={styles.secondaryAction}>
						Back to demo hub
					</Link>
					<Link href={editorHref} className={styles.primaryAction}>
						Open editor mode
					</Link>
				</div>
			</section>

			<section className={styles.renderFrame}>
				<div className={styles.renderNote}>
					<span>Shared config</span>
					<span>RSC-friendly components</span>
					<span>Nine publishable package blocks</span>
				</div>
				<div className={styles.renderCanvas}>
					<Render config={demoConfig} data={renderData} />
				</div>
			</section>
		</main>
	);
}
