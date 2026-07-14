import type { StudioPlugin } from "@anvilkit/core";
import type {
	ConnectionSource,
	ConnectionStatus,
} from "@anvilkit/plugin-collab-yjs";
import type { Config } from "@puckeditor/core";
import type { Dispatch, SetStateAction } from "react";
import { useEffect, useState } from "react";

// Port of the local Hocuspocus relay that the `collabRelay()` Astro
// integration starts automatically during `astro dev` / `astro preview`
// (integrations/collab-relay.mjs). MUST stay in sync with its
// `DEFAULT_RELAY_PORT`. Overridable with PUBLIC_COLLAB_WS_PORT.
const COLLAB_RELAY_PORT = import.meta.env.PUBLIC_COLLAB_WS_PORT ?? "41234";
const COLLAB_DEFAULT_ROOM = "playground-room";
// Full URL of the PRODUCTION relay (deployed apps/collab).
// Set at build time on the docs deployment; when present it takes
// priority over the local dev-relay port so the deployed static site
// gets a real multi-user backend. Empty on local/un-configured builds.
const COLLAB_WS_URL = import.meta.env.PUBLIC_COLLAB_WS_URL?.trim() ?? "";
const COLLAB_WS_TOKEN = import.meta.env.PUBLIC_COLLAB_WS_TOKEN?.trim() ?? "";

const PEER_ADJECTIVES = [
	"Curious",
	"Daring",
	"Eager",
	"Gentle",
	"Jolly",
	"Keen",
	"Lively",
	"Nimble",
	"Playful",
	"Quick",
	"Sunny",
	"Swift",
	"Witty",
	"Bright",
] as const;
const PEER_ANIMALS = [
	"Falcon",
	"Otter",
	"Panda",
	"Lynx",
	"Heron",
	"Badger",
	"Puffin",
	"Quokka",
	"Raven",
	"Seal",
	"Tapir",
	"Wombat",
	"Yak",
	"Zebra",
] as const;

function randomPeerName(): string {
	const adjective =
		PEER_ADJECTIVES[Math.floor(Math.random() * PEER_ADJECTIVES.length)];
	const animal = PEER_ANIMALS[Math.floor(Math.random() * PEER_ANIMALS.length)];
	return `${adjective} ${animal}`;
}

// Stable local peer identity for the collaboration demo. Generated once
// at module load; the island is `client:only`, so there is no SSR pass
// to diverge from.
const playgroundPeer = {
	id: `playground-${Math.random().toString(36).slice(2, 10)}`,
	displayName: "You",
	color: "#6366f1",
};

export type CollabMode = "off" | "relay" | "memory";

/**
 * Briefly open a raw WebSocket to decide whether the local relay is
 * reachable before committing to the Hocuspocus transport. Avoids the
 * provider's perpetual reconnect noise on the deployed static site,
 * where no relay exists and we should silently fall back to in-memory.
 */
function probeWebSocket(url: string, timeoutMs: number): Promise<boolean> {
	return new Promise((resolve) => {
		let settled = false;
		let socket: WebSocket | null = null;
		const finish = (ok: boolean) => {
			if (settled) return;
			settled = true;
			window.clearTimeout(timer);
			try {
				socket?.close();
			} catch {
				// noop
			}
			resolve(ok);
		};
		const timer = window.setTimeout(() => finish(false), timeoutMs);
		try {
			socket = new WebSocket(url);
		} catch {
			finish(false);
			return;
		}
		socket.onopen = () => finish(true);
		socket.onerror = () => finish(false);
		socket.onclose = () => finish(false);
	});
}

export type UsePlaygroundCollabResult = {
	collabPlugins: readonly StudioPlugin[] | null;
	collabMode: CollabMode;
	collabStatus: ConnectionStatus | null;
};

/**
 * Opt-in collaboration (`?collab=1`). Prefers the embedded Hocuspocus
 * relay that the `collabRelay()` Astro integration auto-starts during
 * `astro dev` / `astro preview` (real multi-tab backend), and falls
 * back to an in-memory single-tab transport when no relay answers —
 * e.g. the deployed static site, which can't host a WebSocket. The
 * yjs / @hocuspocus/provider stack and the collab-ui factories are
 * dynamically imported so they stay out of the default chunk.
 */
