"use client";

import type {
	ConnectionSource,
	ConnectionStatus,
} from "@anvilkit/plugin-collab-yjs";
// Type-only imports so the yjs / y-protocols / y-websocket stack is NOT
// pulled into the default editor bundle. The constructors are loaded via
// dynamic `import()` inside the factories below, which only run under
// `?collab=1` (off by default).
import type { Awareness } from "y-protocols/awareness";
import type { WebsocketProvider } from "y-websocket";
import type { Doc as YDoc } from "yjs";

/**
 * Minimal transport bundle for the consolidated `createCollabPlugin()`
 * factory from `@anvilkit/collab-ui`. The factory owns adapter and data
 * plugin construction; this bundle only owns what the host genuinely
 * controls: the `Y.Doc`, the `Awareness` channel, the optional
 * `WebsocketProvider`, and a `destroy()` to tear them down.
 */
export interface CollabTransportBundle {
	readonly doc: YDoc;
	readonly awareness: Awareness;
	/**
	 * Present only on the relay variant. In-memory transports omit it.
	 */
	readonly provider?: WebsocketProvider;
	/**
	 * Forwarded into `createCollabPlugin({ connectionSource })`. Hosts
	 * with no provider can omit it; the factory falls back to a sensible
	 * default in-memory status.
	 */
	readonly connectionSource?: ConnectionSource;
	readonly destroy: () => void;
}

/**
 * In-memory transport. Y.Doc lives only in the current tab; useful for
 * dogfooding the SnapshotAdapter wiring without a WebSocket relay.
 */
export async function createCollabDemoTransport(): Promise<CollabTransportBundle> {
	const { Doc } = await import("yjs");
	const { Awareness: AwarenessClass } = await import("y-protocols/awareness");
	const doc = new Doc();
	const awareness = new AwarenessClass(doc);
	return {
		doc,
		awareness,
		destroy() {
			awareness.destroy();
			doc.destroy();
		},
	};
}

export interface CreateCollabRelayTransportOptions {
	readonly room: string;
	readonly relayUrl: string;
}

/**
 * y-websocket-backed transport. Maps the provider's `status`/`sync`
 * events into the `ConnectionStatus` contract the plugin's
 * `<SyncActivityIndicator />` reads, so the indicator shows the right
 * state without leaking provider-specific fields.
 */
export async function createCollabRelayTransport(
	options: CreateCollabRelayTransportOptions,
): Promise<CollabTransportBundle> {
	const { Doc } = await import("yjs");
	const { Awareness: AwarenessClass } = await import("y-protocols/awareness");
	const { WebsocketProvider: WebsocketProviderClass } = await import(
		"y-websocket"
	);
	const doc = new Doc();
	const awareness = new AwarenessClass(doc);
	const provider = new WebsocketProviderClass(
		options.relayUrl,
		options.room,
		doc,
		{
			awareness,
			connect: true,
		},
	);

	let queuedEdits = 0;
	doc.on("update", (_update: Uint8Array, origin: unknown) => {
		if (origin && typeof origin === "object" && "id" in origin) {
			if (provider.wsconnected === false) queuedEdits += 1;
			else queuedEdits = 0;
		}
	});

	const connectionSource: ConnectionSource = (emit) => {
		const handleStatus = (event: { status: string }) => {
			emit(mapProviderStatus(event.status, queuedEdits));
		};
		const handleSync = (synced: boolean) => {
			if (synced) {
				queuedEdits = 0;
				emit({ kind: "synced", since: new Date().toISOString() });
			}
		};
		const handleConnectionError = (event: Event) => {
			emit({
				kind: "error",
				message:
					event instanceof CloseEvent
						? `WebSocket closed (${event.code})`
						: "WebSocket error",
				recoverable: true,
			});
		};
		provider.on("status", handleStatus);
		provider.on("sync", handleSync);
		provider.on("connection-error", handleConnectionError);
		return () => {
			provider.off("status", handleStatus);
			provider.off("sync", handleSync);
			provider.off("connection-error", handleConnectionError);
		};
	};

	return {
		doc,
		awareness,
		provider,
		connectionSource,
		destroy() {
			provider.destroy();
			awareness.destroy();
			doc.destroy();
		},
	};
}

export interface CreateCollabHocuspocusTransportOptions {
	readonly room: string;
	/** Hocuspocus relay WebSocket URL, e.g. `ws://localhost:1234`. */
	readonly url: string;
	/** Auth token forwarded to the relay's `onAuthenticate` hook. */
	readonly token?: string;
}

