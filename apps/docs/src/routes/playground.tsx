import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import playgroundCss from "@/styles/playground.css?url";
import tokensCss from "@/styles/tokens.css?url";

// Puck reaches for `window` during setup and cannot be server-rendered, so the
// heavy island (Puck + all @anvilkit components/plugins + canvas-editor) is
// lazy-imported and gated behind a client mount — the TanStack Start
// equivalent of Astro's `client:only="react"`. The route module itself only
// statically imports CSS URLs + React, so the server build never evaluates Puck.
const Playground = lazy(() => import("@/components/playground"));

export const Route = createFileRoute("/playground")({
	// Window-only island: opt this route out of SSR entirely so Puck's module
	// graph (and @anvilkit/core's relative i18n JSON dynamic imports) is never
	// server-bundled — the TanStack Start equivalent of Astro `client:only`.
	ssr: false,
	head: () => ({
		meta: [{ title: "Playground · AnvilKit" }],
		links: [
			{ rel: "stylesheet", href: tokensCss },
			{ rel: "stylesheet", href: playgroundCss },
		],
	}),
	component: PlaygroundRoute,
});

function Loading() {
	return (
		<div style={{ padding: "2rem", textAlign: "center" }}>
			Loading playground…
		</div>
	);
}

function PlaygroundRoute() {
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);

	if (!mounted) return <Loading />;
	return (
		<Suspense fallback={<Loading />}>
			<Playground />
		</Suspense>
	);
}