export function usePlaygroundCollab(
	playgroundConfig: Config,
	setSaveStatus: Dispatch<SetStateAction<string>>,
): UsePlaygroundCollabResult {
	// Collaboration plugins resolve asynchronously (Yjs transport + the
	// consolidated `createCollabPlugin()` factory), and only when the page is
	// opened with `?collab=1`. Null until then.
	//
	// The playground intentionally stays on **BYO transport** (passing
	// `doc`/`awareness`/`connectionSource`) rather than the `websocketUrl`
	// one-liner: it tees the transport's `ConnectionStatus` into a page-level
	// badge + mode/save indicators (see the `connectionSource` wrapper below).
	// The one-liner owns the transport and does not expose that status stream
	// to the host yet (a `useCollabStatus`-at-host hook is deferred — PRD §11),
	// exactly like the demo's `/collab` route.
	const [collabPlugins, setCollabPlugins] = useState<
		readonly StudioPlugin[] | null
	>(null);
	// Which transport backs the collab session: a real Hocuspocus relay
	// (multi-tab) or the in-memory single-tab fallback. `off` until
	// `?collab=1` resolves.
	const [collabMode, setCollabMode] = useState<CollabMode>("off");
	const [collabStatus, setCollabStatus] = useState<ConnectionStatus | null>(
		null,
	);

	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		if (params.get("collab") !== "1") return;

		const room = params.get("room") || COLLAB_DEFAULT_ROOM;
		const peerOverride = params.get("peer")?.trim();
		// Distinct id per tab so two tabs of the same browser appear as
		// separate peers; distinct name so cursors are tellable apart.
		const self = {
			id: `playground-${Math.random().toString(36).slice(2, 10)}`,
			displayName:
				peerOverride && peerOverride.length > 0
					? peerOverride.slice(0, 64)
					: randomPeerName(),
			color: playgroundPeer.color,
		};

		let cancelled = false;
		let destroy: (() => void) | null = null;
		void (async () => {
			try {
				let relayUrl: string;
				let relayToken: string;
				let relayReachable: boolean;
				if (COLLAB_WS_URL) {
					// Production relay (apps/collab on Fly). Works over
					// wss on the https docs site; longer probe budget for the real
					// round-trip / a possible scale-to-zero cold start.
					relayUrl = COLLAB_WS_URL;
					relayToken = COLLAB_WS_TOKEN;
					relayReachable = await probeWebSocket(relayUrl, 4000);
				} else {
					// Local dev relay (collabRelay() Astro integration), plain ws.
					// On an https page with no prod URL it can't exist, so skip the
					// probe (it would only stall + log) and fall back to in-memory.
					relayUrl = `ws://${window.location.hostname}:${COLLAB_RELAY_PORT}`;
					relayToken = "";
					relayReachable =
						window.location.protocol === "https:"
							? false
							: await probeWebSocket(relayUrl, 1500);
				}
				if (cancelled) return;

				const {
					createCollabHocuspocusTransport,
					createInMemoryCollabTransport,
				} = await import("./collab-transport");
				if (cancelled) return;

				const transport = relayReachable
					? await createCollabHocuspocusTransport({
							url: relayUrl,
							room,
							token: relayToken,
						})
					: await createInMemoryCollabTransport();
				if (cancelled) {
					transport.destroy();
					return;
				}
				destroy = transport.destroy;

				const [{ createCollabPlugin }, { createCollabStudioPlugin }] =
					await Promise.all([
						import("@anvilkit/collab-ui"),
						import("./collab-studio-plugin"),
					]);
				if (cancelled) {
					transport.destroy();
					destroy = null;
					return;
				}

				// Tee the transport's status emits into the page badge while
				// still forwarding them to the plugin's sync indicator. Capture
				// the source in a local so the closure doesn't re-narrow.
				const source = transport.connectionSource;
				const connectionSource: ConnectionSource | undefined = source
					? (emit) =>
							source((next) => {
								setCollabStatus(next);
								emit(next);
							})
					: undefined;

				const collabPlugin = createCollabPlugin({
					doc: transport.doc,
					awareness: transport.awareness,
					connectionSource,
					self,
					puckConfig: playgroundConfig,
					// `createCollabStudioPlugin` below already broadcasts the local
					// cursor + selection together; opt out of the plugin's built-in
					// cursor publisher so the two writers don't clobber each other
					// (awareness replaces the whole presence frame per update).
					presence: { className: "!fixed z-[9999]", broadcastCursor: false },
				});
				// `createCollabStudioPlugin` reads the adapter from the
				// `<CollabUIProvider>` context the consolidated factory provides,
				// so it is registered *after* it (array order preserved).
				setCollabPlugins([collabPlugin, createCollabStudioPlugin()]);
				setCollabMode(relayReachable ? "relay" : "memory");
				setCollabStatus(
					relayReachable
						? { kind: "connecting" }
						: { kind: "synced", since: new Date().toISOString() },
				);
				setSaveStatus(
					relayReachable
						? `Collaboration enabled — Hocuspocus relay (room "${room}")`
						: "Collaboration enabled (in-memory fallback — relay not reachable)",
				);
			} catch (error) {
				console.error("[playground] collab init failed", error);
			}
		})();
		return () => {
			cancelled = true;
			destroy?.();
		};
		// `playgroundConfig` and `setSaveStatus` are stable across renders
		// (module-scope singleton / React setState identity), matching the
		// original inline effect's empty dependency array.
	}, []);

	return { collabPlugins, collabMode, collabStatus };
}
