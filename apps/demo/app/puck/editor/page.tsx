"use client";

import { Studio } from "@anvilkit/core";
import type { Data } from "@puckeditor/core";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
	createDemoData,
	createDemoModeHref,
	type DemoComponents,
	demoConfig,
	demoDataSearchParam,
	getDemoDataFromSearchParam,
} from "../../../lib/puck-demo";
import { smokeTestPlugin } from "../../../lib/smoke-test-plugin";
import styles from "../puck.module.css";

function PuckEditorContent() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const incomingData = searchParams.get(demoDataSearchParam);
	const [publishedData, setPublishedData] = useState<Data<DemoComponents>>(() =>
		createDemoData(),
	);
	const renderHref = createDemoModeHref("/puck/render", publishedData);

	useEffect(() => {
		setPublishedData(getDemoDataFromSearchParam(incomingData));
	}, [incomingData]);

	function handlePublish(nextPublishedData: Data) {
		// `<Studio>` narrows its callback to Puck's default `Data` type.
		// The demo knows the shape is `Data<DemoComponents>` because
		// `demoConfig` is the source of truth; assert through `unknown`
		// so the editor state stays strongly typed without forking the
		// public Studio surface.
		const typedData = nextPublishedData as unknown as Data<DemoComponents>;
		setPublishedData(typedData);
		router.push(createDemoModeHref("/puck/render", typedData));
		console.log("[demo] publish", typedData);
	}

	return (
		<main className={styles.shell}>
			<section className={styles.masthead}>
				<div>
					<p className={styles.eyebrow}>Editor Validation</p>
					<h1 className={styles.title}>
						Puck editor mode for the shared navbar, hero, pricing, Bento Grid,
						section, statistics, blog list, helps, and logo cloud demo.
					</h1>
					<p className={styles.lede}>
						This route mounts {"`<Studio>`"} from `@anvilkit/core` with the
						same consumer-owned Puck `Config` used by render mode. The demo
						`smokeTestPlugin` logs every lifecycle event so you can verify the
						plugin pipeline end-to-end from the browser console.
					</p>
				</div>
				<div className={styles.actions}>
					<Link href="/" className={styles.secondaryAction}>
						Back to demo hub
					</Link>
					<Link href={renderHref} className={styles.primaryAction}>
						Open render mode
					</Link>
				</div>
			</section>

			<section className={styles.panel}>
				<Studio
					puckConfig={demoConfig}
					data={publishedData}
					plugins={[smokeTestPlugin]}
					onPublish={handlePublish}
				/>
			</section>

			<section className={styles.snapshot}>
				<div className={styles.snapshotHeader}>
					<h2>Published data snapshot</h2>
					<p>
						The editor keeps its own draft state; this snapshot updates when you
						publish.
					</p>
				</div>
				<pre className={styles.codeBlock}>
					{JSON.stringify(publishedData, null, 2)}
				</pre>
			</section>
		</main>
	);
}

export default function PuckEditorPage() {
	return (
		<Suspense
			fallback={
				<main className={styles.shell}>
					<section className={styles.masthead}>
						<div>
							<p className={styles.eyebrow}>Editor Validation</p>
							<h1 className={styles.title}>Loading Puck editor...</h1>
							<p className={styles.lede}>
								Preparing the shared navbar, hero, pricing, Bento Grid, section,
								statistics, blog list, helps, and logo cloud demo payload.
							</p>
						</div>
						<div className={styles.actions}>
							<Link href="/" className={styles.secondaryAction}>
								Back to demo hub
							</Link>
						</div>
					</section>
				</main>
			}
		>
			<PuckEditorContent />
		</Suspense>
	);
}
