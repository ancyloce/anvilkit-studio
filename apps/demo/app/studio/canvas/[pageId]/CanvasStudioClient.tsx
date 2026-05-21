"use client";

import {
	type CanvasIR,
	createCanvasIR,
	createPage,
} from "@anvilkit/canvas-core";
import {
	type CanvasPersistenceAdapter,
	localStorageCanvasAdapter,
} from "@anvilkit/plugin-canvas-studio";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

const CanvasStudio = dynamic(
	() => import("@anvilkit/canvas-editor").then((m) => m.CanvasStudio),
	{
		ssr: false,
		loading: () => (
			<div data-testid="canvas-studio-loading">Loading Canvas Studio…</div>
		),
	},
);

function makeBlankIR(pageId: string): CanvasIR {
	return createCanvasIR({
		id: pageId,
		title: pageId,
		pages: [createPage({ id: pageId, name: pageId })],
	});
}

// SSR-safe fallback. The real adapter requires `globalThis.localStorage`,
// which is only available client-side; before hydration this no-op keeps
// the constructor pure so the page can still render the loading state.
const noopAdapter: CanvasPersistenceAdapter = {
	save: () => undefined,
	load: () => null,
	list: () => [],
	delete: () => undefined,
};

export function CanvasStudioClient({ pageId }: { pageId: string }) {
	const adapter = useMemo<CanvasPersistenceAdapter>(
		() =>
			typeof globalThis.localStorage === "undefined"
				? noopAdapter
				: localStorageCanvasAdapter({ namespace: "demo-canvas" }),
		[],
	);
	const [initialIR, setInitialIR] = useState<CanvasIR | null>(null);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			const stored = await Promise.resolve(adapter.load(pageId));
			if (cancelled) return;
			setInitialIR(stored ?? makeBlankIR(pageId));
		})();
		return () => {
			cancelled = true;
		};
	}, [adapter, pageId]);

	if (!initialIR) {
		return (
			<main
				data-testid="canvas-studio-mount-loading"
				style={{ padding: "1.5rem" }}
			>
				Loading design…
			</main>
		);
	}

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
					Edits autosave to <code>localStorage</code> under the{" "}
					<code>demo-canvas</code> namespace.
				</p>
			</header>
			<CanvasStudio
				initialIR={initialIR}
				initialActivePageId={pageId}
				onChange={(ir) => {
					adapter.save(pageId, ir);
				}}
			/>
		</main>
	);
}
