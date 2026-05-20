"use client";

import dynamic from "next/dynamic";

const CanvasStudio = dynamic(
	() => import("@anvilkit/canvas-editor").then((m) => m.CanvasStudio),
	{
		ssr: false,
		loading: () => (
			<div data-testid="canvas-studio-loading">Loading Canvas Studio…</div>
		),
	},
);

export function CanvasStudioClient({ pageId }: { pageId: string }) {
	return (
		<main
			style={{
				display: "flex",
				flexDirection: "column",
				gap: "1rem",
				padding: "1.5rem",
			}}
			data-testid="canvas-studio-mount"
		>
			<header>
				<h1 style={{ fontSize: "1.25rem", margin: 0 }}>
					Canvas Studio · page <code>{pageId}</code>
				</h1>
				<p style={{ color: "var(--demo-muted-text)", margin: "0.25rem 0 0" }}>
					MVP-1 placeholder. Tools, layers, persistence land in MVP-3 onward.
				</p>
			</header>
			<CanvasStudio pageId={pageId} />
		</main>
	);
}
