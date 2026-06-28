"use client";

import { createConsoleAdapter } from "@anvilkit/analytics-core";
import { createCollabPlugin } from "@anvilkit/collab-ui";
import { Studio } from "@anvilkit/core";
import type { Config, Data } from "@puckeditor/core";
import { useCallback, useEffect, useMemo, useState } from "react";

import { resolveCollabRelayUrl } from "@/lib/collab-relay-url";
import { createDemoConfig, createDemoData, demoConfig } from "@/lib/puck-demo";
import { readPersistedStudioLocale } from "@/lib/studio-locale";

// Studio config: mounts the built-in header LanguageSwitcher via
// `i18n.showLocaleSwitch` (replacing the old `headerEnd` wiring). No
// `i18n.locale`, so the mount stays uncontrolled (persisted per
// `storeId`). Module scope keeps the reference stable — and because the
// `i18n` block is excluded from the plugin-compile fingerprint, flipping
// it would not tear down the collab WebSocket either way.
const collabStudioConfig = {
	i18n: { showLocaleSwitch: true },
};

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

	// Resolve the browser-reachable relay URL at RUNTIME, then build the collab
	// plugin once. `/api/collab/config` serves `COLLAB_HOCUSPOCUS_URL` when an
	// operator pins it; otherwise the client derives `ws(s)://<current-host>:31234`
	// from the page it loaded (see `resolveCollabRelayUrl`). This replaces the old
	// build-time `NEXT_PUBLIC_COLLAB_HOCUSPOCUS_URL` constant, which froze the URL
	// to `localhost` in the prebuilt image and broke collab on any real server.
	//
	// Built once (null → array) so `<Studio>`'s compile effect doesn't re-fire
	// (and tear down the WebSocket) on every incidental re-render. The plugin
	// keeps the stable English `demoConfig` (its internals don't render field
	// labels); only the `puckConfig` handed to <Studio> below is locale-aware.
	const [plugins, setPlugins] = useState<
		ReturnType<typeof createCollabPlugin>[] | null
	>(null);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			let configured: string | null = null;
			try {
				const res = await fetch("/api/collab/config");
				const cfg = (await res.json()) as { wsUrl?: string | null };
				configured = cfg.wsUrl ?? null;
			} catch {
				// Network/route failure → fall back to the window-derived default.
			}
			if (cancelled) return;
			setPlugins([
				createCollabPlugin({
					websocketUrl: resolveCollabRelayUrl(configured),
					puckConfig: demoConfig as unknown as Config,
				}),
			]);
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	// Host-side mirror of the UNCONTROLLED locale store (see /puck/editor for
	// the long-form rationale): seed from the persisted value on mount, track
	// switches via onLocaleChange, rebuild the Puck config per locale so
	// component field labels follow the chrome. Note a locale switch rotates
	// the compile key, which re-registers the collab plugin — the transport
	// reconnects and re-syncs from the CRDT (the room stays source of truth).
	const [studioLocale, setStudioLocale] = useState("en");

	useEffect(() => {
		setStudioLocale(readPersistedStudioLocale("demo-collab"));
	}, []);

	const localizedConfig = useMemo(
		() => (studioLocale === "en" ? demoConfig : createDemoConfig(studioLocale)),
		[studioLocale],
	);

	const handleLocaleChange = useCallback((locale: string) => {
		setStudioLocale(locale);
	}, []);

	// F9: editor-side analytics (collab path). Same console adapter as the
	// default editor mount so the system events are visible here too.
	const analyticsAdapter = useMemo(
		() => createConsoleAdapter({ source: "studio" }),
		[],
	);

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
					puckConfig={localizedConfig as unknown as Config}
					data={seedData}
					plugins={plugins ?? undefined}
					chrome="anvilkit"
					config={collabStudioConfig}
					onLocaleChange={handleLocaleChange}
					analytics={analyticsAdapter}
				/>
			</section>
		</main>
	);
}
