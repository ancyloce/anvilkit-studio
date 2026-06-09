"use client";

import { createCollabPlugin } from "@anvilkit/collab-ui";
import { Studio } from "@anvilkit/core";
import { LanguageSwitcher } from "@anvilkit/core/i18n";
import type { Config, Data } from "@puckeditor/core";
import { useMemo, useState } from "react";

import { createDemoData, demoConfig } from "../../lib/puck-demo";

// The one value this demo sets: the WebSocket relay URL. Defaults to the local
// Hocuspocus dev relay (`pnpm --filter demo relay:hocuspocus`, port 31234).
// `createCollabPlugin`'s default `provider` is `"hocuspocus"`, so pointing it
// at the Hocuspocus relay needs nothing else.
const RELAY_URL =
	process.env.NEXT_PUBLIC_COLLAB_HOCUSPOCUS_URL ?? "ws://localhost:31234";

/**
 * Zero-config live collaboration demo — the managed-transport one-liner.
 *
 * `createCollabPlugin({ websocketUrl })` owns the ENTIRE transport: the
 * `Y.Doc`, the `Awareness` channel, the WebSocket provider, the
 * connection-status bridge, and teardown. `room` defaults to
 * `"anvilkit-default-room"`, `provider` to `"hocuspocus"`, and `self` to an
 * auto-generated anonymous identity, so the relay URL is genuinely the whole
 * recipe (see the docs "Realtime collaboration" guide, § 2). The factory also
 * publishes the local cursor by default (`presence.broadcastCursor`), so live
 * remote cursors work with no extra wiring.
 *
 * The richer host-driven experience — identity settings and a page-level
 * connection badge over a bring-your-own transport — lives on the
 * `/puck/editor?collab=1` route.
 */
export default function CollabDemoPage() {
	// Initial Puck document — stable for the lifetime of the page so a remount
	// doesn't reseed it. The CRDT is the source of truth once connected; this
	// only seeds a brand-new room (the first tab to join an empty room).
	const [seedData] = useState<Data>(() => createDemoData() as Data);

	// Built once so `<Studio>`'s compile effect doesn't re-fire (and tear down
	// the WebSocket) on every incidental re-render.
	const plugins = useMemo(
		() => [
			createCollabPlugin({
				websocketUrl: RELAY_URL,
				puckConfig: demoConfig as unknown as Config,
			}),
		],
		[],
	);

	// Locale switcher mounted into the chrome header via the `headerEnd` seam.
	// Memoized so the chrome-props context value stays stable across re-renders.
	const headerEnd = useMemo(() => <LanguageSwitcher />, []);

	return (
		<main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
			<header className="flex flex-col gap-3">
				<p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
					Anvilkit × Puck — Collaboration
				</p>
				<h1 className="text-2xl font-semibold">
					Live collaboration in one factory call
				</h1>
				<p className="max-w-3xl text-sm text-muted-foreground">
					This page wires realtime collaboration into{" "}
					<code>&lt;Studio&gt;</code> by setting a single value — the WebSocket
					relay URL — on <code>createCollabPlugin()</code> from{" "}
					<code>@anvilkit/collab-ui</code>. The plugin owns the whole transport
					(<code>Y.Doc</code>, <code>Awareness</code>, provider, status bridge,
					and teardown). Start the local Hocuspocus relay with{" "}
					<code>pnpm --filter demo relay:hocuspocus</code>, then open this page
					in a second tab to watch edits sync live, collaborators appear in the
					Studio header, and each peer&rsquo;s cursor moves in real time.
				</p>
			</header>

			<section className="min-h-[640px]" data-testid="ak-collab-studio">
				<Studio
					storeId="demo-collab"
					puckConfig={demoConfig as unknown as Config}
					data={seedData}
					plugins={plugins}
					chrome="anvilkit"
					headerEnd={headerEnd}
				/>
			</section>
		</main>
	);
}
