import Link from "next/link";
import type { ReactElement } from "react";

// Server-rendered index: zero client JS, so the route doubles as an SSR
// smoke surface for the app shell itself.
export default function HomePage(): ReactElement {
	return (
		<main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
			<h1>AnvilKit Playground</h1>
			<p>
				Minimal compatibility surface for the public
				<code> @anvilkit/* </code>
				packages. See <code>apps/playground/README.md</code>.
			</p>
			<ul>
				<li>
					<Link href="/editor">/editor</Link> — client-mounted
					<code> &lt;Studio&gt; </code>
					with the smallest viable Puck config
				</li>
				<li>
					<Link href="/render">/render</Link> — server-side
					<code> &lt;Render&gt; </code>
					over the same config and data
				</li>
			</ul>
		</main>
	);
}