/**
 * Hocuspocus-backed transport — the client side of docs Path C
 * (`docs/api/plugin-collab-yjs-api.md`: Hocuspocus relay in front of a
 * Java/Node backend).
 *
 * Mirrors {@link createCollabRelayTransport}: the host constructs the
 * provider eagerly (its lifecycle is owned by the bundle's `destroy()`)
 * and — critically — the `Awareness` the adapter reads presence from is
 * the SAME instance the provider syncs over the wire. We pass it into
 * the provider config so remote cursors/presence actually flow. Letting
 * `HocuspocusProvider` mint its own awareness (the easy mistake when
 * following the README's `{ document: doc }`-only snippet) leaves the
 * adapter's channel disconnected and silently breaks presence.
 */
export async function createCollabHocuspocusTransport(
	options: CreateCollabHocuspocusTransportOptions,
): Promise<CollabTransportBundle> {
	const { Doc } = await import("yjs");
	const { Awareness: AwarenessClass } = await import("y-protocols/awareness");
	const { HocuspocusProvider: HocuspocusProviderClass } = await import(
		"@hocuspocus/provider"
	);
	const doc = new Doc();
	const awareness = new AwarenessClass(doc);
	const provider = new HocuspocusProviderClass({
		url: options.url,
		name: options.room,
		document: doc,
		// Share the adapter's awareness instance — see the doc comment.
		awareness,
		token: options.token ?? "",
	});

	const connectionSource: ConnectionSource = (emit) => {
		// HocuspocusProvider's event payloads are loosely typed (`Function`),
		// so we narrow each handler's argument shape inline.
		const handleStatus = ({ status }: { status: string }) => {
			emit(mapHocuspocusStatus(status));
		};
		const handleSynced = () => {
			emit({ kind: "synced", since: new Date().toISOString() });
		};
		const handleDisconnect = () => {
			emit({
				kind: "offline",
				since: new Date().toISOString(),
				queuedEdits: 0,
			});
		};
		const handleAuthFailed = ({ reason }: { reason: string }) => {
			emit({
				kind: "error",
				message: `Authentication failed: ${reason}`,
				recoverable: false,
			});
		};
		provider.on("status", handleStatus);
		provider.on("synced", handleSynced);
		provider.on("disconnect", handleDisconnect);
		provider.on("authenticationFailed", handleAuthFailed);
		// The provider connects EAGERLY in the factory above, but the
		// adapter only invokes this source after its dynamic `import()`
		// resolves — by which point the initial `status: connected` /
		// `synced` events have usually already fired and are missed. On a
		// fast (localhost) relay that leaves the indicator stuck on
		// "connecting" forever even though the socket is live and synced.
		// Emit the CURRENT state synchronously on attach so we don't depend
		// on catching those one-shot events.
		if (provider.isSynced) {
			emit({ kind: "synced", since: new Date().toISOString() });
		} else if (
			provider.configuration.websocketProvider?.status === "disconnected"
		) {
			emit({
				kind: "offline",
				since: new Date().toISOString(),
				queuedEdits: 0,
			});
		} else {
			emit({ kind: "connecting" });
		}
		return () => {
			provider.off("status", handleStatus);
			provider.off("synced", handleSynced);
			provider.off("disconnect", handleDisconnect);
			provider.off("authenticationFailed", handleAuthFailed);
		};
	};

	return {
		doc,
		awareness,
		connectionSource,
		destroy() {
			provider.destroy();
			awareness.destroy();
			doc.destroy();
		},
	};
}

function mapHocuspocusStatus(status: string): ConnectionStatus {
	// WebSocketStatus enum values are the string literals compared here,
	// so we avoid importing the enum at runtime.
	switch (status) {
		case "connected":
			return { kind: "synced", since: new Date().toISOString() };
		case "connecting":
			return { kind: "connecting" };
		case "disconnected":
			return {
				kind: "offline",
				since: new Date().toISOString(),
				queuedEdits: 0,
			};
		default:
			return { kind: "reconnecting", attempt: 1, backoffMs: 250 };
	}
}

function mapProviderStatus(
	status: string,
	queuedEdits: number,
): ConnectionStatus {
	switch (status) {
		case "connected":
			return { kind: "synced", since: new Date().toISOString() };
		case "connecting":
			return { kind: "connecting" };
		case "disconnected":
			return {
				kind: "offline",
				since: new Date().toISOString(),
				queuedEdits,
			};
		default:
			return {
				kind: "reconnecting",
				attempt: 1,
				backoffMs: 250,
			};
	}
}
