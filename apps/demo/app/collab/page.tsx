"use client";

import type { StudioPlugin } from "@anvilkit/core";
import { Studio } from "@anvilkit/core";
import type { ConnectionStatus } from "@anvilkit/plugin-collab-yjs";
import type { Config, Data } from "@puckeditor/core";
import { useEffect, useMemo, useState } from "react";

import { useDemoIdentity } from "../../lib/collab-identity";
import {
	type CollabTransportBundle,
	createCollabHocuspocusTransport,
} from "../../lib/collab-transport";
import { createDemoData, demoConfig } from "../../lib/puck-demo";

// Defaults to the local Hocuspocus dev relay (`pnpm --filter demo
// relay:hocuspocus`, port 31234). NOT 21234 — that's the y-websocket
// reference relay, whose protocol a HocuspocusProvider can't speak.
const DEFAULT_RELAY_URL =
	process.env.NEXT_PUBLIC_COLLAB_HOCUSPOCUS_URL ?? "ws://localhost:31234";
const DEFAULT_ROOM = "demo-room";

interface CollabQuery {
	readonly room: string;
	readonly url: string;
	readonly token: string;
	readonly peer: string | null;
}

/**
 * Live collaboration demo for {@link createCollabHocuspocusTransport} —
 * the client side of docs Path C (Hocuspocus relay).
 *
 * The host owns the `Y.Doc` / `Awareness` / `HocuspocusProvider`; the
 * consolidated `createCollabPlugin()` factory builds the adapter and
 * wires it into `<Studio>`. `createCollabStudioPlugin()` adds presence
 * broadcasting and is registered *after* the consolidated plugin so it
 * can read the adapter from the `<CollabUIProvider>` context.
 *
 * Query params:
 * - `?room=` — collaboration room id (default `demo-room`)
 * - `?url=`  — Hocuspocus WebSocket URL (default `NEXT_PUBLIC_COLLAB_HOCUSPOCUS_URL`
 *              or `ws://localhost:1234`)
 * - `?token=`— auth token forwarded to the relay's `onAuthenticate`
 * - `?peer=` — one-shot display-name override for two-tab testing
 */
export default function CollabDemoPage() {
	const [query, setQuery] = useState<CollabQuery | null>(null);

	// Parse query params on the client (SSR has no `window.location`).
	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const peer = params.get("peer");
		setQuery({
			room: params.get("room") || DEFAULT_ROOM,
			url: params.get("url") || DEFAULT_RELAY_URL,
			token: params.get("token") ?? "",
			peer: peer && peer.length > 0 ? peer : null,
		});
	}, []);

	const queryReady = query !== null;
	const {
		identity,
		ready: identityReady,
		setDisplayName,
	} = useDemoIdentity({
		enabled: queryReady,
		peerOverride: query?.peer ?? null,
	});

	// Initial Puck document — stable for the lifetime of the page so a
	// remount doesn't reseed it (the CRDT is the source of truth once
	// connected; this only seeds a brand-new room).
	const [seedData] = useState<Data>(() => createDemoData() as Data);

	// Host-owned transport. Built once identity + query resolve; torn
	// down (WebSocket close, awareness + doc destroy) on dep change or
	// unmount. The `cancelled`/`resolved` guards drop a late async
	// resolve and cover React StrictMode's dev double-invoke.
	const [transport, setTransport] = useState<CollabTransportBundle | null>(
		null,
	);

	useEffect(() => {
		if (!queryReady || !identityReady || !query) {
			setTransport(null);
			return;
		}
		let cancelled = false;
		let resolved: CollabTransportBundle | null = null;
		void createCollabHocuspocusTransport({
			room: query.room,
			url: query.url,
			token: query.token,
		}).then((bundle) => {
			if (cancelled) {
				bundle.destroy();
				return;
			}
			resolved = bundle;
			setTransport(bundle);
		});
		return () => {
			cancelled = true;
			resolved?.destroy();
			setTransport(null);
		};
	}, [queryReady, identityReady, query]);

	// Live connection status for the page's badge.
	const [status, setStatus] = useState<ConnectionStatus>({
		kind: "connecting",
	});

	// Collab plugins live in the yjs stack, which we dynamic-import so it
	// stays out of routes that don't collaborate. Resolved into state and
	// guarded against late resolves just like the transport.
	const [plugins, setPlugins] = useState<readonly StudioPlugin[] | null>(null);

	useEffect(() => {
		if (!transport) {
			setPlugins(null);
			return;
		}
		let cancelled = false;
		setStatus({ kind: "connecting" });
		void (async () => {
			const [{ createCollabPlugin }, { createCollabStudioPlugin }] =
				await Promise.all([
					import("@anvilkit/collab-ui"),
					import("../../lib/collab-studio-plugin"),
				]);
			if (cancelled) return;
			// Tee the transport's status emits into the page badge while
			// still forwarding them to the plugin's sync indicator.
			const connectionSource = transport.connectionSource
				? (emit: (next: ConnectionStatus) => void) =>
						// biome-ignore lint/style/noNonNullAssertion: guarded above
						transport.connectionSource!((next) => {
							setStatus(next);
							emit(next);
						})
				: undefined;
			const collabPlugin = createCollabPlugin({
				doc: transport.doc,
				awareness: transport.awareness,
				connectionSource,
				self: identity,
				puckConfig: demoConfig as unknown as Config,
				onIdentityChange: (next) => {
					if (
						typeof next.displayName === "string" &&
						next.displayName.length > 0
					) {
						setDisplayName(next.displayName);
					}
				},
				presence: {
					className: "!fixed z-[9999]",
					showCursors: true,
					resolveSelectionRect: resolvePuckSelectionRect,
				},
			});
			setPlugins([collabPlugin, createCollabStudioPlugin()]);
		})();
		return () => {
			cancelled = true;
		};
	}, [transport, identity, setDisplayName]);

	const statusLabel = useMemo(() => describeStatus(status), [status]);

	return (
		<main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
			<header className="flex flex-col gap-3">
				<p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
					Anvilkit × Puck — Collaboration
				</p>
				<h1 className="text-2xl font-semibold">
					Live collaboration (Hocuspocus transport)
				</h1>
				<p className="max-w-3xl text-sm text-muted-foreground">
					This page wires <code>createCollabHocuspocusTransport</code> into{" "}
					<code>&lt;Studio&gt;</code> via the consolidated{" "}
					<code>createCollabPlugin()</code> factory — the client side of Path C
					in the plugin-collab-yjs backend guide (
					<code>docs/api/plugin-collab-yjs-api.md</code>). Start the local
					Hocuspocus relay with <code>pnpm --filter demo relay:hocuspocus</code>{" "}
					(it must be Hocuspocus, not the y-websocket <code>pnpm relay</code>),
					then open this page in a second tab (or append <code>?peer=Name</code>
					) to see live cursors and edits.
				</p>
			</header>

			<section
				className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-card p-4 text-sm"
				data-testid="ak-collab-status"
			>
				<StatusBadge status={status} label={statusLabel} />
				<dl className="flex flex-wrap items-center gap-x-6 gap-y-1">
					<div className="flex items-center gap-2">
						<dt className="text-muted-foreground">Room</dt>
						<dd className="font-mono">{query?.room ?? "…"}</dd>
					</div>
					<div className="flex items-center gap-2">
						<dt className="text-muted-foreground">Relay</dt>
						<dd className="font-mono">{query?.url ?? "…"}</dd>
					</div>
					<div className="flex items-center gap-2">
						<dt className="text-muted-foreground">You</dt>
						<dd className="flex items-center gap-2">
							<span
								aria-hidden
								className="inline-block size-3 rounded-full"
								style={{ backgroundColor: identity.color }}
							/>
							{identity.displayName}
						</dd>
					</div>
				</dl>
			</section>

			<section className="min-h-[640px]" data-testid="ak-collab-studio">
				{plugins ? (
					<Studio
						storeId="demo-collab"
						puckConfig={demoConfig as unknown as Config}
						data={seedData}
						plugins={plugins}
						chrome="anvilkit"
					/>
				) : (
					<div className="flex min-h-[640px] items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
						{queryReady ? "Connecting to the collaboration relay…" : "Loading…"}
					</div>
				)}
			</section>
		</main>
	);
}

function describeStatus(status: ConnectionStatus): string {
	switch (status.kind) {
		case "synced":
			return "Synced";
		case "connecting":
			return "Connecting…";
		case "reconnecting":
			return `Reconnecting (attempt ${status.attempt})`;
		case "offline":
			return "Offline";
		case "error":
			return `Error: ${status.message}`;
	}
}

function StatusBadge({
	status,
	label,
}: {
	readonly status: ConnectionStatus;
	readonly label: string;
}) {
	const tone =
		status.kind === "synced"
			? "bg-green-500"
			: status.kind === "connecting" || status.kind === "reconnecting"
				? "bg-amber-500"
				: "bg-red-500";
	return (
		<span className="flex items-center gap-2 font-medium">
			<span
				aria-hidden
				className={`inline-block size-2.5 rounded-full ${tone}`}
			/>
			{label}
		</span>
	);
}

/**
 * Maps a Puck node id to its bounding rect in the parent document's
 * coordinate space so the presence selection ring can position itself
 * over the iframed canvas. Mirrors the helper in `app/puck/editor`.
 */
function resolvePuckSelectionRect(
	nodeId: string,
): { x: number; y: number; width: number; height: number } | null {
	if (typeof window === "undefined") return null;
	const iframe = document.querySelector<HTMLIFrameElement>(
		"iframe#preview-frame",
	);
	const doc = iframe?.contentDocument;
	if (!iframe || !doc) return null;
	const escaped =
		typeof CSS !== "undefined" && typeof CSS.escape === "function"
			? CSS.escape(nodeId)
			: nodeId.replace(/"/g, '\\"');
	const probe = doc.querySelector<HTMLElement>(
		`[data-rfd-draggable-id="${escaped}"], [data-puck-component-id="${escaped}"], [data-puck-id="${escaped}"], [data-id="${escaped}"], #${escaped}`,
	);
	if (!probe) return null;
	const inner = probe.getBoundingClientRect();
	const outer = iframe.getBoundingClientRect();
	return {
		x: inner.left + outer.left,
		y: inner.top + outer.top,
		width: inner.width,
		height: inner.height,
	};
}
